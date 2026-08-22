import { Api } from "telegram";
import bigInt from "big-integer";
import { getTelegramClient, warmUpEntityCache } from "./client.js";
import { parseGramJSEntities, entitiesToTelegramHtml } from "./formatter.js";
import {
  getActiveChannels,
  createPost,
  updateLastCheckedMsgId,
  getMaxTelegramMsgId,
  updateTranslation,
} from "../db/repository.js";
import { downloadMessageMedia } from "../media/downloader.js";
import { translateText, verifyTranslation } from "../translator/llm.js";
import { config } from "../config.js";
import { withTimeout, isTimeoutError } from "../lib/timeout.js";
import { groupMessages, MessageGroup } from "./grouper.js";

let isPolling = false;
/** When the in-flight poll started — the watchdog needs it to spot a hang. */
let pollStartedAt = 0;
/** Guards against warming the entity cache once per failing channel per cycle. */
let lastEntityWarmUpAt = 0;
let cyclesSinceHeartbeat = 0;
let lastHeartbeatAt = Date.now();
/** channel db id -> timestamp until which we stop retrying an unresolvable peer. */
const unresolvableUntil = new Map<number, number>();

/** Deadline for a single Telegram round trip (entity lookup, message fetch). */
const TELEGRAM_CALL_TIMEOUT_MS = 120_000;
/** Deadline for one channel's whole poll, media downloads and translation included. */
const CHANNEL_POLL_TIMEOUT_MS = 15 * 60 * 1000;
/** Re-warming the entity cache more often than this is pointless churn. */
const ENTITY_WARMUP_COOLDOWN_MS = 10 * 60 * 1000;
/**
 * Backstop for the "previous poll still running" flag. Deliberately far above
 * any legitimate cycle (a 30-day initial sync downloads a lot of media) — the
 * per-call deadlines are the real fix, this only catches what they miss.
 */
const STUCK_POLL_LIMIT_MS = 2 * 60 * 60 * 1000;
/**
 * How long to leave a channel alone after its peer could not be resolved even
 * with a warm entity cache. That means the account is no longer a member — no
 * amount of retrying fixes it, and retrying every minute buried the real log.
 */
const UNRESOLVABLE_BACKOFF_MS = 30 * 60 * 1000;
/**
 * A quiet poller and a dead poller looked identical in the log — a cycle only
 * printed when a channel had new messages, which is exactly why the outage went
 * unnoticed for 16 hours. This proves liveness without a line every minute.
 */
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

type ChannelRow = { id: number; username: string | null; telegramId: string | null };

function channelLabel(channel: ChannelRow): string {
  return channel.username ? `@${channel.username}` : `id:${channel.telegramId}`;
}

/** Telegram cannot resolve a peer we have never seen — the entity cache is cold. */
function isUnknownEntityError(err: unknown): boolean {
  const message = (err as Error)?.message || "";
  return (
    message.includes("Could not find the input entity") ||
    message.includes("CHANNEL_INVALID") ||
    message.includes("PEER_ID_INVALID")
  );
}

async function resolveChannelEntity(channel: ChannelRow): Promise<Api.Channel | null> {
  const client = await getTelegramClient();
  let identifier: string | Api.PeerChannel;
  if (channel.telegramId) {
    const raw = channel.telegramId.replace(/^-100/, "");
    identifier = new Api.PeerChannel({ channelId: bigInt(raw) });
  } else if (channel.username) {
    identifier = channel.username;
  } else {
    console.error(`Channel #${channel.id} has no username or telegramId, skipping`);
    return null;
  }

  const fetchEntity = (label: string) =>
    withTimeout(client.getEntity(identifier), TELEGRAM_CALL_TIMEOUT_MS, label);

  const entity = await fetchEntity(`getEntity(${channelLabel(channel)})`).catch(async (err) => {
    // Channels stored by numeric id have no cached access_hash after a restart,
    // which is what CHANNEL_INVALID means here. Pulling the dialog list teaches
    // the client about them; retry once.
    if (!isUnknownEntityError(err)) throw err;
    if (Date.now() - lastEntityWarmUpAt > ENTITY_WARMUP_COOLDOWN_MS) {
      lastEntityWarmUpAt = Date.now();
      console.warn(
        `[Poller] ${channelLabel(channel)} is not in the entity cache — warming it up and retrying`
      );
      await warmUpEntityCache(client);
    }
    return fetchEntity(`getEntity(${channelLabel(channel)}) retry`).catch((retryErr) => {
      if (!isUnknownEntityError(retryErr)) throw retryErr;
      unresolvableUntil.set(channel.id, Date.now() + UNRESOLVABLE_BACKOFF_MS);
      throw new Error(
        `${channelLabel(channel)} could not be resolved even with a warm entity cache — the account is probably not a member of it any more. Rejoin the channel or deactivate it in the admin panel. Retrying in ${Math.round(UNRESOLVABLE_BACKOFF_MS / 60000)} min.`
      );
    });
  });

  unresolvableUntil.delete(channel.id);

  if (!(entity instanceof Api.Channel)) {
    console.error(`${channelLabel(channel)} is not a channel, skipping`);
    return null;
  }
  return entity;
}

