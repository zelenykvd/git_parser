import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { EventBuilder } from "telegram/events/common.js";
import { config } from "../config.js";
import { getEncryptedSetting } from "../db/repository.js";
import { withTimeout } from "../lib/timeout.js";
import * as readline from "readline";

export const BOT_TOKEN_KEY = "telegram.botToken";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

let client: TelegramClient | null = null;
let clientReady: Promise<TelegramClient> | null = null;
let botClient: TelegramClient | null = null;
let botClientToken: string | null = null;

/** How long a login/reconnect may take before we give up on it. */
const CONNECT_TIMEOUT_MS = 90_000;
/** Warming the entity cache is best-effort — never let it block startup. */
const WARMUP_TIMEOUT_MS = 60_000;

// ——— Event handlers that must survive a reconnect ———
//
// `addEventHandler` binds to one TelegramClient instance. When the connection
// dies hard and we build a fresh client, handlers registered on the old one are
// gone — the listener goes silent while the process looks perfectly healthy.
// Registering through this list means every new client gets them back.

type PersistentHandler = { callback: (event: any) => void; event: EventBuilder };

const persistentHandlers: PersistentHandler[] = [];

/**
 * Register a Telegram event handler that is re-attached to every client this
 * module creates. Use instead of `client.addEventHandler` for long-lived
 * subscriptions (see `startListener`).
 */
export function addPersistentEventHandler(callback: (event: any) => void, event: EventBuilder): void {
  persistentHandlers.push({ callback, event });
  if (client) {
    try {
      client.addEventHandler(callback, event);
    } catch (err) {
      console.error("[Telegram] Could not attach event handler:", (err as Error).message);
    }
  }
}

function attachPersistentHandlers(target: TelegramClient): void {
  for (const handler of persistentHandlers) {
    try {
      target.addEventHandler(handler.callback, handler.event);
    } catch (err) {
      console.error("[Telegram] Could not re-attach event handler:", (err as Error).message);
    }
  }
  if (persistentHandlers.length > 0) {
    console.log(`[Telegram] Re-attached ${persistentHandlers.length} event handler(s)`);
  }
}

/**
 * Pull the dialog list so GramJS caches every channel's `access_hash`.
 *
 * Channels stored by numeric id (no username) cannot be resolved from a bare
 * `StringSession` — `getEntity` answers CHANNEL_INVALID until the client has
 * seen the peer once. Best-effort: failures only cost us the cache.
 */
export async function warmUpEntityCache(target?: TelegramClient): Promise<void> {
  const active = target ?? client;
  if (!active) return;
  try {
    const dialogs = await withTimeout(active.getDialogs({}), WARMUP_TIMEOUT_MS, "getDialogs");
    console.log(`[Telegram] Entity cache warmed up (${dialogs.length} dialogs)`);
  } catch (err) {
    console.warn("[Telegram] Entity cache warm-up failed:", (err as Error).message);
  }
}

async function createClient(): Promise<TelegramClient> {
  const session = new StringSession(config.telegram.session);
  const fresh = new TelegramClient(session, config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 5,
    retryDelay: 2000,
    autoReconnect: true,
    requestRetries: 3,
  });

  await withTimeout(
    fresh.start({
      phoneNumber: async () => await ask("Phone number: "),
      password: async () => await ask("Password (2FA): "),
      phoneCode: async () => await ask("Code from Telegram: "),
      onError: (err) => console.error("Auth error:", err),
    }),
    CONNECT_TIMEOUT_MS,
    "client.start"
  );

  const sessionString = fresh.session.save() as unknown as string;
  if (sessionString && sessionString !== config.telegram.session) {
    console.log("\n=== Save this session string to .env as TELEGRAM_SESSION ===");
    console.log(sessionString);
    console.log("=============================================================\n");
  }

  client = fresh;
  attachPersistentHandlers(fresh);
  // A brand-new client starts with an empty entity cache, so warm it before any
  // caller tries to resolve a channel by numeric id.
  await warmUpEntityCache(fresh);

  return fresh;
}

