import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}`);
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
  poller: {
    intervalMs: Number(process.env.POLLER_INTERVAL_MS || "60000"),
    initialSyncDays: Number(process.env.POLLER_INITIAL_SYNC_DAYS || "30"),
  },
  server: {
    port: Number(process.env.PORT || 3001),
  },
};
