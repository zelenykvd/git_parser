import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { config } from "../config.js";

type LlmEndpoint = {
  label: string;
  provider: string;
  client: OpenAI;
  model: string;
  /** VoidAI hosts serve many models with one key, so a dead model is worth
   * rotating past. OpenRouter is pinned to its configured slug. */
  rotateModels: boolean;
};

/** LLM output together with the endpoint that produced it, e.g. "voidai/gpt-5.1". */
export type LlmResult = { text: string; model: string };

const primaryClient = new OpenAI({ apiKey: config.llm.apiKey, baseURL: config.llm.baseUrl });

const endpoints: LlmEndpoint[] = [
  {
    label: config.llm.baseUrl,
    provider: "voidai",
    client: primaryClient,
    model: config.llm.model,
    rotateModels: true,
  },
];

// Second VoidAI tier — only when it really is a different host. Pointing the
// fallback at the primary URL just replays the same failing request and labels
// the result with a provider that was never used.
if (config.llm.fallbackBaseUrl && config.llm.fallbackBaseUrl !== config.llm.baseUrl) {
  endpoints.push({
    label: config.llm.fallbackBaseUrl,
    provider: "voidai-beta",
    client: new OpenAI({ apiKey: config.llm.apiKey, baseURL: config.llm.fallbackBaseUrl }),
    model: config.llm.model,
    rotateModels: true,
  });
}

// OpenRouter — final fallback, used only when all VoidAI endpoints fail.
if (config.llm.openRouterApiKey) {
  endpoints.push({
    label: `OpenRouter (${config.llm.openRouterModel})`,
    provider: "openrouter",
    client: new OpenAI({ apiKey: config.llm.openRouterApiKey, baseURL: config.llm.openRouterBaseUrl }),
    model: config.llm.openRouterModel,
    rotateModels: false,
  });
}

// ——— Working VoidAI model discovery ———
//
// LLM_MODEL alone is a single point of failure: when the configured model dies
// on the gateway every post falls through to OpenRouter (or fails outright).
// The translator therefore keeps its own ordered list of models it has seen
// answer, refreshes it on a TTL, and rotates through it inside the call path.

/**
 * Known-good VoidAI chat models, best first — verified live against this
 * account. No OpenAI, Anthropic or Google models here on purpose: those
 * upstreams answer 5xx on the gateway. General-purpose instruct models come
 * before code-tuned ones, which translate prose noticeably worse.
 */
const DEFAULT_VOIDAI_CANDIDATES = [
  "deepseek-v4-flash",
  "deepseek-v4-flash-0731",
  "deepseek-v3.2",
  "deepseek-v4-pro",
  "glm-5.2",
  "kimi-k3",
  "kimi-k2.6",
  "qwen3-235b-a22b-instruct",
  "umbra",
  "kimi-k2.7-code",
  "qwen3-coder-480b-a35b-instruct",
];

/**
 * The catalogue mixes in image, speech, transcription, embedding and moderation
 * models. They live on other endpoints and can never translate text, so they
 * must never reach the candidate list — used when the catalogue entry carries
 * no usable endpoint/type metadata.
 */
const NON_CHAT_MODEL_PATTERNS = [
  /(^|-)tts(-|$)/,
  /whisper/,
  /transcribe/,
  /embedding/,
  /moderation/,
  /rerank/,
  /image/,
  /dall-?e/,
  /flux/,
  /midjourney/,
  /recraft/,
  /stable-diffusion/,
  /sora/,
  /(^|-)veo/,
  /kling/,
  /upscal/,
  /audio/,
  /speech/,
  /realtime/,
  /video/,
];

/** How many VoidAI models one call may burn through before dropping a tier. */
const MODEL_ATTEMPTS_PER_ENDPOINT = 4;
/** A model that just failed is skipped for this long. */
const MODEL_COOLDOWN_MS = 10 * 60 * 1000;
/** Enough healthy models to rotate through — stop probing once we have these. */
const MIN_WORKING_MODELS = 3;
const PROBE_CONCURRENCY = 4;
const PROBE_TIMEOUT_MS = 30_000;
/** Backoff after a refresh that found nothing, so we do not probe every post. */
const FAILED_REFRESH_RETRY_MS = 5 * 60 * 1000;

