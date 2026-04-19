import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { config } from "../config.js";
import { getEncryptedSetting } from "../db/repository.js";
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
let botClient: TelegramClient | null = null;
let botClientToken: string | null = null;

export async function getTelegramClient(): Promise<TelegramClient> {
  if (client && client.connected) return client;

  const session = new StringSession(config.telegram.session);
  client = new TelegramClient(session, config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await ask("Phone number: "),
    password: async () => await ask("Password (2FA): "),
    phoneCode: async () => await ask("Code from Telegram: "),
    onError: (err) => console.error("Auth error:", err),
  });

  const sessionString = client.session.save() as unknown as string;
  if (sessionString && sessionString !== config.telegram.session) {
    console.log("\n=== Save this session string to .env as TELEGRAM_SESSION ===");
    console.log(sessionString);
    console.log("=============================================================\n");
  }

  return client;
}

export async function disconnectClient() {
  if (client) {
    await client.disconnect();
    client = null;
  }
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
