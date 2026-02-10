import { Api } from "telegram";
import { getTelegramClient } from "./client.js";
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

let isPolling = false;

/**
 * Trigger immediate sync for a newly added channel (runs in background).
 */
export function triggerChannelSync(channel: { id: number; username: string }) {
  console.log(`[Poller] Triggering immediate sync for @${channel.username}`);
  initialSync(channel).catch((err) =>
    console.error(`[Poller] Immediate sync failed for @${channel.username}:`, err)
  );
}

export function startPoller() {
  console.log(
    `Poller started (interval: ${config.poller.intervalMs}ms, initial sync: ${config.poller.initialSyncDays} days)`
  );

  // First poll immediately (catch-up after restart)
  runPoll();

  // Then schedule recurring polls
  function scheduleNext() {
    setTimeout(() => {
      runPoll().finally(scheduleNext);
    }, config.poller.intervalMs);
  }
  scheduleNext();
}

async function runPoll() {
  if (isPolling) {
    console.log("Poll skipped — previous poll still running");
    return;
  }
  isPolling = true;
  try {
    await pollAllChannels();
  } catch (err) {
    console.error("Poll error:", err);
  } finally {
    isPolling = false;
  }
}

async function pollAllChannels() {
  const channels = await getActiveChannels();
  if (channels.length === 0) return;

  for (const channel of channels) {
    try {
      if (channel.lastCheckedMsgId === null) {
        await initialSync(channel);
      } else {
        await incrementalPoll(channel as typeof channel & { lastCheckedMsgId: number });
      }
    } catch (err) {
      console.error(`Poll error for @${channel.username}:`, err);
    }
  }
}

async function initialSync(channel: { id: number; username: string }) {
  console.log(`Initial sync for @${channel.username}...`);

  const client = await getTelegramClient();
  const entity = await client.getEntity(channel.username);
  if (!(entity instanceof Api.Channel)) {
    console.error(`@${channel.username} is not a channel, skipping`);
    return;
  }

  const since = new Date();
  since.setDate(since.getDate() - config.poller.initialSyncDays);

  let maxMsgId = 0;
  let count = 0;

  for await (const message of client.iterMessages(entity, { limit: undefined })) {
    // Stop when messages are older than the sync window
    if (message.date) {
      const msgDate = new Date(message.date * 1000);
      if (msgDate < since) break;
    }

    // Track max message ID regardless of content
    if (message.id > maxMsgId) maxMsgId = message.id;

    // Use message.message (clean text), NOT message.text
    const text = (message as Api.Message).message || "";
    if (!text.trim()) continue; // Skip media-only

    const entities = parseGramJSEntities((message as Api.Message).entities);

    try {
      const post = await createPost({
        channelId: channel.id,
        telegramMsgId: message.id,
        originalText: text,
        entities: entities as any,
        createdAt: message.date ? new Date(message.date * 1000) : undefined,
        isHistorical: true,
      });

      await downloadMessageMedia(client, message as Api.Message, post.id, channel.id);
      count++;
    } catch (err) {
      console.error(`Failed to save message ${message.id} for @${channel.username}:`, err);
    }
  }

  // If no messages found in the sync window, get the latest message ID from the channel
  // so that incrementalPoll doesn't fetch ALL history (minId: 0 bug)
  if (maxMsgId === 0) {
    const dbMax = await getMaxTelegramMsgId(channel.id);
    if (dbMax) {
      maxMsgId = dbMax;
    } else {
      // No posts in DB either — get the very latest message ID from Telegram
      // so we only track new messages going forward
      for await (const msg of client.iterMessages(entity, { limit: 1 })) {
        maxMsgId = msg.id;
      }
    }
  }

  await updateLastCheckedMsgId(channel.id, maxMsgId || null);
  console.log(`Initial sync for @${channel.username} done: ${count} posts saved, lastCheckedMsgId=${maxMsgId || "null"}`);
}

async function incrementalPoll(channel: { id: number; username: string; lastCheckedMsgId: number }) {
  const client = await getTelegramClient();
  const entity = await client.getEntity(channel.username);
  if (!(entity instanceof Api.Channel)) return;

  // Collect new messages (returned newest-first)
  const messages: Api.Message[] = [];
  for await (const msg of client.iterMessages(entity, { minId: channel.lastCheckedMsgId })) {
    messages.push(msg as Api.Message);
  }

  if (messages.length === 0) return;

  // Process oldest-first so lastCheckedMsgId advances correctly
  messages.reverse();

  let newMaxId = channel.lastCheckedMsgId;

  for (const message of messages) {
    if (message.id > newMaxId) newMaxId = message.id;

    const text = message.message || "";
    if (!text.trim()) continue; // Skip media-only, but ID still advances

    const entities = parseGramJSEntities(message.entities);

    try {
      const post = await createPost({
        channelId: channel.id,
        telegramMsgId: message.id,
        originalText: text,
        entities: entities as any,
        createdAt: message.date ? new Date(message.date * 1000) : undefined,
        isHistorical: false,
      });

      await downloadMessageMedia(client, message, post.id, channel.id);

      // Translate if not already translated (listener may have handled it)
      if (!post.translatedText) {
        const html = entitiesToTelegramHtml(text, entities);
        try {
          const translated = await translateText(html);
          const verified = await verifyTranslation(html, translated);
          await updateTranslation(post.id, verified);
          console.log(`[Poller] Translated post #${post.id} from @${channel.username}`);
        } catch (err) {
          console.error(`[Poller] Translation failed for post #${post.id}:`, err);
        }
      }
    } catch (err) {
      console.error(`[Poller] Failed to save message ${message.id} for @${channel.username}:`, err);
    }
  }

  await updateLastCheckedMsgId(channel.id, newMaxId);
  console.log(
    `[Poller] @${channel.username}: ${messages.length} new message(s), lastCheckedMsgId=${newMaxId}`
  );
}
