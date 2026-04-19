import { TelegramClient } from "telegram";
import { Api } from "telegram";
import * as fs from "fs";
import * as path from "path";
import { createMedia } from "../db/repository.js";

const MEDIA_DIR = path.resolve("media");
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

async function downloadWithRetry(
  client: TelegramClient,
  message: Api.Message
): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const buffer = await client.downloadMedia(message.media!, {});
      if (buffer && (buffer as Buffer).length > 0) {
        return buffer as Buffer;
      }
      console.warn(
        `[Downloader] msg ${message.id}: empty buffer from message.media (attempt ${attempt}/${MAX_ATTEMPTS})`
      );
    } catch (err) {
      console.warn(
        `[Downloader] msg ${message.id}: attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        (err as Error).message
      );
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }

  // Fallback: download the full message instead of just .media
  try {
    const buffer = await client.downloadMedia(message, {});
    if (buffer && (buffer as Buffer).length > 0) {
      console.log(`[Downloader] msg ${message.id}: recovered via message fallback`);
      return buffer as Buffer;
    }
    console.warn(`[Downloader] msg ${message.id}: fallback returned empty buffer`);
  } catch (err) {
    console.warn(
      `[Downloader] msg ${message.id}: fallback failed:`,
      (err as Error).message
    );
  }
  console.error(`[Downloader] msg ${message.id}: giving up — no media saved`);
  return null;
}

export async function downloadMessageMedia(
  client: TelegramClient,
  message: Api.Message,
  postId: number,
  channelId: number
): Promise<void> {
  if (!message.media) return;

  const dir = path.join(MEDIA_DIR, String(channelId), String(postId));
  fs.mkdirSync(dir, { recursive: true });

  try {
    if (message.photo || message.media instanceof Api.MessageMediaPhoto) {
      const fileName = `photo_${message.id}.jpg`;
      const filePath = path.join(dir, fileName);
      const buffer = await downloadWithRetry(client, message);
      if (!buffer) return;
      fs.writeFileSync(filePath, buffer);
      await createMedia({
        postId,
        type: "photo",
        filePath: path.relative(MEDIA_DIR, filePath),
        fileName,
        mimeType: "image/jpeg",
      });
      console.log(`Downloaded photo: ${fileName}`);
    } else if (message.video || message.media instanceof Api.MessageMediaDocument) {
      const doc = (message.media as Api.MessageMediaDocument)
        .document as Api.Document;
      if (!doc) return;

      const mimeType = doc.mimeType || "";
      let type = "document";
      let fileName = `file_${message.id}`;

      if (mimeType.startsWith("video/")) {
        type = "video";
        fileName = `video_${message.id}.mp4`;
      } else if (mimeType === "image/gif" || mimeType === "video/mp4") {
        // GIF animations are stored as mp4 in Telegram
        const isGif = doc.attributes?.some(
          (a) => a instanceof Api.DocumentAttributeAnimated
        );
        if (isGif) {
          type = "animation";
          fileName = `animation_${message.id}.mp4`;
        }
      }

      // Try to get original filename
      const fileNameAttr = doc.attributes?.find(
        (a) => a instanceof Api.DocumentAttributeFilename
      ) as Api.DocumentAttributeFilename | undefined;
      if (fileNameAttr) {
        fileName = fileNameAttr.fileName;
      }

      const filePath = path.join(dir, fileName);
      const buffer = await downloadWithRetry(client, message);
      if (!buffer) return;
      fs.writeFileSync(filePath, buffer);
      await createMedia({
        postId,
        type,
        filePath: path.relative(MEDIA_DIR, filePath),
        fileName,
        mimeType,
      });
      console.log(`Downloaded ${type}: ${fileName}`);
    } else {
      console.warn(
        `[Downloader] msg ${message.id}: unhandled media type ${message.media.className}`
      );
    }
  } catch (err) {
    console.error(`Failed to download media for post ${postId} (msg ${message.id}):`, err);
  }
}