const WORKING_MODELS_FILE = path.resolve(process.cwd(), "working_models.json");

let workingModels: string[] | null = null;
let workingModelsExpireAt = 0;
let refreshInFlight: Promise<string[]> | null = null;
/** model id -> timestamp until which it is considered down. */
const modelDownUntil = new Map<string, number>();

function isChatCapableId(id: string): boolean {
  const name = id.toLowerCase();
  return !NON_CHAT_MODEL_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Prefer what the catalogue says (`endpoints` / `type` metadata, when VoidAI
 * ships it) and only fall back to name matching.
 */
function isChatCapableEntry(entry: Record<string, unknown>): boolean {
  const id = typeof entry.id === "string" ? entry.id : "";
  if (!id) return false;
  // Some image models (gemini-*-image) are served over /chat/completions, so the
  // name check applies even when the metadata says "chat".
  if (!isChatCapableId(id)) return false;

  const endpointList = entry.endpoints;
  if (Array.isArray(endpointList) && endpointList.length > 0) {
    return endpointList.some((e) => typeof e === "string" && e.includes("chat/completions"));
  }

  const kind = [entry.type, entry.modality, entry.mode].find(
    (v) => typeof v === "string" && v.length > 0
  ) as string | undefined;
  if (kind) return /chat|text|language|llm/i.test(kind);

  return isChatCapableId(id);
}

/** Candidate models in preference order: LLM_MODEL first, then the known-good set. */
function candidateModels(): string[] {
  const override = config.llm.workingModelsCsv
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const base = override.length > 0 ? override : DEFAULT_VOIDAI_CANDIDATES;
  const ordered = [config.llm.model, ...base].filter(Boolean).filter(isChatCapableId);
  return [...new Set(ordered)];
}

/** 401/402/403/429 and credit/quota errors mean the key is the problem, not the model. */
function isAccountFault(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  if (status === 401 || status === 402 || status === 403 || status === 429) return true;
  const message = ((err as Error).message || "").toLowerCase();
  return (
    (message.includes("insufficient") && message.includes("credit")) ||
    message.includes("quota") ||
    message.includes("payment required")
  );
}

type ProbeVerdict = "ok" | "down" | "account";

async function probeModel(client: OpenAI, model: string): Promise<ProbeVerdict> {
  try {
    const response = await client.chat.completions.create(
      { model, messages: [{ role: "user", content: "ping" }], max_tokens: 300 },
      { timeout: PROBE_TIMEOUT_MS, maxRetries: 0 }
    );
    // Reasoning models (deepseek-pro, glm, kimi, qwen) spend the whole budget on
    // hidden reasoning and answer with empty `content`. That is a *healthy*
    // model, so the probe only asks whether a choice came back at all —
    // requiring non-empty text here would blacklist most of the working set.
    return response.choices?.length > 0 ? "ok" : "down";
  } catch (err) {
    if (isAccountFault(err)) return "account";
    return "down";
  }
}

function readPersistedModels(): { models: string[]; updatedAt: number } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(WORKING_MODELS_FILE, "utf-8"));
    if (raw?.baseUrl !== config.llm.baseUrl) return null;
    const models = Array.isArray(raw.models) ? raw.models.filter((m: unknown) => typeof m === "string") : [];
    if (models.length === 0) return null;
    return { models, updatedAt: Number(raw.updatedAt) || 0 };
  } catch {
    return null;
  }
}

function persistModels(models: string[]): void {
  try {
    fs.writeFileSync(
      WORKING_MODELS_FILE,
      JSON.stringify({ baseUrl: config.llm.baseUrl, updatedAt: Date.now(), models }, null, 2)
    );
  } catch (err) {
    console.warn("[LLM] Could not persist working model list:", (err as Error).message);
  }
}