async function processGroup(
  client: import("telegram").TelegramClient,
  group: MessageGroup,
  channelId: number,
  channelLabel: string,
  options: { isHistorical: boolean; translate: boolean }
): Promise<void> {
  const { primary, all } = group;
  const text = primary.message || "";
  if (!text.trim()) return; // Skip groups with no text at all

  const entities = parseGramJSEntities(primary.entities);

  const post = await createPost({
    channelId,
    telegramMsgId: primary.id,
    originalText: text,
    entities: entities as any,
    createdAt: primary.date ? new Date(primary.date * 1000) : undefined,
    isHistorical: options.isHistorical,
  });

  // Download media from ALL messages in the group
  for (const msg of all) {
    await downloadMessageMedia(client, msg, post.id, channelId);
  }

  // Translate if needed
  if (options.translate && !post.translatedText) {
    const html = entitiesToTelegramHtml(text, entities);
    try {
      const translated = await translateText(html);
      const verified = await verifyTranslation(html, translated.text);
      await updateTranslation(post.id, verified.text, translated.model);
      console.log(`[Poller] Translated post #${post.id} from ${channelLabel}`);
    } catch (err) {
      console.error(`[Poller] Translation failed for post #${post.id}:`, err);
    }
  }
}

/**
 * Trigger immediate sync for a newly added channel (runs in background).
 */
export function triggerChannelSync(channel: ChannelRow) {
  console.log(`[Poller] Triggering immediate sync for ${channelLabel(channel)}`);
  initialSync(channel).catch((err) =>
    console.error(`[Poller] Immediate sync failed for ${channelLabel(channel)}:`, err)
  );
}

export function startPoller() {
  console.log(
    `Poller started (interval: ${config.poller.intervalMs}ms, initial sync: ${config.poller.initialSyncDays} days)`
  );

  runPoll();

  // A self-chaining setTimeout (`runPoll().finally(scheduleNext)`) used to drive
  // this loop. When a Telegram call hung — which is what a dropped network does
  // to GramJS — `runPoll` never settled, the next timer was never armed, and the
  // poller stayed dead until a redeploy. A fixed interval keeps firing no matter
  // what the previous tick is doing; `runPoll` itself skips overlapping runs.
  setInterval(() => {
    releaseStuckPoll();
    runPoll();
  }, config.poller.intervalMs);
}

/**
 * Belt-and-braces for the skip guard: if a poll is somehow still "running" long
 * after any real poll could have finished, its promise is never coming back.
 * Drop the flag so the next tick can start a fresh cycle.
 */
function releaseStuckPoll() {
  if (!isPolling) return;
  const stuckFor = Date.now() - pollStartedAt;
  if (stuckFor > STUCK_POLL_LIMIT_MS) {
    console.error(
      `[Poller] Watchdog: poll has been running for ${Math.round(stuckFor / 1000)}s — abandoning it and starting a new cycle`
    );
    isPolling = false;
  }
}

async function runPoll() {
  if (isPolling) {
    console.log("Poll skipped — previous poll still running");
    return;
  }
  isPolling = true;
  pollStartedAt = Date.now();
  try {
    await pollAllChannels();
  } catch (err) {
    console.error("Poll error:", err);
  } finally {
    isPolling = false;
    heartbeat();
  }
}

function heartbeat() {
  cyclesSinceHeartbeat++;
  const elapsed = Date.now() - lastHeartbeatAt;
  if (elapsed < HEARTBEAT_INTERVAL_MS) return;
  console.log(
    `[Poller] Heartbeat: ${cyclesSinceHeartbeat} cycle(s) in the last ${Math.round(elapsed / 60000)} min`
  );
  cyclesSinceHeartbeat = 0;
  lastHeartbeatAt = Date.now();
}

