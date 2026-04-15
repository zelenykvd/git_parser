import * as path from "path";
import { Api } from "telegram";
import { config } from "../config.js";
import { getPost, updatePostStatus } from "../db/repository.js";
import { entitiesToTelegramHtml, stripMarkdownArtifacts } from "../parser/formatter.js";
import { getTelegramClient } from "../parser/client.js";
import { publishPostToVaibeCod } from "./vaibecod.js";

const MEDIA_DIR = path.resolve("media");

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

  const client = await getTelegramClient();
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
      htmlText = post.translatedText;
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

  const mediaFiles = post.mediaFiles || [];

  if (mediaFiles.length === 0) {
    // Text-only message
    if (buttons) {
      await client.sendMessage(channelId, {
        message: htmlText,
        parseMode,
        buttons: buttons,
      } as any);
    } else {
      await client.sendMessage(channelId, { message: htmlText, parseMode });
    }
  } else {
    // Try sending media with caption; if too long — fallback to media + separate text
    const sendMedia = async (caption?: string, capParseMode?: "html", markup?: Api.KeyboardButtonUrl[][]) => {
      if (mediaFiles.length === 1) {
        const media = mediaFiles[0];
        const filePath = path.join(MEDIA_DIR, media.filePath);
        await client.sendFile(channelId, {
          file: filePath,
          caption,
          parseMode: capParseMode,
          forceDocument: media.type === "document",
          ...(markup ? { buttons: markup } : {}),
        } as any);
      } else {
        const files = mediaFiles.map((m) => path.join(MEDIA_DIR, m.filePath));
        await client.sendFile(channelId, {
          file: files,
          caption,
          parseMode: capParseMode,
          ...(markup ? { buttons: markup } : {}),
        } as any);
      }
    };

    try {
      await sendMedia(htmlText, parseMode, buttons);
    } catch (err: any) {
      if (err.message?.includes("MEDIA_CAPTION_TOO_LONG")) {
        // Caption too long — send media without caption, then text separately
        await sendMedia();
        if (buttons) {
          await client.sendMessage(channelId, {
            message: htmlText,
            parseMode,
            buttons: buttons,
          } as any);
        } else {
          await client.sendMessage(channelId, { message: htmlText, parseMode });
        }
      } else {
        throw err;
      }
    }
  }

  await updatePostStatus(postId, "PUBLISHED");
  console.log(`Post #${postId} published to channel ${channelId}${vaibeCodUrl ? ` + VaibeCod` : ""}`);
}