/** Probe candidates against the primary VoidAI host and keep the ones that answer. */
async function refreshWorkingModels(): Promise<string[]> {
  let candidates = candidateModels();

  // Drop candidates the gateway does not even list, and any non-chat class that
  // slipped into an override — probing those is a guaranteed 404.
  try {
    const catalogue = await primaryClient.models.list();
    const chatIds = new Set(
      catalogue.data
        .filter((entry) => isChatCapableEntry(entry as unknown as Record<string, unknown>))
        .map((entry) => entry.id)
    );
    const offered = candidates.filter((model) => chatIds.has(model));
    if (offered.length > 0) candidates = offered;
  } catch (err) {
    console.warn(
      "[LLM] Could not read the VoidAI model catalogue, probing the candidate list as-is:",
      (err as Error).message
    );
  }

  const working: string[] = [];
  for (let i = 0; i < candidates.length && working.length < MIN_WORKING_MODELS; i += PROBE_CONCURRENCY) {
    const batch = candidates.slice(i, i + PROBE_CONCURRENCY);
    const verdicts = await Promise.all(batch.map((model) => probeModel(primaryClient, model)));

    if (verdicts.includes("account")) {
      // The key, not the models. Rotating would just burn requests, so keep the
      // list untouched and let the call path fall through to OpenRouter.
      console.error(
        "[LLM] VoidAI rejected the health probe for account reasons (key/credits/rate limit) — keeping the current model list"
      );
      workingModels = workingModels ?? candidates;
      workingModelsExpireAt = Date.now() + FAILED_REFRESH_RETRY_MS;
      return workingModels;
    }

    batch.forEach((model, idx) => {
      if (verdicts[idx] === "ok") working.push(model);
      else modelDownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
    });
  }

  if (working.length === 0) {
    console.warn("[LLM] No VoidAI model passed the health probe — keeping the candidate list");
    workingModels = candidates;
    workingModelsExpireAt = Date.now() + FAILED_REFRESH_RETRY_MS;
    return workingModels;
  }

  working.forEach((model) => modelDownUntil.delete(model));
  workingModels = working;
  workingModelsExpireAt = Date.now() + config.llm.modelHealthTtlMs;
  persistModels(working);
  console.log(`[LLM] Working VoidAI models: ${working.join(", ")}`);
  return working;
}

/**
 * Ordered list of VoidAI models known to answer, best first. Cached in memory
 * and in `working_models.json` for `LLM_MODEL_HEALTH_TTL_MS`; a stale list is
 * refreshed in the background rather than blocking a translation.
 */
export async function getWorkingVoidAIModels(forceRefresh = false): Promise<string[]> {
  if (!config.llm.autoSelectWorking) return [config.llm.model];

  if (!forceRefresh && workingModels && Date.now() < workingModelsExpireAt) return workingModels;

  if (!refreshInFlight) {
    refreshInFlight = refreshWorkingModels().finally(() => {
      refreshInFlight = null;
    });
  }
  // Only the very first caller (no list at all) waits for the probe — later
  // ones translate with the stale list while the refresh runs.
  if (workingModels && !forceRefresh) return workingModels;
  return refreshInFlight;
}

/** Models this endpoint should try, healthiest first. */
async function modelsForEndpoint(endpoint: LlmEndpoint): Promise<string[]> {
  if (!endpoint.rotateModels || !config.llm.autoSelectWorking) return [endpoint.model];

  const models = await getWorkingVoidAIModels();
  const now = Date.now();
  const healthy = models.filter((model) => (modelDownUntil.get(model) ?? 0) <= now);
  // Everything cooling down at once → ignore the cooldowns rather than translate
  // nothing.
  const ordered = healthy.length > 0 ? healthy : models;
  return ordered.slice(0, MODEL_ATTEMPTS_PER_ENDPOINT);
}

/**
 * Discover a working translation model at startup. Fire-and-forget: translations
 * work off the candidate list until this finishes.
 */
