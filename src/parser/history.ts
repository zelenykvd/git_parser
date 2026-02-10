import { Api } from "telegram";
import { getTelegramClient } from "./client.js";
import { parseGramJSEntities } from "./formatter.js";
import { createPost } from "../db/repository.js";
import { downloadMessageMedia } from "../media/downloader.js";

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
  username: string,
  onProgress?: (p: FetchProgress) => void,
  options?: { since?: Date; signal?: AbortSignal }
): Promise<FetchProgress> {
  const client = await getTelegramClient();

  const entity = await client.getEntity(username);
  if (!(entity instanceof Api.Channel)) {
    throw new Error(`@${username} is not a channel`);
  }

  const since = options?.since;
  const signal = options?.signal;

  const progress: FetchProgress = { fetched: 0, saved: 0, skipped: 0, done: false };
  const report = () => onProgress?.({ ...progress });

  // iterMessages yields messages from newest to oldest
  for await (const message of client.iterMessages(entity, { limit: undefined })) {
    // Check for abort
    if (signal?.aborted) {
      console.log(`Fetch aborted for channel ${username}`);
      break;
    }

    progress.fetched++;

    // Messages go from newest to oldest — stop when we pass the since boundary
    if (since && message.date) {
      const msgDate = new Date(message.date * 1000);
      if (msgDate < since) {
        console.log(`Reached messages older than ${since.toISOString()}, stopping`);
        break;
      }
    }

    // Use message.message (clean text), NOT message.text which inserts ** markers
    const text = (message as Api.Message).message || "";
    if (!text.trim()) {
      progress.skipped++;
      if (progress.fetched % 50 === 0) report();
      continue;
    }

    const entities = parseGramJSEntities(
      (message as Api.Message).entities
    );

    try {
      const post = await createPost({
        channelId,
        telegramMsgId: message.id,
        originalText: text,
        entities: entities as any,
        createdAt: message.date ? new Date(message.date * 1000) : undefined,
        isHistorical: true,
      });

      // createPost uses upsert — if post already existed, id is returned but
      // nothing is updated. We still count it as saved (idempotent).
      progress.saved++;

      // Download media (sequential — gramjs limitation)
      await downloadMessageMedia(
        client,
        message as Api.Message,
        post.id,
        channelId
      );
    } catch (err) {
      console.error(`Failed to save message ${message.id}:`, err);
      progress.skipped++;
    }

    if (progress.fetched % 20 === 0) report();
  }

  progress.done = true;
  report();
  return progress;
}