async function destroyClient(): Promise<void> {
  const dying = client;
  client = null;
  if (!dying) return;
  try {
    await withTimeout(dying.disconnect(), 15_000, "client.disconnect");
  } catch {
    /* the socket is already gone — nothing to salvage */
  }
  try {
    await withTimeout(dying.destroy(), 15_000, "client.destroy");
  } catch {
    /* ignore */
  }
}

export async function getTelegramClient(): Promise<TelegramClient> {
  if (client && client.connected) return client;
  // Concurrent callers (poller + listener + media repair) must not each build
  // their own client — that used to leak sockets on every network blip.
  if (clientReady) return clientReady;

  const pending = (async (): Promise<TelegramClient> => {
    if (client) {
      // A plain reconnect is cheaper than a fresh login and keeps the entity
      // cache, so try it before throwing the client away.
      try {
        await withTimeout(client.connect(), CONNECT_TIMEOUT_MS, "client.connect");
        if (client.connected) {
          console.log("[Telegram] Reconnected existing client");
          return client;
        }
      } catch (err) {
        console.warn("[Telegram] Reconnect failed, rebuilding client:", (err as Error).message);
      }
      await destroyClient();
    }
    return createClient();
  })();

  clientReady = pending;
  pending
    .catch(() => {
      /* surfaced to the caller through `pending` */
    })
    .finally(() => {
      if (clientReady === pending) clientReady = null;
    });

  return pending;
}

export async function disconnectClient() {
  await destroyClient();
}

/**
 * Periodically make sure the user client is still connected.
 *
 * The poller reconnects on its own schedule, but the listener does not: without
 * this it can sit on a dead client until something else happens to touch it.
 */
export function startConnectionWatchdog(intervalMs = 60_000): void {
  setInterval(() => {
    if (client && client.connected) return;
    if (clientReady) return;
    console.warn("[Telegram] Watchdog: client is not connected, reconnecting...");
    getTelegramClient().catch((err) =>
      console.error("[Telegram] Watchdog reconnect failed:", (err as Error).message)
    );
  }, intervalMs);
  console.log(`[Telegram] Connection watchdog started (every ${intervalMs}ms)`);
}

async function resolveBotToken(): Promise<string | null> {
  const stored = await getEncryptedSetting(BOT_TOKEN_KEY);
  if (stored) return stored;
  // Legacy fallback: env var TELEGRAM_BOT_TOKEN
  return config.telegram.botToken || null;
}

/**
 * Returns a TelegramClient authenticated as a bot. Bot tokens are required for
 * posting inline keyboard buttons — user accounts cannot attach them.
 * Throws if no token is configured via the admin panel (or env fallback).
 */
export async function getBotClient(): Promise<TelegramClient> {
  const token = await resolveBotToken();
  if (!token) {
    throw new Error(
      "Telegram bot token is not configured. Add it in the admin panel → Settings."
    );
  }

  // Invalidate cached client if token changed
  if (botClient && botClientToken !== token) {
    try { await botClient.disconnect(); } catch { /* ignore */ }
    botClient = null;
    botClientToken = null;
  }
  if (botClient && botClient.connected) return botClient;

  const session = new StringSession("");
  botClient = new TelegramClient(session, config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 5,
  });
  await botClient.start({ botAuthToken: token });
  botClientToken = token;
  return botClient;
}

export async function disconnectBotClient() {
  if (botClient) {
    try { await botClient.disconnect(); } catch { /* ignore */ }
    botClient = null;
    botClientToken = null;
  }
}

/**
 * Verify a bot token by creating a short-lived client and calling getMe().
 * Does not persist anything. Returns the bot's identity on success.
 */
export async function verifyBotToken(
  token: string
): Promise<{ id: string; username: string | null; firstName: string | null }> {
  const session = new StringSession("");
  const tmp = new TelegramClient(session, config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 2,
  });
  try {
    await tmp.start({ botAuthToken: token });
    const me = await tmp.getMe();
    const id = (me as any).id?.toString?.() ?? String((me as any).id);
    return {
      id,
      username: (me as any).username ?? null,
      firstName: (me as any).firstName ?? null,
    };
  } finally {
    try { await tmp.disconnect(); } catch { /* ignore */ }
  }
}