export async function warmUpLlmModels(): Promise<void> {
  if (!config.llm.autoSelectWorking) {
    console.log(`[LLM] Auto model selection disabled — using ${config.llm.model}`);
    return;
  }

  const persisted = readPersistedModels();
  if (persisted && Date.now() < persisted.updatedAt + config.llm.modelHealthTtlMs) {
    workingModels = persisted.models;
    workingModelsExpireAt = persisted.updatedAt + config.llm.modelHealthTtlMs;
    console.log(`[LLM] Reusing cached working models: ${persisted.models.join(", ")}`);
    return;
  }

  const models = await getWorkingVoidAIModels(true);
  console.log(`[LLM] Translation model order: ${models.slice(0, MODEL_ATTEMPTS_PER_ENDPOINT).join(" -> ")}`);
}

// ——— Agent 1: Translator ———

const TRANSLATE_PROMPT = `Ти — професійний перекладач. Переклади текст на літературну українську мову.

Текст може містити HTML-розмітку Telegram (GramJS формат). Повний список дозволених тегів:
<b>жирний</b>  <strong>жирний</strong>
<i>курсив</i>  <em>курсив</em>
<u>підкреслення</u>
<s>закреслення</s>  <del>закреслення</del>
<spoiler>спойлер</spoiler>
<code>інлайн код</code>
<pre>блок коду</pre>
<pre><code class="language-python">код з мовою</code></pre>
<a href="url">посилання</a>
<blockquote>цитата</blockquote>

КРИТИЧНІ правила розмітки:
- ЗБЕРЕЖИ ВСІ HTML-теги ТОЧНО як є — не видаляй, не додавай нових, не змінюй атрибути
- Кожен відкриваючий тег ПОВИНЕН мати парний закриваючий: <b>...</b>, <i>...</i> тощо
- НЕ використовуй теги яких немає в оригіналі
- Теги повинні обгортати ті самі смислові фрагменти що й в оригіналі
- Якщо в оригіналі НЕМАЄ HTML-тегів — НЕ додавай їх у переклад

Правила перекладу:
- НЕ перекладай вміст <code> та <pre> — це програмний код
- НЕ перекладай промпти для ШІ/LLM — залиш оригінальною мовою
- НЕ перекладай URL, @username, #хештеги, назви технологій, бібліотек, функцій
- Використовуй граматично правильну літературну українську
- Зберігай структуру абзаців оригіналу
- Поверни ТІЛЬКИ перекладений текст без пояснень`;

/**
 * Same fallback chain as `llmCall`, but also reports which provider/model won.
 * The model id is taken from the API response when it echoes one back, so a
 * provider that silently routes to another model is reported accurately.
 */
export async function llmCallWithModel(system: string, user: string, temperature = 0.3): Promise<LlmResult> {
  const failures: string[] = [];

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const models = await modelsForEndpoint(endpoint);
    let modelFailed = false;

    for (let m = 0; m < models.length; m++) {
      const model = models[m];
      try {
        const response = await endpoint.client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature,
        });

        const result = response.choices[0]?.message?.content?.trim();
        if (!result) throw new Error("Empty LLM response");
        modelDownUntil.delete(model);
        if (i > 0 || m > 0) {
          console.log(`[LLM] Served by fallback ${endpoint.provider}/${model} (${endpoint.label})`);
        }
        return { text: result, model: `${endpoint.provider}/${response.model || model}` };
      } catch (err) {
        const message = (err as Error).message;
        failures.push(`${endpoint.provider}/${model} (${endpoint.label}): ${message}`);

        if (isAccountFault(err)) {
          // Key, credits or rate limit — another model on the same host cannot
          // fix that, so drop straight to the next provider.
          console.warn(
            `[LLM] ${endpoint.provider} refused for account reasons (not a dead model), skipping to the next provider:`,
            message
          );
          break;
        }

        modelFailed = true;
        modelDownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
        console.warn(`[LLM] ${endpoint.provider}/${model} failed, trying next model...`, message);
      }
    }

    // Every model we were willing to try on this host is down — re-probe in the
    // background so the next post starts from a fresh list.
    if (modelFailed && endpoint.rotateModels) {
      getWorkingVoidAIModels(true).catch(() => {});
    }
  }

  // Report every tier, not just the last one: a total outage of the primary
  // provider used to surface as the final fallback's error alone, which points
  // the blame at the wrong endpoint.
  throw new Error(`All LLM endpoints failed — ${failures.join(" | ")}`);
}

