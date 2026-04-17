import * as fs from "fs";
import * as path from "path";
import { Api } from "telegram";
import { getTelegramClient } from "../parser/client.js";
import { getPostsWithMedia, prisma } from "../db/repository.js";

const MEDIA_DIR = path.resolve("media");

/**
 * Find all media records where the file is missing on disk,
 * re-download them from Telegram, and update the file path if needed.
 */
export async function repairMissingMedia(): Promise<void> {
  const posts = await getPostsWithMedia();

  // Collect missing media
  const missing: { mediaId: number; postId: number; channelId: number; telegramMsgId: number; filePath: string; channelUsername: string | null; channelTelegramId: string | null }[] = [];

  for (const post of posts) {
    for (const m of post.mediaFiles) {
      const fullPath = path.join(MEDIA_DIR, m.filePath);
      if (!fs.existsSync(fullPath)) {
        missing.push({
          mediaId: m.id,
          postId: post.id,
          channelId: post.channelId,
          telegramMsgId: post.telegramMsgId,
          filePath: m.filePath,
          channelUsername: post.channel.username,
          channelTelegramId: post.channel.telegramId,
        });
      }
    }
  }

  if (missing.length === 0) {
    console.log("[MediaRepair] All media files present on disk");
    return;
  }

  console.log(`[MediaRepair] Found ${missing.length} missing media files, re-downloading...`);

  const client = await getTelegramClient();
  let repaired = 0;
  let failed = 0;

  // Group by channel+msgId to avoid fetching same message multiple times
  const byMsg = new Map<string, typeof missing>();
  for (const m of missing) {
    const key = `${m.channelId}:${m.telegramMsgId}`;
    if (!byMsg.has(key)) byMsg.set(key, []);
    byMsg.get(key)!.push(m);
  }

  for (const [, items] of byMsg) {
    const { channelUsername, channelTelegramId, telegramMsgId } = items[0];
    const peer = channelUsername || channelTelegramId;
    if (!peer) {
      failed += items.length;
      continue;
    }

    try {
      // Fetch the message from Telegram
      const result = await client.getMessages(peer, { ids: [telegramMsgId] });
      const message = result[0];
      if (!message || !message.media) {
        failed += items.length;
        continue;
      }

      // Download the media
      const buffer = await client.downloadMedia(message.media, {});
      if (!buffer || (buffer instanceof Buffer && buffer.length === 0)) {
        failed += items.length;
        continue;
      }

      // Save to each expected path
      for (const item of items) {
        const fullPath = path.join(MEDIA_DIR, item.filePath);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, buffer as Buffer);
        repaired++;
      }

      // Small delay between Telegram requests
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.warn(`[MediaRepair] Failed to fetch msg ${telegramMsgId} from ${peer}:`, (err as Error).message);
      failed += items.length;
    }
  }

  console.log(`[MediaRepair] Done: ${repaired} repaired, ${failed} failed out of ${missing.length}`);
}
