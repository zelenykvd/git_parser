import * as path from "path";
import * as fs from "fs";
import { Api } from "telegram";
import { config } from "../config.js";
import { getPost, updatePostStatus } from "../db/repository.js";
import { entitiesToTelegramHtml, stripMarkdownArtifacts } from "../parser/formatter.js";
import { getBotClient } from "../parser/client.js";
import { publishPostToVaibeCod } from "./vaibecod.js";

const MEDIA_DIR = path.resolve("media");
const ALBUM_CAPTION_LIMIT = 1024;

/**
 * Strip all HTML tags, leaving only plain text.
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Detect old broken translations where HTML tags and markdown markers are mixed
 * (e.g. `<b>**text</b>**`). These were produced when message.text was saved
 * instead of message.message, causing entity offset misalignment.
 */
function isBrokenHtml(text: string): boolean {
  // Has both HTML tags AND markdown markers — old broken format
  const hasHtmlTags = /<[a-z][^>]*>/i.test(text);
  const hasMdMarkers = /\*\*|__|~~/.test(text);
  if (hasHtmlTags && hasMdMarkers) return true;

  // Tags wrapping partial words: </b> followed by non-space then <b>
  if (/<\/[a-z]+>\S+<[a-z]/.test(text)) return true;

  return false;
}

/**
 * Build a buttons array for GramJS sendMessage/sendFile.
 * GramJS expects Button[][] format for the buttons parameter.
 */
function buildVaibeCodButton(vaibeCodUrl: string): Api.KeyboardButtonUrl[][] {
  const fullUrl = `https://www.vaibecod.com${vaibeCodUrl}?utm_source=telegram&utm_medium=post&utm_campaign=channel`;
  return [
    [
      new Api.KeyboardButtonUrl({
        text: "Читати на сайті",
        url: fullUrl,
      }),
    ],
  ];
}

export async function publishPost(postId: number): Promise<void> {
  const post = await getPost(postId);
  if (!post) throw new Error(`Post #${postId} not found`);
  if (post.status !== "APPROVED") throw new Error(`Post #${postId} is not approved`);

  const client = await getBotClient();
  const channelId = post.channel.targetChannelId || config.telegram.targetChannelId;
  if (!channelId) {
    throw new Error(`No target channel configured for source @${post.channel.username}`);
  }

  // Build the text to send
  let htmlText: string;
  let parseMode: "html" | undefined = "html";

  if (post.translatedText) {
    if (isBrokenHtml(post.translatedText)) {
      // Old broken translation — strip everything, send as plain text
      console.warn(`Post #${postId}: broken HTML detected, sending as plain text`);
      htmlText = stripHtmlTags(stripMarkdownArtifacts(post.translatedText));
      parseMode = undefined;
    } else {
      // Auto-link plain URLs not already inside <a> tags
      htmlText = post.translatedText.replace(
        /(?<!href="|">)(https?:\/\/[^\s<]+)/g,
        '<a href="$1">$1</a>'
      );
    }
  } else {
    // No translation — convert from entities
    htmlText = entitiesToTelegramHtml(
      stripMarkdownArtifacts(post.originalText),
      (post.entities as any[]) || []
    );
  }

  // Publish to VaibeCod (uk + en versions with SEO)
  let vaibeCodUrl: string | null = null;
  try {
    vaibeCodUrl = await publishPostToVaibeCod(
      { id: post.id, publishedAt: post.publishedAt, vaibeCodUrl: post.vaibeCodUrl, mediaFiles: post.mediaFiles },
      htmlText
    );
  } catch (err) {
    console.error(`[VaibeCod] Failed for post #${postId}, publishing to Telegram without button:`, (err as Error).message);
  }

  // Build buttons if VaibeCod URL is available
  const buttons = vaibeCodUrl ? buildVaibeCodButton(vaibeCodUrl) : undefined;

  // Sort by id (insertion order from album) and drop entries whose file is missing on disk
  const mediaFiles = (post.mediaFiles || [])
    .slice()
    .sort((a, b) => a.id - b.id)
    .filter((m) => {
      const exists = fs.existsSync(path.join(MEDIA_DIR, m.filePath));
      if (!exists) {
        console.warn(`Post #${postId}: media file missing on disk, skipping: ${m.filePath}`);
      }
      return exists;
    });

  const sendText = async () => {
    await client.sendMessage(channelId, {
      message: htmlText,
      parseMode,
      ...(buttons ? { buttons } : {}),
    } as any);
  };

  // Plain-text-or-link helper: a tiny follow-up that carries the inline button
  // (Telegram albums don't support inline buttons, so we attach them to a separate text message)
  const sendButtonFollowup = async () => {
    if (!buttons) return;
    await client.sendMessage(channelId, {
      message: "👇",
      buttons,
    } as any);
  };

  if (mediaFiles.length === 0) {
    await sendText();
  } else if (mediaFiles.length === 1) {
    // Single media: caption + button can both ride on the file
    const media = mediaFiles[0];
    const filePath = path.join(MEDIA_DIR, media.filePath);
    try {
      await client.sendFile(channelId, {
        file: filePath,
        caption: htmlText,
        parseMode,
        forceDocument: media.type === "document",
        ...(buttons ? { buttons } : {}),
      } as any);
    } catch (err: any) {
      if (err?.message?.includes("MEDIA_CAPTION_TOO_LONG")) {
        // Caption too long — send media silently, then full text + button as follow-up
        await client.sendFile(channelId, {
          file: filePath,
          forceDocument: media.type === "document",
        } as any);
        await sendText();
      } else {
        throw err;
      }
    }
  } else {
    // Album: Telegram limits caption to 1024 chars on the first item and does NOT support inline buttons.
    // Strategy: if caption fits, attach it to the album, then post the button as a tiny follow-up.
    //          if caption is too long, send the album without caption and post full text+button after.
    const files = mediaFiles.map((m) => path.join(MEDIA_DIR, m.filePath));
    const captionFits = htmlText.length <= ALBUM_CAPTION_LIMIT;

    const sendAlbum = async (caption?: string) => {
      await client.sendFile(channelId, {
        file: files,
        ...(caption ? { caption, parseMode } : {}),
      } as any);
    };

    let albumWithCaption = false;
    if (captionFits) {
      try {
        await sendAlbum(htmlText);
        albumWithCaption = true;
      } catch (err: any) {
        if (err?.message?.includes("MEDIA_CAPTION_TOO_LONG")) {
          await sendAlbum();
          await sendText();
        } else {
          throw err;
        }
      }
    } else {
      await sendAlbum();
      await sendText();
    }

    if (albumWithCaption) {
      await sendButtonFollowup();
    }
  }

  await updatePostStatus(postId, "PUBLISHED");
  console.log(`Post #${postId} published to channel ${channelId}${vaibeCodUrl ? ` + VaibeCod` : ""}`);
}
