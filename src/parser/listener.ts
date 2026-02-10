import { NewMessage, NewMessageEvent } from "telegram/events/index.js";
import { Api } from "telegram";
import { getTelegramClient } from "./client.js";
import { parseGramJSEntities, entitiesToTelegramHtml } from "./formatter.js";
import { getActiveChannels, createPost } from "../db/repository.js";
import { downloadMessageMedia } from "../media/downloader.js";
import { translateText, verifyTranslation } from "../translator/llm.js";
import { updateTranslation } from "../db/repository.js";

export async function startListener() {
  const client = await getTelegramClient();
  const channels = await getActiveChannels();

  if (channels.length === 0) {
    console.log("No active channels to monitor. Add channels via the admin panel.");
    // Still keep listening — we'll pick up new channels dynamically
  }

  const channelUsernames = channels.map((c) => c.username);
  console.log(`Monitoring ${channelUsernames.length} channels:`, channelUsernames);

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

  // Only process channel posts
  if (!(message.peerId instanceof Api.PeerChannel)) return;

  const channelId = message.peerId.channelId.valueOf();

  // Resolve channel username
  const client = await getTelegramClient();
  let entity: Api.Channel | undefined;
  try {
    const fullEntity = await client.getEntity(message.peerId);
    if (fullEntity instanceof Api.Channel) {
      entity = fullEntity;
    }
  } catch {
    return;
  }

  if (!entity?.username) return;

  // Check if this channel is in our active list
  const channels = await getActiveChannels();
  const dbChannel = channels.find(
    (c) => c.username.toLowerCase() === entity!.username!.toLowerCase()
  );
  if (!dbChannel) return;

  // IMPORTANT: use message.message (clean text), NOT message.text
  // message.text applies parseMode.unparse() which inserts ** markers,
  // but entities have offsets for the clean text — using .text causes misalignment
  const text = message.message || "";
  if (!text.trim()) return; // Skip media-only posts without text

  console.log(`New post from @${dbChannel.username}: ${text.substring(0, 80)}...`);

  const entities = parseGramJSEntities(message.entities);

  // Save post to DB
  const post = await createPost({
    channelId: dbChannel.id,
    telegramMsgId: message.id,
    originalText: text,
    entities: entities as any,
    createdAt: message.date ? new Date(message.date * 1000) : undefined,
  });

  // Download media
  await downloadMessageMedia(client, message, post.id, dbChannel.id);

  // Translate (using Telegram HTML pipeline)
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
