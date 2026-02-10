import { TelegramClient } from "telegram";
import { Api } from "telegram";
import * as fs from "fs";
import * as path from "path";
import { createMedia, getMediaByPostId } from "../db/repository.js";

const MEDIA_DIR = path.resolve("media");

export async function downloadMessageMedia(
  client: TelegramClient,
  message: Api.Message,
  postId: number,
  channelId: number
): Promise<void> {
  if (!message.media) return;

  // Skip if media already exists for this post (dedup guard)
  const existing = await getMediaByPostId(postId);
  if (existing.length > 0) return;

  const dir = path.join(MEDIA_DIR, String(channelId), String(postId));
  fs.mkdirSync(dir, { recursive: true });

  try {
    if (message.photo || message.media instanceof Api.MessageMediaPhoto) {
      await downloadAndSave(client, message, dir, postId, "photo");
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
      const buffer = await client.downloadMedia(message.media, {});
      if (buffer) {
        fs.writeFileSync(filePath, buffer as Buffer);
        await createMedia({
          postId,
          type,
          filePath: path.relative(MEDIA_DIR, filePath),
          fileName,
          mimeType,
        });
        console.log(`Downloaded ${type}: ${fileName}`);
      }
    }
  } catch (err) {
    console.error(`Failed to download media for post ${postId}:`, err);
  }
}

async function downloadAndSave(
  client: TelegramClient,
  message: Api.Message,
  dir: string,
  postId: number,
  type: string
) {
  const fileName = `photo_${message.id}.jpg`;
  const filePath = path.join(dir, fileName);

  const buffer = await client.downloadMedia(message.media!, {});
  if (buffer) {
    fs.writeFileSync(filePath, buffer as Buffer);
    await createMedia({
      postId,
      type,
      filePath: path.relative(MEDIA_DIR, filePath),
      fileName,
      mimeType: "image/jpeg",
    });
    console.log(`Downloaded photo: ${fileName}`);
  }
}
