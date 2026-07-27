import * as path from "path";
import * as fs from "fs";
import { config } from "../config.js";
import {
  getPost,
  updatePostStatus,
  claimPostForPublishing,
} from "../db/repository.js";
import { stripMarkdownArtifacts } from "../parser/formatter.js";
import { getTelegramClient } from "../parser/client.js";
import { publishPostToVaibeCod } from "./vaibecod.js";
import { publishPostToLinkedIn } from "./linkedin.js";
import { shortenForAlbumCaption } from "../translator/llm.js";

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
 * Validate a post and atomically claim it for publishing (APPROVED → PUBLISHING).
 * Throws if the post cannot be published. After a successful claim no other
 * caller can claim the same post, which makes publishing idempotent even when
 * the HTTP request is retried or the button is clicked twice.
 */
export async function claimPost(postId: number): Promise<void> {
  const post = await getPost(postId);
  if (!post) throw new Error(`Post #${postId} not found`);
  if (post.status === "PUBLISHING") {
    throw new Error(`Post #${postId} is already being published`);
  }
  if (post.status === "PUBLISHED") {
    throw new Error(`Post #${postId} is already published`);
  }
  if (post.status !== "APPROVED") {
    throw new Error(`Post #${postId} is not approved`);
  }
  // Untranslated posts must never reach the channel — fail loudly instead of
  // silently falling back to the original-language text.
  if (!post.translatedText?.trim()) {
    throw new Error(
      `Post #${postId} has no translation — untranslated posts are not published`
    );
  }

  const claimed = await claimPostForPublishing(postId);
  if (!claimed) {
    throw new Error(`Post #${postId} is already being published`);
  }
}

/**
 * Publish a post that was already claimed via claimPost(). On failure before
 * anything reached the Telegram channel the post is returned to APPROVED so it
 * can be retried; once a message has been sent the post is always marked
 * PUBLISHED to prevent duplicates.
 */
export async function publishClaimedPost(postId: number): Promise<void> {
  let sentToTelegram = false;
  try {
    await doPublish(postId, () => { sentToTelegram = true; });
    await updatePostStatus(postId, "PUBLISHED");
    console.log(`Post #${postId} published`);
  } catch (err) {
    if (sentToTelegram) {
      // Something failed AFTER the post reached the channel (e.g. the
      // caption-overflow follow-up). Mark as PUBLISHED anyway — retrying
      // would duplicate the post in the channel.
      console.error(
        `Post #${postId}: error after Telegram send, marking PUBLISHED to avoid duplicates:`,
        (err as Error).message
      );
      await updatePostStatus(postId, "PUBLISHED");
    } else {
      console.error(`Post #${postId}: publish failed, reverting to APPROVED:`, (err as Error).message);
      await updatePostStatus(postId, "APPROVED");
      throw err;
    }
  }
}

/** Claim + publish in one call (CLI / non-HTTP usage). */
export async function publishPost(postId: number): Promise<void> {
  await claimPost(postId);
  await publishClaimedPost(postId);
}