export async function llmCall(system: string, user: string, temperature = 0.3): Promise<string> {
  const { text } = await llmCallWithModel(system, user, temperature);
  return text;
}

/**
 * Agent 1: Translate HTML text to Ukrainian.
 * Returns the translation plus the provider/model that produced it.
 */
export async function translateText(htmlText: string): Promise<LlmResult> {
  return llmCallWithModel(TRANSLATE_PROMPT, htmlText);
}

// ——— Agent 2: Verifier ———

const VERIFY_PROMPT = `Ти — редактор-верифікатор перекладу Telegram-постів.

Дозволені HTML-теги GramJS: <b>, <strong>, <i>, <em>, <u>, <s>, <del>, <spoiler>, <code>, <pre>, <a href="...">, <blockquote>.

Тобі дано оригінал та переклад. Перевір і виправ:

1. HTML-теги:
   - Всі теги з оригіналу ЗБЕРЕЖЕНІ (не видалені й не додані зайві)
   - Кожен тег правильно ЗАКРИТИЙ
   - Якщо в оригіналі НЕ БУЛО тегів — у перекладі їх теж НЕ ПОВИННО бути
   - НЕ додавай теги яких не було в оригіналі

2. Контент без перекладу:
   - Код в <code>/<pre> — без змін
   - URL, @username, #хештеги — без змін
   - Назви технологій — без змін

3. Якість: переклад точний, літературний, структура абзаців збережена

Поверни ТІЛЬКИ фінальний текст перекладу. Без пояснень, коментарів чи приміток.`;

/**
 * Agent 2: Verify and fix the translation.
 */
export async function verifyTranslation(original: string, translated: string): Promise<LlmResult> {
  const prompt = `ОРИГІНАЛ:\n${original}\n\nПЕРЕКЛАД:\n${translated}`;
  return llmCallWithModel(VERIFY_PROMPT, prompt, 0.1);
}

// ——— Agent 3: Caption shortener (Telegram-only, original goes to site) ———

const SHORTEN_PROMPT = `Ти — редактор. Скороти український Telegram-пост, щоб він поміщався у підпис до альбому Telegram.

Дозволені HTML-теги GramJS: <b>, <strong>, <i>, <em>, <u>, <s>, <del>, <spoiler>, <code>, <pre>, <a href="...">, <blockquote>.

Правила:
- ЗБЕРЕЖИ головну думку, ключову інформацію, цифри, назви, посилання, заклик до дії
- Текст має читатися як САМОСТІЙНИЙ змістовний пост, а не уривок
- НЕ додавай "...", "детальніше нижче", "читайте далі" — текст має виглядати завершеним
- НЕ перекладай, не міняй мову, стиль чи тон
- Зберігай URL, @username, #хештеги, емодзі що несуть зміст
- ЗБЕРЕЖИ HTML-розмітку валідною: кожен тег парний, не додавай нових тегів
- Якщо в оригіналі немає HTML — у скороченому теж не додавай
- Поверни ТІЛЬКИ скорочений текст без пояснень, преамбул чи коментарів`;

/**
 * Agent 3: Shorten an HTML post to fit a target character budget.
 * Used ONLY for Telegram album caption — the full original is sent to the website.
 */
export async function shortenForAlbumCaption(htmlText: string, maxChars: number): Promise<string> {
  const prompt = `Скороти цей пост до МАКСИМУМ ${maxChars} символів (рахуючи HTML-теги). Зберігай головну інформацію, цифри, посилання, тон. Текст має бути завершеним:\n\n${htmlText}`;
  return llmCall(SHORTEN_PROMPT, prompt, 0.2);
}
