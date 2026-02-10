import { Router } from "express";
import crypto from "crypto";
import {
  isDockerAvailable,
  startPostgres,
  waitForPostgres,
  runMigrations,
  generatePrismaClient,
} from "./docker.js";
import { beginAuth, submitCode, submitPassword, getAuthState, cleanup } from "./telegram-auth.js";
import { writeEnvFile, type EnvValues } from "./env-writer.js";

export function createSetupRouter(onComplete: () => void) {
  const router = Router();

  // === Prerequisites ===
  router.get("/setup/prerequisites", async (_req, res) => {
    const result = await isDockerAvailable();
    res.json({ docker: result.ok, error: result.error });
  });

  // === Database ===
  router.post("/setup/db/start", async (_req, res) => {
    try {
      await startPostgres();
      res.json({ ok: true });
    } catch (err: any) {
      res.json({ ok: false, error: err.message });
    }
  });

  router.post("/setup/db/wait", async (_req, res) => {
    try {
      await waitForPostgres();
      res.json({ ok: true });
    } catch (err: any) {
      res.json({ ok: false, error: err.message });
    }
  });

  router.post("/setup/db/migrate", async (_req, res) => {
    try {
      const output = await runMigrations();
      await generatePrismaClient();
      res.json({ ok: true, output });
    } catch (err: any) {
      res.json({ ok: false, error: err.message });
    }
  });

  // === Telegram Auth ===
  router.post("/setup/telegram/start", async (req, res) => {
    try {
      const { apiId, apiHash, phone } = req.body;
      if (!apiId || !apiHash || !phone) {
        return res.json({ ok: false, error: "Missing required fields" });
      }
      await beginAuth(Number(apiId), apiHash, phone);
      const authState = getAuthState();
      res.json({ ok: true, state: authState.state, session: authState.session });
    } catch (err: any) {
      res.json({ ok: false, error: err.message });
    }
  });

  router.post("/setup/telegram/code", async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.json({ ok: false, error: "Code is required" });
      await submitCode(code);
      const authState = getAuthState();
      res.json({ ok: true, state: authState.state, session: authState.session, error: authState.error });
    } catch (err: any) {
      res.json({ ok: false, error: err.message });
    }
  });

  router.post("/setup/telegram/password", async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) return res.json({ ok: false, error: "Password is required" });
      await submitPassword(password);
      const authState = getAuthState();
      res.json({ ok: true, state: authState.state, session: authState.session, error: authState.error });
    } catch (err: any) {
      res.json({ ok: false, error: err.message });
    }
  });

  router.get("/setup/telegram/status", (_req, res) => {
    res.json(getAuthState());
  });

  // === LLM Test ===
  router.post("/setup/llm/test", async (req, res) => {
    try {
      const { apiKey, baseUrl, model } = req.body;
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey, baseURL: baseUrl });
      const completion = await client.chat.completions.create({
        model: model || "gpt-5.1",
        messages: [{ role: "user", content: "Reply with the word 'ok'" }],
        max_tokens: 5,
      });
      const reply = completion.choices?.[0]?.message?.content || "";
      res.json({ ok: true, reply });
    } catch (err: any) {
      res.json({ ok: false, error: err.message });
    }
  });

  // === Complete Setup ===
  router.post("/setup/complete", async (req, res) => {
    try {
      const {
        adminUser,
        adminPass,
        tgApiId,
        tgApiHash,
        tgBotToken,
        tgTarget,
        tgSession,
        llmKey,
        llmUrl,
        llmModel,
        pollInterval,
        pollDays,
      } = req.body;

      const jwtSecret = crypto.randomBytes(32).toString("hex");

      const envValues: EnvValues = {
        TELEGRAM_API_ID: tgApiId || "",
        TELEGRAM_API_HASH: tgApiHash || "",
        TELEGRAM_SESSION: tgSession || "",
        TELEGRAM_BOT_TOKEN: tgBotToken || "",
        TARGET_CHANNEL_ID: tgTarget || "",
        LLM_API_KEY: llmKey,
        LLM_BASE_URL: llmUrl || "https://api.voidai.app/v1",
        LLM_MODEL: llmModel || "gpt-5.1",
        DATABASE_URL: "postgresql://parser:password@localhost:5433/telegram_parser",
        ADMIN_USERNAME: adminUser || "admin",
        ADMIN_PASSWORD: adminPass,
        JWT_SECRET: jwtSecret,
        POLLER_INTERVAL_MS: pollInterval || "60000",
        POLLER_INITIAL_SYNC_DAYS: pollDays || "30",
      };

      writeEnvFile(envValues);

      // Clean up telegram auth client
      await cleanup();

      res.json({ ok: true });

      // Trigger app transition after response is sent
      setTimeout(() => onComplete(), 500);
    } catch (err: any) {
      res.json({ ok: false, error: err.message });
    }
  });

  return router;
}
