import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export type AuthState =
  | "idle"
  | "awaiting_code"
  | "awaiting_password"
  | "success"
  | "error";

interface AuthSession {
  client: TelegramClient;
  state: AuthState;
  sessionString: string;
  error: string;
  resolvePhoneCode: ((code: string) => void) | null;
  resolvePassword: ((password: string) => void) | null;
  authPromise: Promise<void> | null;
}

let session: AuthSession | null = null;

export function getAuthState(): { state: AuthState; error?: string; session?: string } {
  if (!session) return { state: "idle" };
  return {
    state: session.state,
    error: session.state === "error" ? session.error : undefined,
    session: session.state === "success" ? session.sessionString : undefined,
  };
}

export async function beginAuth(apiId: number, apiHash: string, phone: string): Promise<void> {
  // Clean up previous session if any
  if (session?.client) {
    try { await session.client.disconnect(); } catch {}
  }

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 3,
  });

  session = {
    client,
    state: "idle",
    sessionString: "",
    error: "",
    resolvePhoneCode: null,
    resolvePassword: null,
    authPromise: null,
  };

  await client.connect();

  session.authPromise = client
    .start({
      phoneNumber: () => Promise.resolve(phone),
      phoneCode: () =>
        new Promise<string>((resolve) => {
          session!.state = "awaiting_code";
          session!.resolvePhoneCode = resolve;
        }),
      password: () =>
        new Promise<string>((resolve) => {
          session!.state = "awaiting_password";
          session!.resolvePassword = resolve;
        }),
      onError: (err) => {
        console.error("Telegram auth error:", err);
        session!.state = "error";
        session!.error = err.message || String(err);
      },
    })
    .then(() => {
      session!.sessionString = client.session.save() as unknown as string;
      session!.state = "success";
    })
    .catch((err) => {
      session!.state = "error";
      session!.error = err.message || String(err);
    });

  // Wait a moment for state to transition to awaiting_code
  await waitForState(["awaiting_code", "error", "success"], 15_000);
}

export async function submitCode(code: string): Promise<void> {
  if (!session || !session.resolvePhoneCode) {
    throw new Error("No pending code request");
  }
  session.resolvePhoneCode(code);
  session.resolvePhoneCode = null;

  // Wait for next state transition
  await waitForState(["awaiting_password", "success", "error"], 15_000);
}

export async function submitPassword(password: string): Promise<void> {
  if (!session || !session.resolvePassword) {
    throw new Error("No pending password request");
  }
  session.resolvePassword(password);
  session.resolvePassword = null;

  await waitForState(["success", "error"], 15_000);
}

export async function cleanup(): Promise<void> {
  if (session?.client) {
    try { await session.client.disconnect(); } catch {}
  }
  session = null;
}

async function waitForState(targets: AuthState[], timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (session && targets.includes(session.state)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
}
