import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { config } from "../config.js";
import * as readline from "readline";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

let client: TelegramClient | null = null;

export async function getTelegramClient(): Promise<TelegramClient> {
  if (client && client.connected) return client;

  const session = new StringSession(config.telegram.session);
  client = new TelegramClient(session, config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await ask("Phone number: "),
    password: async () => await ask("Password (2FA): "),
    phoneCode: async () => await ask("Code from Telegram: "),
    onError: (err) => console.error("Auth error:", err),
  });

  const sessionString = client.session.save() as unknown as string;
  if (sessionString && sessionString !== config.telegram.session) {
    console.log("\n=== Save this session string to .env as TELEGRAM_SESSION ===");
    console.log(sessionString);
    console.log("=============================================================\n");
  }

  return client;
}

export async function disconnectClient() {
  if (client) {
    await client.disconnect();
    client = null;
  }
}
