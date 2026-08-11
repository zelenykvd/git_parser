import OpenAI from "openai";
import { config } from "../config.js";

type LlmEndpoint = { label: string; provider: string; client: OpenAI; model: string };

/** LLM output together with the endpoint that produced it, e.g. "voidai/gpt-5.1". */
export type LlmResult = { text: string; model: string };

const endpoints: LlmEndpoint[] = [
  {
    label: config.llm.baseUrl,
    provider: "voidai",
    client: new OpenAI({ apiKey: config.llm.apiKey, baseURL: config.llm.baseUrl }),
    model: config.llm.model,
  },
  {
    label: config.llm.fallbackBaseUrl,
    provider: "voidai-beta",
    client: new OpenAI({ apiKey: config.llm.apiKey, baseURL: config.llm.fallbackBaseUrl }),
    model: config.llm.model,
  },
];

// OpenRouter — final fallback, used only when all VoidAI endpoints fail.
if (config.llm.openRouterApiKey) {
  endpoints.push({
    label: `OpenRouter (${config.llm.openRouterModel})`,
    provider: "openrouter",
    client: new OpenAI({ apiKey: config.llm.openRouterApiKey, baseURL: config.llm.openRouterBaseUrl }),
    model: config.llm.openRouterModel,
  });
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
  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const isLast = i === endpoints.length - 1;
    try {
      const response = await endpoint.client.chat.completions.create({
        model: endpoint.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature,
      });

      const result = response.choices[0]?.message?.content?.trim();
      if (!result) throw new Error("Empty LLM response");
      if (i > 0) {
        console.log(`[LLM] Served by fallback endpoint: ${endpoint.label}`);
      }
      return { text: result, model: `${endpoint.provider}/${response.model || endpoint.model}` };
    } catch (err) {
      if (isLast) throw err;
      console.warn(`[LLM] Endpoint failed (${endpoint.label}), trying next...`, (err as Error).message);
    }
  }
  throw new Error("All LLM endpoints failed");
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
