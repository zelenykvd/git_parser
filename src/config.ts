import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import path from "path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}`);
  return value;
}

/**
 * Ensure a local secret env var exists. If missing, generate a random 32-byte
 * hex value and append it to the project's .env file so subsequent restarts
 * see it. Used for values that should never round-trip through setup UI
 * (e.g. encryption keys migrated into an already-installed deployment).
 */
function ensureLocalSecret(name: string): string {
  const existing = process.env[name];
  if (existing && existing.trim()) return existing;

  const value = crypto.randomBytes(32).toString("hex");
  process.env[name] = value;

  try {
    const envPath = path.resolve(process.cwd(), ".env");
    const line = `${name}=${value}\n`;
    if (fs.existsSync(envPath)) {
      fs.appendFileSync(envPath, line);
    } else {
      fs.writeFileSync(envPath, line);
    }
    console.log(`[config] Generated ${name} and wrote it to .env`);
  } catch (err) {
    console.warn(
      `[config] Generated ${name} in memory but could not persist to .env:`,
      (err as Error).message
    );
  }
  return value;
}

export const config = {
  telegram: {
    apiId: Number(process.env.TELEGRAM_API_ID || "0"),
    apiHash: process.env.TELEGRAM_API_HASH || "",
    session: process.env.TELEGRAM_SESSION || "",
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    targetChannelId: process.env.TARGET_CHANNEL_ID || "",
  },
  llm: {
    apiKey: required("LLM_API_KEY"),
    baseUrl: process.env.LLM_BASE_URL || "https://api.voidai.app/v1",
    fallbackBaseUrl: process.env.LLM_FALLBACK_BASE_URL || "https://beta.voidai.app/v1",
    model: process.env.LLM_MODEL || "gpt-5.1",
  },
  database: {
    url: required("DATABASE_URL"),
  },
  auth: {
    adminUsername: process.env.ADMIN_USERNAME || "admin",
    adminPassword: required("ADMIN_PASSWORD"),
    jwtSecret: required("JWT_SECRET"),
  },
  settings: {
    encryptionKey: ensureLocalSecret("SETTINGS_ENCRYPTION_KEY"),
  },
  poller: {
    intervalMs: Number(process.env.POLLER_INTERVAL_MS || "60000"),
    initialSyncDays: Number(process.env.POLLER_INITIAL_SYNC_DAYS || "30"),
  },
  vaibeCod: {
    apiUrl: process.env.VAIBECOD_API_URL || "https://www.vaibecod.com/api/v1",
    apiKey: process.env.VAIBECOD_API_KEY || "",
    publicUrl: process.env.PUBLIC_URL || "http://bdcp8kraf9s12uinqyh96fd7.176.110.103.57.sslip.io",
  },
  server: {
    port: Number(process.env.PORT || 3001),
  },
};
