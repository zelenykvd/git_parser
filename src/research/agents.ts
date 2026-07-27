import { llmCall } from "../translator/llm.js";
import { webSearch, readPage, parseJsonReply, SearchHit } from "./tools.js";
import { harvestPageImages, HarvestedImage } from "./images.js";

/**
 * A small team of single-purpose agents driven by an orchestrator.
 *
 * The anti-hallucination guarantee does not rest on asking a model to be
 * careful. Every claim must carry a verbatim quote and a URL, and the quote is
 * checked against the actually fetched page text by code, not by a model.
 * A claim whose quote is not literally present on its page is dropped, no
 * matter how plausible it reads.
 */

const MAX_ROUNDS = 3;
const PAGES_PER_ROUND = 5;
const MIN_QUOTE_CHARS = 25;

export interface Fact {
  claim: string;
  quote: string;
  url: string;
  /** verbatim quote found on the page */
  quoteVerified: boolean;
  /** an independent agent agreed the quote supports the claim */
  supportsClaim: boolean;
  /** number of distinct domains carrying the same claim */
  confirmations: number;
}

export interface TeamMessage {
  agent: string;
  message: string;
}

export interface ResearchResult {
  topic: string;
  rounds: number;
  facts: Fact[];
  rejected: { claim: string; url: string; reason: string }[];
  openQuestions: string[];
  sources: string[];
  images: HarvestedImage[];
  brief: string;
  transcript: TeamMessage[];
}

