import fs from "fs";
import path from "path";

const ENV_PATH = path.resolve(import.meta.dirname, "../../.env");

export interface EnvValues {
  TELEGRAM_API_ID: string;
  TELEGRAM_API_HASH: string;
  TELEGRAM_SESSION: string;
  TELEGRAM_BOT_TOKEN: string;
  TARGET_CHANNEL_ID: string;
  LLM_API_KEY: string;
  LLM_BASE_URL: string;
  LLM_MODEL: string;
  DATABASE_URL: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
  POLLER_INTERVAL_MS: string;
  POLLER_INITIAL_SYNC_DAYS: string;
}

export function writeEnvFile(values: EnvValues): void {
  const lines = Object.entries(values).map(([key, val]) => `${key}=${val}`);
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
}

export function envFileExists(): boolean {
  return fs.existsSync(ENV_PATH);
}

export function readEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    result[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return result;
}

const REQUIRED_VARS = [
  "DATABASE_URL",
  "ADMIN_PASSWORD",
  "JWT_SECRET",
  "LLM_API_KEY",
] as const;

export function getMissingRequiredVars(): string[] {
  const env = readEnvFile();
  return REQUIRED_VARS.filter((key) => !env[key]);
}