async function doPublish(postId: number, markSent: () => void): Promise<void> {
  const post = await getPost(postId);
  if (!post) throw new Error(`Post #${postId} not found`);
  const translated = post.translatedText?.trim();
  if (!translated) {
    throw new Error(
      `Post #${postId} has no translation — untranslated posts are not published`
    );
  }

  const client = await getTelegramClient();
  const channelId = post.channel.targetChannelId || config.telegram.targetChannelId;
  if (!channelId) {
    throw new Error(`No target channel configured for source @${post.channel.username}`);
  }

  // Build the text to send
  let htmlText: string;
  let parseMode: "html" | undefined = "html";

  if (isBrokenHtml(translated)) {
    // Old broken translation — strip everything, send as plain text
    console.warn(`Post #${postId}: broken HTML detected, sending as plain text`);
    htmlText = stripHtmlTags(stripMarkdownArtifacts(translated));
    parseMode = undefined;
  } else {
    // Auto-link plain URLs not already inside <a> tags
    htmlText = translated.replace(
      /(?<!href="|">)(https?:\/\/[^\s<]+)/g,
      '<a href="$1">$1</a>'
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
    console.error(`[VaibeCod] Failed for post #${postId}, publishing to Telegram anyway:`, (err as Error).message);
  }

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
    } as any);
    markSent();
  };

  if (mediaFiles.length === 0) {
    await sendText();
  } else if (mediaFiles.length === 1) {
    // Single media: text rides as the file caption
    const media = mediaFiles[0];
    const filePath = path.join(MEDIA_DIR, media.filePath);
    try {
      await client.sendFile(channelId, {
        file: filePath,
        caption: htmlText,
        parseMode,
        forceDocument: media.type === "document",
      } as any);
      markSent();
    } catch (err: any) {
      if (err?.message?.includes("MEDIA_CAPTION_TOO_LONG")) {
        // Caption too long — send media silently, then full text as follow-up
        await client.sendFile(channelId, {
          file: filePath,
          forceDocument: media.type === "document",
        } as any);
        markSent();
        await sendText();
      } else {
        throw err;
      }
    }
  } else {
    // Album: Telegram limits the caption to 1024 chars on the first item.
    // VaibeCod (site) already received the FULL original htmlText above — shortening here is Telegram-only.
    // Strategy:
    //   1. If full text fits — use it as caption.
    //   2. Otherwise ask the LLM for a self-contained shortened version that fits the limit.
    //   3. If even that fails or stays too long — send album without caption + full text follow-up.
    const files = mediaFiles.map((m) => path.join(MEDIA_DIR, m.filePath));
    let captionText: string | undefined = undefined;

    // Telegram's 1024-char caption limit counts the VISIBLE text (after HTML
    // entities are parsed) — tag characters and <a href="…"> URLs do NOT count.
    // Measuring the raw HTML string over-counts (especially once bare URLs are
    // auto-linked above) and wrongly splits posts that would fit as a single
    // album caption. Measure the visible text instead.
    const captionLength = (s: string) =>
      parseMode === "html" ? stripHtmlTags(s).length : s.length;

    if (captionLength(htmlText) <= ALBUM_CAPTION_LIMIT) {
      captionText = htmlText;
    } else if (parseMode === "html") {
      // Leave a small safety margin so the LLM is not penalised for going slightly over.
      const target = ALBUM_CAPTION_LIMIT - 24;
      try {
        console.log(`Post #${postId}: caption ${captionLength(htmlText)} > ${ALBUM_CAPTION_LIMIT} visible chars, asking LLM to shorten to ~${target}…`);
        const shortened = (await shortenForAlbumCaption(htmlText, target)).trim();
        if (shortened && captionLength(shortened) <= ALBUM_CAPTION_LIMIT) {
          captionText = shortened;
          console.log(`Post #${postId}: shortened caption to ${captionLength(shortened)} visible chars`);
        } else {
          console.warn(`Post #${postId}: shortened caption still ${captionLength(shortened)} visible chars, falling back to no caption`);
        }
      } catch (err) {
        console.error(`Post #${postId}: caption shortening failed, falling back to no caption:`, (err as Error).message);
      }
    }

    const sendAlbum = async (caption?: string) => {
      await client.sendFile(channelId, {
        file: files,
        ...(caption ? { caption, parseMode } : {}),
      } as any);
      markSent();
    };

    // The text rides as the album caption so the whole thing stays a single
    // post. Only if the caption is rejected as too long do we fall back to a
    // text-only follow-up message.
    const sendCaptionOverflowText = async () => {
      await client.sendMessage(channelId, { message: htmlText, parseMode } as any);
    };

    if (captionText) {
      try {
        await sendAlbum(captionText);
      } catch (err: any) {
        if (err?.message?.includes("MEDIA_CAPTION_TOO_LONG")) {
          await sendAlbum();
          await sendCaptionOverflowText();
        } else {
          throw err;
        }
      }
    } else {
      await sendAlbum();
      await sendCaptionOverflowText();
    }
  }

  // Cross-post to LinkedIn after Telegram succeeded — never fails the publish
  try {
    await publishPostToLinkedIn(
      { id: post.id, linkedinPostId: post.linkedinPostId, mediaFiles: post.mediaFiles },
      htmlText,
      vaibeCodUrl ?? post.vaibeCodUrl
    );
  } catch (err) {
    console.error(`[LinkedIn] Failed for post #${postId}:`, (err as Error).message);
  }

  console.log(`Post #${postId} sent to channel ${channelId}${vaibeCodUrl ? ` + VaibeCod` : ""}`);
}
