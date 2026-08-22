import { Api } from "telegram";
import bigInt from "big-integer";
import { getTelegramClient } from "./client.js";
import { parseGramJSEntities } from "./formatter.js";
import { createPost } from "../db/repository.js";
import { downloadMessageMedia } from "../media/downloader.js";
import { groupMessages } from "./grouper.js";
import { triggerTranslationBackfill } from "../translator/backfill.js";

export interface FetchProgress {
  fetched: number;
  saved: number;
  skipped: number;
  done: boolean;
  error?: string;
  phase?: "collecting" | "saving";
}

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

  const progress: FetchProgress = { fetched: 0, saved: 0, skipped: 0, done: false, phase: "collecting" };
  const report = () => onProgress?.({ ...progress });

  // Phase 1: collect messages
  const allMessages: Api.Message[] = [];

  for await (const message of client.iterMessages(entity, { limit: undefined })) {
    if (signal?.aborted) {
      console.log(`Fetch aborted for channel ${identifier}`);
      break;
    }

    progress.fetched++;

    if (since && message.date) {
      const msgDate = new Date(message.date * 1000);
      if (msgDate < since) break;
    }

    allMessages.push(message as Api.Message);

    if (progress.fetched % 20 === 0) report();
  }

  if (signal?.aborted) {
    progress.done = true;
    report();
    return progress;
  }

  // Phase 2: group and save
  progress.phase = "saving";
  report();

  allMessages.reverse();
  const groups = groupMessages(allMessages);

  for (const group of groups) {
    if (signal?.aborted) break;

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

      for (const msg of all) {
        if (signal?.aborted) break;
        await downloadMessageMedia(client, msg, post.id, channelId);
      }
    } catch (err) {
      console.error(`Failed to save message ${primary.id}:`, err);
      progress.skipped++;
    }

    report();
  }

  progress.done = true;
  report();

  // Posts land here untranslated on purpose — translating inline would stall a
  // multi-thousand-message fetch. Hand the backlog to the backfill worker so
  // they do not sit in the admin panel unapprovable forever.
  if (progress.saved > 0) triggerTranslationBackfill();

  return progress;
}
