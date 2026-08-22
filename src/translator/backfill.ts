import { entitiesToTelegramHtml, stripMarkdownArtifacts } from "../parser/formatter.js";
import {
  getPostsMissingTranslation,
  countPostsMissingTranslation,
  updateTranslation,
} from "../db/repository.js";
import { translateText, verifyTranslation } from "./llm.js";
import { config } from "../config.js";
import { sleep } from "../lib/timeout.js";

/**
 * Translate PENDING posts that were stored without a translation.
 *
 * History fetches (`fetchChannelHistory`) and the poller's initial sync save raw
 * text by design — translating thousands of archived posts inline would stall
 * both. The result was a backlog of posts the admin panel could never approve.
 * This drains that backlog slowly in the background, a few posts per run, so it
 * never competes with live translations for the LLM rate limit.
 */

let isRunning = false;

async function translateOne(post: {
  id: number;
  originalText: string;
  entities: unknown;
}): Promise<void> {
  // Same normalisation as the manual re-translate route: stored originalText can
  // carry markdown artifacts whose offsets no longer match the entities.
  const html = entitiesToTelegramHtml(
    stripMarkdownArtifacts(post.originalText),
    (post.entities as any[]) || []
  );
  const translated = await translateText(html);
  const verified = await verifyTranslation(html, translated.text);
  await updateTranslation(post.id, verified.text, translated.model);
}

/**
 * Translate up to `limit` untranslated PENDING posts. Returns how many were
 * translated. Safe to call concurrently — overlapping runs are skipped.
 */
export async function runTranslationBackfill(limit = config.backfill.batchSize): Promise<number> {
  if (!config.backfill.enabled) return 0;
  if (isRunning) return 0;
  isRunning = true;

  let translated = 0;
  try {
    const posts = await getPostsMissingTranslation(limit);
    if (posts.length === 0) return 0;

    const remaining = await countPostsMissingTranslation();
    console.log(`[Backfill] Translating ${posts.length} of ${remaining} untranslated post(s)...`);

    let consecutiveFailures = 0;
    for (const post of posts) {
      if (!post.originalText?.trim()) continue;
      try {
        await translateOne(post);
        translated++;
        consecutiveFailures = 0;
        console.log(`[Backfill] Translated post #${post.id}`);
      } catch (err) {
        consecutiveFailures++;
        console.error(`[Backfill] Translation failed for post #${post.id}:`, (err as Error).message);
        // Every endpoint being down (or rate limited) makes the rest of this
        // batch a waste of requests — stop and let the next run retry.
        if (consecutiveFailures >= 3) {
          console.warn("[Backfill] Three failures in a row — pausing until the next run");
          break;
        }
      }
      await sleep(config.backfill.delayMs);
    }
  } catch (err) {
    console.error("[Backfill] Run failed:", (err as Error).message);
  } finally {
    isRunning = false;
  }

  return translated;
}

/** Kick off a backfill run without waiting for it (e.g. after a history fetch). */
export function triggerTranslationBackfill(): void {
  runTranslationBackfill().catch((err) =>
    console.error("[Backfill] Trigger failed:", (err as Error).message)
  );
}

export function startTranslationBackfill(): void {
  if (!config.backfill.enabled) {
    console.log("[Backfill] Disabled (TRANSLATION_BACKFILL_ENABLED=false)");
    return;
  }
  console.log(
    `[Backfill] Started (every ${config.backfill.intervalMs}ms, ${config.backfill.batchSize} post(s) per run)`
  );
  setInterval(() => triggerTranslationBackfill(), config.backfill.intervalMs);
  triggerTranslationBackfill();
}
