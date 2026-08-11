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
    // Optional second VoidAI host. Empty by default — beta.voidai.app no longer
    // resolves, and a fallback equal to baseUrl is skipped as a duplicate.
    fallbackBaseUrl: process.env.LLM_FALLBACK_BASE_URL || "",
    model: process.env.LLM_MODEL || "gpt-5.1",
    // Model resilience. LLM_MODEL is only a *preference*: when it turns out to
    // be dead, the translator probes known-good VoidAI models and uses the first
    // healthy one instead of failing over to OpenRouter for every post.
    autoSelectWorking: (process.env.LLM_AUTO_SELECT_WORKING || "true").toLowerCase() !== "false",
    // Comma-separated override for the candidate list (ordered, best first).
    workingModelsCsv: process.env.LLM_WORKING_MODELS_CSV || "",
    // How long a discovered working-model list stays valid before re-probing.
    modelHealthTtlMs: Number(process.env.LLM_MODEL_HEALTH_TTL_MS || 6 * 60 * 60 * 1000),
    openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
    openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    openRouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free",
  },
  searxng: {
    url: (process.env.SEARXNG_URL || "").replace(/\/+$/, ""),
    user: process.env.SEARXNG_USER || "",
    pass: process.env.SEARXNG_PASS || "",
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
