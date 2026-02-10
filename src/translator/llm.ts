import OpenAI from "openai";
import { config } from "../config.js";

const client = new OpenAI({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl,
});

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

async function llmCall(system: string, user: string, temperature = 0.3): Promise<string> {
  const response = await client.chat.completions.create({
    model: config.llm.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
  });

  const result = response.choices[0]?.message?.content?.trim();
  if (!result) throw new Error("Empty LLM response");
  return result;
}

/**
 * Agent 1: Translate HTML text to Ukrainian.
 */
export async function translateText(htmlText: string): Promise<string> {
  return llmCall(TRANSLATE_PROMPT, htmlText);
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
export async function verifyTranslation(original: string, translated: string): Promise<string> {
  const prompt = `ОРИГІНАЛ:\n${original}\n\nПЕРЕКЛАД:\n${translated}`;
  return llmCall(VERIFY_PROMPT, prompt, 0.1);
}
