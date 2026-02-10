import { config } from "./config.js";
import { startServer } from "./server/app.js";
import { startListener } from "./parser/listener.js";
import { startPoller } from "./parser/poller.js";
import { prisma } from "./db/repository.js";

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
}

// When run directly (not imported by launcher)
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