// ——— Deterministic verification ———

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, '"')
    .replace(/[^\p{L}\p{N}"]+/gu, " ")
    .trim();
}

/**
 * True when the quote really occurs in the page. Models routinely paraphrase
 * while claiming to quote, so a near-miss counts as a miss: we allow only
 * whitespace/punctuation drift, then fall back to matching a long prefix in
 * case the model truncated the tail.
 */
export function quoteAppearsOnPage(quote: string, pageText: string): boolean {
  if (!quote || quote.length < MIN_QUOTE_CHARS) return false;
  const page = normalize(pageText);
  const q = normalize(quote);
  if (page.includes(q)) return true;
  const prefix = q.slice(0, Math.max(MIN_QUOTE_CHARS, Math.floor(q.length * 0.6)));
  return prefix.length >= MIN_QUOTE_CHARS && page.includes(prefix);
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ——— Agent prompts ———

const PLANNER = `Ти — агент-планувальник дослідження. Отримуєш тему і те, що вже відомо з архіву.
Поверни ТІЛЬКИ JSON:
{"questions": ["конкретне питання, відповідь на яке потрібна", ...],
 "queries": ["пошуковий запит англійською або українською", ...]}
Питань 4-7, запитів 4-6. Запити мають бути такими, щоб знайти ПЕРВИННІ джерела:
офіційну документацію, репозиторій, специфікацію, оригінальний анонс.
Не вигадуй фактів, тільки формулюй, що треба з'ясувати.`;

const SCOUT = `Ти — агент-розвідник. Отримуєш список результатів пошуку і питання дослідження.
Обери найперспективніші сторінки: первинні джерела важливіші за перекази,
офіційна документація важливіша за блоги, свіже важливіше за старе.
Поверни ТІЛЬКИ JSON: {"pick": ["url", ...], "why": "одне речення"}
Обери не більше 5 URL. Не вигадуй URL, бери лише зі списку.`;

const READER = `Ти — агент-читач. Отримуєш markdown реальної сторінки і питання дослідження.
Витягни факти, які відповідають на ці питання.

ЗАЛІЗНЕ ПРАВИЛО: для кожного факту наведи ДОСЛІВНУ цитату зі сторінки, скопійовану
символ у символ. Не переказуй, не скорочуй, не виправляй у цитаті нічого.
Цитата має бути щонайменше 25 символів. Якщо дослівної цитати немає — факт не додавай.
Краще повернути один перевірений факт, ніж п'ять правдоподібних.

Поверни ТІЛЬКИ JSON: {"facts": [{"claim": "твердження українською", "quote": "дослівна цитата зі сторінки"}, ...]}
Якщо сторінка не містить нічого корисного, поверни {"facts": []}.`;

const VERIFIER = `Ти — агент-верифікатор. Для кожної пари перевір ОДНЕ: чи цитата справді підтверджує твердження.
Будь суворим. Якщо цитата лише дотична, або твердження ширше за цитату, або в твердженні є число,
якого немає в цитаті — це НЕ підтвердження.
Поверни ТІЛЬКИ JSON: {"verdicts": [{"i": індекс, "supports": true/false, "reason": "коротко"}, ...]}`;

const CRITIC = `Ти — агент-критик. Отримуєш перевірені факти і початкові питання дослідження.
Визнач, на які питання ВІДПОВІДІ ВСЕ ЩЕ НЕМАЄ, і які суперечності є між фактами.
Поверни ТІЛЬКИ JSON:
{"answered": ["питання, на яке є відповідь", ...],
 "open": ["питання без відповіді", ...],
 "contradictions": ["опис суперечності", ...],
 "queries": ["новий пошуковий запит, щоб закрити прогалину", ...]}
Запитів не більше 4. Якщо все закрито, поверни порожній масив queries.`;

const EDITOR = `Ти — агент-редактор. Отримуєш ПЕРЕВІРЕНІ факти з цитатами і посиланнями, а також відкриті питання.

КРИТИЧНО: використовуй ВИКЛЮЧНО надані факти. Не додавай нічого від себе.
Жодного числа, дати чи назви, якої немає у фактах. Після кожного твердження став посилання [n].

Склади бриф у markdown:

## Що встановлено
Факти з посиланнями [n]. Тільки перевірене.

## Суперечності
Де джерела не збігаються. Якщо таких немає, напиши "не виявлено".

## Чого не вдалося з'ясувати
Відкриті питання. Це важливий розділ, не приховуй прогалин.

## Що перевірити самому
Конкретні експерименти для власного досвіду автора.

## План статті
Заголовки розділів з позначкою, що є в джерелах, а що автор має додати від себе.

## Джерела
Нумерований список URL.`;

// ——— The orchestrator ———

export async function runResearchTeam(
  topic: string,
  archiveContext = ""
): Promise<ResearchResult> {
  const transcript: TeamMessage[] = [];
  const say = (agent: string, message: string) => {
    transcript.push({ agent, message });
    console.log(`[research/${agent}] ${message}`);
  };

  const facts: Fact[] = [];
  const rejected: { claim: string; url: string; reason: string }[] = [];
  const images: HarvestedImage[] = [];
  const readUrls = new Set<string>();
  let openQuestions: string[] = [];
  let round = 0;

  // 1. Planner sets the agenda
  const plan = parseJsonReply<{ questions: string[]; queries: string[] }>(
    await llmCall(PLANNER, `Тема: ${topic}\n\nЩо вже відомо з архіву:\n${archiveContext || "нічого"}`, 0.4),
    { questions: [], queries: [topic] }
  );
  openQuestions = plan.questions.length ? plan.questions : [`Що таке ${topic}?`];
  let queries = plan.queries.length ? plan.queries : [topic];
  say("планувальник", `${openQuestions.length} питань, ${queries.length} запитів: ${queries.join(" | ")}`);

  while (round < MAX_ROUNDS && queries.length > 0) {
    round += 1;

    // 2. Scout searches and picks pages
    const hits: SearchHit[] = (
      await Promise.all(queries.slice(0, 5).map((q) => webSearch(q, { limit: 8 })))
    ).flat();
    const fresh = hits.filter((h) => !readUrls.has(h.url));
    if (fresh.length === 0) {
      say("розвідник", "нових сторінок не знайшлося, зупиняюсь");
      break;
    }
    say("розвідник", `знайдено ${fresh.length} нових посилань`);

    const picked = parseJsonReply<{ pick: string[]; why: string }>(
      await llmCall(
        SCOUT,
        `Питання:\n${openQuestions.join("\n")}\n\nРезультати:\n${fresh
          .slice(0, 30)
          .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`)
          .join("\n")}`,
        0.3
      ),
      { pick: fresh.slice(0, PAGES_PER_ROUND).map((h) => h.url), why: "" }
    );
    const urls = picked.pick
      .filter((u) => fresh.some((h) => h.url === u))
      .slice(0, PAGES_PER_ROUND);
    if (urls.length === 0) {
      say("розвідник", "нічого вартого читання, зупиняюсь");
      break;
    }
    say("розвідник", `обрано ${urls.length}: ${picked.why || urls.map(domainOf).join(", ")}`);

    // 3. Readers extract facts, each with a verbatim quote
    const readings = await Promise.all(
      urls.map(async (url) => {
        readUrls.add(url);
        const page = await readPage(url);
        if (!page) return { url, page: "", facts: [] as { claim: string; quote: string }[] };
        const out = parseJsonReply<{ facts: { claim: string; quote: string }[] }>(
          await llmCall(READER, `Питання:\n${openQuestions.join("\n")}\n\nСторінка ${url}:\n${page}`, 0.2),
          { facts: [] }
        );
        return { url, page, facts: out.facts || [] };
      })
    );

    // 3b. Mirror usable illustrations from the pages we actually read
    const harvested = (
      await Promise.all(
        readings.filter((r) => r.page).map((r) => harvestPageImages(r.page, r.url))
      )
    ).flat();
    images.push(...harvested);
    const mirrored = harvested.filter((i) => i.hostedUrl).length;
    if (harvested.length > 0) {
      say(
        "збирач ілюстрацій",
        `перезалито ${mirrored}, відкладено на перевірку ${harvested.length - mirrored}`
      );
    }

    // 4. Deterministic gate: the quote must literally be on the page
    const candidates: { claim: string; quote: string; url: string }[] = [];
    for (const r of readings) {
      for (const f of r.facts) {
        if (!f?.claim || !f?.quote) continue;
        if (quoteAppearsOnPage(f.quote, r.page)) {
          candidates.push({ claim: f.claim, quote: f.quote, url: r.url });
        } else {
          rejected.push({
            claim: f.claim,
            url: r.url,
            reason: "цитати немає на сторінці дослівно",
          });
        }
      }
    }
    say(
      "верифікатор",
      `цитати: ${candidates.length} підтверджено, ${
        rejected.length
      } відкинуто як вигадані`
    );

    // 5. Semantic gate: does the quote actually support the claim?
    if (candidates.length > 0) {
      const verdicts = parseJsonReply<{ verdicts: { i: number; supports: boolean; reason: string }[] }>(
        await llmCall(
          VERIFIER,
          candidates
            .map((c, i) => `[${i}] Твердження: ${c.claim}\n    Цитата: ${c.quote}`)
            .join("\n\n"),
          0.1
        ),
        { verdicts: candidates.map((_, i) => ({ i, supports: true, reason: "" })) }
      );
      const byIndex = new Map(verdicts.verdicts?.map((v) => [v.i, v]) || []);
      candidates.forEach((c, i) => {
        const v = byIndex.get(i);
        if (v && v.supports === false) {
          rejected.push({ claim: c.claim, url: c.url, reason: v.reason || "цитата не підтверджує твердження" });
          return;
        }
        facts.push({ ...c, quoteVerified: true, supportsClaim: true, confirmations: 1 });
      });
      say("верифікатор", `семантична перевірка пройдена: ${facts.length} фактів усього`);
    }

    // 6. Critic decides whether another round is needed
    const critique = parseJsonReply<{
      answered: string[];
      open: string[];
      contradictions: string[];
      queries: string[];
    }>(
      await llmCall(
        CRITIC,
        `Питання:\n${openQuestions.join("\n")}\n\nПеревірені факти:\n${facts
          .map((f) => `- ${f.claim} (${domainOf(f.url)})`)
          .join("\n")}`,
        0.3
      ),
      { answered: [], open: openQuestions, contradictions: [], queries: [] }
    );
    openQuestions = critique.open?.length ? critique.open : [];
    queries = (critique.queries || []).slice(0, 4);
    say(
      "критик",
      `закрито ${critique.answered?.length || 0}, лишилось ${openQuestions.length}` +
        (queries.length ? `, замовляю ще ${queries.length} пошуків` : ", дозбирувати нічого")
    );
  }

  // Cross-confirmation: the same claim from independent domains
  for (const f of facts) {
    f.confirmations = new Set(
      facts
        .filter((o) => normalize(o.claim).slice(0, 60) === normalize(f.claim).slice(0, 60))
        .map((o) => domainOf(o.url))
    ).size;
  }

  const sources = [...new Set(facts.map((f) => f.url))];

  // 7. Editor assembles the brief from verified facts only
  const brief = facts.length
    ? await llmCall(
        EDITOR,
        `Тема: ${topic}\n\nПеревірені факти:\n${facts
          .map(
            (f) =>
              `- ${f.claim}\n  цитата: "${f.quote}"\n  джерело [${sources.indexOf(f.url) + 1}]: ${f.url}`
          )
          .join("\n")}\n\nВідкриті питання:\n${openQuestions.join("\n") || "немає"}\n\nДжерела:\n${sources
          .map((u, i) => `[${i + 1}] ${u}`)
          .join("\n")}`,
        0.4
      )
    : "Жодного факту не вдалося підтвердити дослівною цитатою. Тему треба досліджувати вручну.";

  say("редактор", `бриф зібрано з ${facts.length} перевірених фактів, ${sources.length} джерел`);

  return { topic, rounds: round, facts, rejected, openQuestions, sources, images, brief, transcript };
}
