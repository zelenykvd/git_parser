import { config } from "./config.js";
import { startServer } from "./server/app.js";
import { startListener } from "./parser/listener.js";
import { startPoller } from "./parser/poller.js";
import { prisma, releaseStalePublishing } from "./db/repository.js";
import { syncPublishedToVaibeCod } from "./bot/vaibecod.js";
import { repairMissingMedia } from "./media/repair.js";

export async function main() {
  console.log("Starting Telegram Parser & Translator...\n");

  // Verify DB connection
  try {
    await prisma.$connect();
    console.log("Database connected");
  } catch (err) {
    console.error("Failed to connect to database. Is Docker running?");
    console.error("Run: docker compose up -d");
    process.exit(1);
  }

  // Ensure the PUBLISHING enum value exists even if migrations were not run
  // on this deployment (idempotent, safe to run on every start).
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "Status" ADD VALUE IF NOT EXISTS 'PUBLISHING'`
    );
  } catch (err) {
    console.error("Failed to ensure PUBLISHING status exists:", (err as Error).message);
  }

  // Posts stuck in PUBLISHING after a crash/redeploy go back to APPROVED
  try {
    const released = await releaseStalePublishing();
    if (released > 0) {
      console.log(`Released ${released} post(s) stuck in PUBLISHING state`);
    }
  } catch (err) {
    console.error("Failed to release stale PUBLISHING posts:", (err as Error).message);
  }

  // Start Express API server
  await startServer();

  // Start Telegram listener + poller
  if (config.telegram.apiId && config.telegram.apiHash) {
    await startListener();
    startPoller();
  } else {
    console.log(
      "Telegram credentials not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env"
    );
    console.log("API server is running — you can configure channels via the admin panel.");
  }

  // Repair missing media files from Telegram
  if (config.telegram.apiId && config.telegram.apiHash) {
    repairMissingMedia().catch((err) =>
      console.error("[MediaRepair] Failed:", err.message)
    );
  }

  // Auto-sync published posts to VaibeCod
  if (config.vaibeCod.apiKey) {
    syncPublishedToVaibeCod().catch((err) =>
      console.error("[VaibeCod] Auto-sync failed:", err.message)
    );
  }
}

// When run directly (not imported by launcher)
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
