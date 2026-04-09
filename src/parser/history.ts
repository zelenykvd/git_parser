import { Api } from "telegram";
import bigInt from "big-integer";
import { getTelegramClient } from "./client.js";
import { parseGramJSEntities } from "./formatter.js";
import { createPost } from "../db/repository.js";
import { downloadMessageMedia } from "../media/downloader.js";
import { groupMessages } from "./grouper.js";

export interface FetchProgress {
  fetched: number;
  saved: number;
  skipped: number;
  done: boolean;
  error?: string;
}

/**
 * Fetches full message history for a channel and saves posts + media.
 * Calls `onProgress` after each batch so the caller can stream updates.
 * Does NOT auto-translate — the user triggers translation manually.
 */
export interface AbortSignal {
  aborted: boolean;
}

export async function fetchChannelHistory(
  channelId: number,
  identifier: string,
  onProgress?: (p: FetchProgress) => void,
  options?: { since?: Date; signal?: AbortSignal }
): Promise<FetchProgress> {
  const client = await getTelegramClient();

  const entityId: string | Api.PeerChannel = /^-?\d+$/.test(identifier)
    ? new Api.PeerChannel({ channelId: bigInt(identifier.replace(/^-100/, "")) })
    : identifier;
  const entity = await client.getEntity(entityId);
  if (!(entity instanceof Api.Channel)) {
    throw new Error(`${identifier} is not a channel`);
  }

  const since = options?.since;
  const signal = options?.signal;

  const progress: FetchProgress = { fetched: 0, saved: 0, skipped: 0, done: false };
  const report = () => onProgress?.({ ...progress });

  // Collect all messages first, then group them for album support
  const allMessages: Api.Message[] = [];

  for await (const message of client.iterMessages(entity, { limit: undefined })) {
    if (signal?.aborted) {
      console.log(`Fetch aborted for channel ${identifier}`);
      break;
    }

    progress.fetched++;

    if (since && message.date) {
      const msgDate = new Date(message.date * 1000);
      if (msgDate < since) {
        console.log(`Reached messages older than ${since.toISOString()}, stopping`);
        break;
      }
    }

    allMessages.push(message as Api.Message);

    if (progress.fetched % 50 === 0) report();
  }

  // Reverse to oldest-first, then group
  allMessages.reverse();
  const groups = groupMessages(allMessages);

  for (const group of groups) {
    const { primary, all } = group;
    const text = primary.message || "";
    if (!text.trim()) {
      progress.skipped += all.length;
      continue;
    }

    const entities = parseGramJSEntities(primary.entities);

    try {
      const post = await createPost({
        channelId,
        telegramMsgId: primary.id,
        originalText: text,
        entities: entities as any,
        createdAt: primary.date ? new Date(primary.date * 1000) : undefined,
        isHistorical: true,
      });

      progress.saved++;

      // Download media from ALL messages in the group
      for (const msg of all) {
        await downloadMessageMedia(client, msg, post.id, channelId);
      }
    } catch (err) {
      console.error(`Failed to save message ${primary.id}:`, err);
      progress.skipped++;
    }

    if (progress.saved % 20 === 0) report();
  }

  progress.done = true;
  report();
  return progress;
}
