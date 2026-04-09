import { NewMessage, NewMessageEvent } from "telegram/events/index.js";
import { Api } from "telegram";
import { getTelegramClient } from "./client.js";
import { parseGramJSEntities, entitiesToTelegramHtml } from "./formatter.js";
import { getActiveChannels, createPost } from "../db/repository.js";
import { downloadMessageMedia } from "../media/downloader.js";
import { translateText, verifyTranslation } from "../translator/llm.js";
import { updateTranslation } from "../db/repository.js";

// Buffer grouped messages for a short window before processing
const groupBuffer = new Map<string, { messages: Api.Message[]; timer: ReturnType<typeof setTimeout>; channelDbId: number }>();
const GROUP_WAIT_MS = 1500; // wait 1.5s for more messages in the same album

export async function startListener() {
  const client = await getTelegramClient();
  const channels = await getActiveChannels();

  if (channels.length === 0) {
    console.log("No active channels to monitor. Add channels via the admin panel.");
  }

  const channelLabels = channels.map((c) => c.username || `id:${c.telegramId}`);
  console.log(`Monitoring ${channelLabels.length} channels:`, channelLabels);

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      await handleNewMessage(event);
    } catch (err) {
      console.error("Error handling message:", err);
    }
  }, new NewMessage({}));

  console.log("Listener started — waiting for new messages...");
}

async function handleNewMessage(event: NewMessageEvent) {
  const message = event.message;
  if (!message || !message.peerId) return;

  if (!(message.peerId instanceof Api.PeerChannel)) return;

  const tgChannelId = message.peerId.channelId.valueOf();
  const fullTgId = `-100${tgChannelId}`;

  const client = await getTelegramClient();
  let entity: Api.Channel | undefined;
  try {
    const fullEntity = await client.getEntity(message.peerId);
    if (fullEntity instanceof Api.Channel) {
      entity = fullEntity;
    }
  } catch {
    // Can't resolve entity — still try matching by telegramId below
  }

  const channels = await getActiveChannels();
  const dbChannel = channels.find((c) => {
    if (c.telegramId && c.telegramId === fullTgId) return true;
    if (c.username && entity?.username && c.username.toLowerCase() === entity.username.toLowerCase()) return true;
    return false;
  });
  if (!dbChannel) return;

  // If this message is part of an album (grouped), buffer it
  if (message.groupedId) {
    const groupKey = `${dbChannel.id}_${message.groupedId}`;
    const existing = groupBuffer.get(groupKey);
    if (existing) {
      existing.messages.push(message);
      // Reset the timer — wait for more messages
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        groupBuffer.delete(groupKey);
        processGroupedMessages(existing.messages, dbChannel.id).catch((err) =>
          console.error("Error processing grouped messages:", err)
        );
      }, GROUP_WAIT_MS);
    } else {
      const timer = setTimeout(() => {
        const buf = groupBuffer.get(groupKey);
        if (buf) {
          groupBuffer.delete(groupKey);
          processGroupedMessages(buf.messages, dbChannel.id).catch((err) =>
            console.error("Error processing grouped messages:", err)
          );
        }
      }, GROUP_WAIT_MS);
      groupBuffer.set(groupKey, { messages: [message], timer, channelDbId: dbChannel.id });
    }
    return;
  }

  // Single message (not grouped) — process immediately
  await processSingleMessage(message, dbChannel.id);
}

async function processSingleMessage(message: Api.Message, channelDbId: number) {
  const text = message.message || "";
  if (!text.trim()) return;

  const label = `msg:${message.id}`;
  console.log(`New post ${label}: ${text.substring(0, 80)}...`);

  const entities = parseGramJSEntities(message.entities);
  const client = await getTelegramClient();

  const post = await createPost({
    channelId: channelDbId,
    telegramMsgId: message.id,
    originalText: text,
    entities: entities as any,
    createdAt: message.date ? new Date(message.date * 1000) : undefined,
  });

  await downloadMessageMedia(client, message, post.id, channelDbId);

  const html = entitiesToTelegramHtml(text, entities);
  try {
    const translated = await translateText(html);
    const verified = await verifyTranslation(html, translated);
    await updateTranslation(post.id, verified);
    console.log(`Translated post #${post.id}`);
  } catch (err) {
    console.error(`Translation failed for post #${post.id}:`, err);
  }
}

async function processGroupedMessages(messages: Api.Message[], channelDbId: number) {
  // Find the message with text (caption of the album)
  const primary = messages.find((m) => m.message?.trim()) || messages[0];
  const text = primary.message || "";

  // Even if there's no text, we might still want to save the media group
  // But for consistency with the rest of the system, skip text-less groups
  if (!text.trim()) return;

  console.log(`New album (${messages.length} items): ${text.substring(0, 80)}...`);

  const entities = parseGramJSEntities(primary.entities);
  const client = await getTelegramClient();

  const post = await createPost({
    channelId: channelDbId,
    telegramMsgId: primary.id,
    originalText: text,
    entities: entities as any,
    createdAt: primary.date ? new Date(primary.date * 1000) : undefined,
  });

  // Download media from ALL messages in the album
  for (const msg of messages) {
    await downloadMessageMedia(client, msg, post.id, channelDbId);
  }

  const html = entitiesToTelegramHtml(text, entities);
  try {
    const translated = await translateText(html);
    const verified = await verifyTranslation(html, translated);
    await updateTranslation(post.id, verified);
    console.log(`Translated album post #${post.id}`);
  } catch (err) {
    console.error(`Translation failed for album post #${post.id}:`, err);
  }
}