async function pollAllChannels() {
  const channels = await getActiveChannels();
  if (channels.length === 0) return;

  for (const channel of channels) {
    const backoff = unresolvableUntil.get(channel.id) ?? 0;
    if (Date.now() < backoff) continue;

    try {
      const work =
        channel.lastCheckedMsgId === null
          ? initialSync(channel)
          : incrementalPoll(channel as typeof channel & { lastCheckedMsgId: number });
      // One unresponsive channel must not stall every channel behind it.
      await withTimeout(work, CHANNEL_POLL_TIMEOUT_MS, `poll ${channelLabel(channel)}`);
    } catch (err) {
      if (isTimeoutError(err)) {
        console.error(`[Poller] ${channelLabel(channel)} timed out — moving on:`, (err as Error).message);
      } else {
        console.error(`Poll error for ${channelLabel(channel)}:`, err);
      }
    }
  }
}

/** Drain an async message iterator under a single deadline. */
async function collectMessages(
  client: import("telegram").TelegramClient,
  entity: Api.Channel,
  params: Parameters<import("telegram").TelegramClient["iterMessages"]>[1],
  label: string,
  stopBefore?: Date
): Promise<{ messages: Api.Message[]; maxMsgId: number }> {
  const collect = async () => {
    const messages: Api.Message[] = [];
    let maxMsgId = 0;
    for await (const message of client.iterMessages(entity, params)) {
      if (stopBefore && message.date) {
        const msgDate = new Date(message.date * 1000);
        if (msgDate < stopBefore) break;
      }
      if (message.id > maxMsgId) maxMsgId = message.id;
      messages.push(message as Api.Message);
    }
    return { messages, maxMsgId };
  };

  return withTimeout(collect(), TELEGRAM_CALL_TIMEOUT_MS, label);
}

async function initialSync(channel: ChannelRow) {
  console.log(`Initial sync for ${channelLabel(channel)}...`);

  const client = await getTelegramClient();
  const entity = await resolveChannelEntity(channel);
  if (!entity) return;

  const since = new Date();
  since.setDate(since.getDate() - config.poller.initialSyncDays);

  // Collect all messages in the sync window first, then group them
  const collected = await collectMessages(
    client,
    entity,
    { limit: undefined },
    `iterMessages(${channelLabel(channel)} initial)`,
    since
  );
  const allMessages = collected.messages;
  let maxMsgId = collected.maxMsgId;

  // Reverse to oldest-first for correct grouping
  allMessages.reverse();

  const groups = groupMessages(allMessages);
  let count = 0;

  for (const group of groups) {
    try {
      await processGroup(client, group, channel.id, channelLabel(channel), {
        isHistorical: true,
        translate: false,
      });
      count++;
    } catch (err) {
      console.error(`Failed to save group (msg ${group.primary.id}) for ${channelLabel(channel)}:`, err);
    }
  }

  if (maxMsgId === 0) {
    const dbMax = await getMaxTelegramMsgId(channel.id);
    if (dbMax) {
      maxMsgId = dbMax;
    } else {
      const latest = await collectMessages(
        client,
        entity,
        { limit: 1 },
        `iterMessages(${channelLabel(channel)} latest)`
      );
      maxMsgId = latest.maxMsgId;
    }
  }

  await updateLastCheckedMsgId(channel.id, maxMsgId || null);
  console.log(`Initial sync for ${channelLabel(channel)} done: ${count} posts saved, lastCheckedMsgId=${maxMsgId || "null"}`);
}

async function incrementalPoll(channel: ChannelRow & { lastCheckedMsgId: number }) {
  const client = await getTelegramClient();
  const entity = await resolveChannelEntity(channel);
  if (!entity) return;

  const { messages } = await collectMessages(
    client,
    entity,
    { minId: channel.lastCheckedMsgId },
    `iterMessages(${channelLabel(channel)} incremental)`
  );

  if (messages.length === 0) return;

  // Process oldest-first
  messages.reverse();

  let newMaxId = channel.lastCheckedMsgId;

  const groups = groupMessages(messages);

  for (const group of groups) {
    // Track max ID from all messages in group
    for (const msg of group.all) {
      if (msg.id > newMaxId) newMaxId = msg.id;
    }

    try {
      await processGroup(client, group, channel.id, channelLabel(channel), {
        isHistorical: false,
        translate: true,
      });
    } catch (err) {
      console.error(`[Poller] Failed to save group (msg ${group.primary.id}) for ${channelLabel(channel)}:`, err);
    }
  }

  await updateLastCheckedMsgId(channel.id, newMaxId);
  console.log(
    `[Poller] ${channelLabel(channel)}: ${messages.length} new message(s), lastCheckedMsgId=${newMaxId}`
  );
}
