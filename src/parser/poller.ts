import { Api } from "telegram";
import bigInt from "big-integer";
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
import { groupMessages, MessageGroup } from "./grouper.js";

let isPolling = false;

type ChannelRow = { id: number; username: string | null; telegramId: string | null };

function channelLabel(channel: ChannelRow): string {
  return channel.username ? `@${channel.username}` : `id:${channel.telegramId}`;
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
  const entity = await client.getEntity(identifier);
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
      console.error(`Poll error for ${channelLabel(channel)}:`, err);
    }
  }
}

async function initialSync(channel: ChannelRow) {
  console.log(`Initial sync for ${channelLabel(channel)}...`);

  const client = await getTelegramClient();
  const entity = await resolveChannelEntity(channel);
  if (!entity) return;

  const since = new Date();
  since.setDate(since.getDate() - config.poller.initialSyncDays);

  // Collect all messages in the sync window first, then group them
  const allMessages: Api.Message[] = [];
  let maxMsgId = 0;

  for await (const message of client.iterMessages(entity, { limit: undefined })) {
    if (message.date) {
      const msgDate = new Date(message.date * 1000);
      if (msgDate < since) break;
    }
    if (message.id > maxMsgId) maxMsgId = message.id;
    allMessages.push(message as Api.Message);
  }

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
      for await (const msg of client.iterMessages(entity, { limit: 1 })) {
        maxMsgId = msg.id;
      }
    }
  }

  await updateLastCheckedMsgId(channel.id, maxMsgId || null);
  console.log(`Initial sync for ${channelLabel(channel)} done: ${count} posts saved, lastCheckedMsgId=${maxMsgId || "null"}`);
}

async function incrementalPoll(channel: ChannelRow & { lastCheckedMsgId: number }) {
  const client = await getTelegramClient();
  const entity = await resolveChannelEntity(channel);
  if (!entity) return;

  const messages: Api.Message[] = [];
  for await (const msg of client.iterMessages(entity, { minId: channel.lastCheckedMsgId })) {
    messages.push(msg as Api.Message);
  }

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
