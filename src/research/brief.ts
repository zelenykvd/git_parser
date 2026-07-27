import { prisma } from "../db/repository.js";
import { llmCall } from "../translator/llm.js";
import { stripHtml } from "../lib/html.js";

/**
 * Research briefs, not articles.
 *
 * The archive holds thousands of parsed posts from other people's channels.
 * Rewriting them is exactly what produced thin, unrankable pages, so this
 * module deliberately stops short of drafting prose: it gathers what the
 * archive knows about a topic (timeline, sources, recurring claims) and turns
 * that into a brief the author writes the actual article from.
 */

const MAX_SOURCES = 40;
const EXCERPT_CHARS = 400;

export interface BriefSource {
  postId: number;
  date: string;
  channel: string;
  excerpt: string;
  links: string[];
  publishedUrl: string | null;
}

export interface ResearchBrief {
  query: string;
  matched: number;
  firstSeen: string | null;
  lastSeen: string | null;
  sources: BriefSource[];
  /** Markdown brief: timeline, established facts, gaps, outline, what to test */
  brief: string;
}

function extractLinks(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<"')]+/g) || [];
  return [...new Set(found)].slice(0, 5);
}

const BRIEF_PROMPT = `Ти — редактор-дослідник. На основі витягів з архіву постів склади ДОСЛІДНИЦЬКИЙ БРИФ для автора, який писатиме велику статтю.

КРИТИЧНО ВАЖЛИВО:
- Не пиши статтю. Пиши бриф, з якого автор писатиме сам.
- Не вигадуй ЖОДНОГО факту, числа чи дати. Використовуй лише те, що є у витягах.
- Якщо чогось у матеріалах немає — напиши це в розділі "Прогалини", а не додумуй.
- Кожне твердження супроводжуй посиланням на номер поста у форматі [#123].

Структура брифу (markdown):

## Хронологія
Список подій з датами і номерами постів. Що і коли з'явилось.

## Що відомо напевно
Факти, підтверджені матеріалами. З посиланнями на пости.

## Суперечності і сумніви
Де матеріали суперечать одне одному, де є маркетингові заяви без доказів.

## Прогалини — що треба дізнатись самому
Конкретні питання, відповідей на які в архіві немає. Це найважливіший розділ.

## Що перевірити на практиці
Конкретні експерименти, які автор може провести і описати як власний досвід: що запустити, що виміряти, які числа зафіксувати.

## Пропонований план статті
Заголовки розділів. Для кожного познач, що є в матеріалах, а що автор має додати від себе.

## Де потрібні таблиці й графіки
Які саме дані варто показати візуально і звідки їх узяти.`;

export async function buildResearchBrief(query: string): Promise<ResearchBrief> {
  const q = query.trim();
  if (q.length < 3) throw new Error("Запит закороткий");

  const posts = await prisma.post.findMany({
    where: {
      OR: [
        { originalText: { contains: q, mode: "insensitive" } },
        { translatedText: { contains: q, mode: "insensitive" } },
      ],
    },
    include: { channel: true },
    orderBy: { createdAt: "asc" },
    take: MAX_SOURCES,
  });

  const total = await prisma.post.count({
    where: {
      OR: [
        { originalText: { contains: q, mode: "insensitive" } },
        { translatedText: { contains: q, mode: "insensitive" } },
      ],
    },
  });

  const sources: BriefSource[] = posts.map((p) => {
    const raw = p.translatedText || p.originalText || "";
    const plain = stripHtml(raw).replace(/\s+/g, " ").trim();
    return {
      postId: p.id,
      date: p.createdAt.toISOString().slice(0, 10),
      channel: p.channel?.username ? `@${p.channel.username}` : p.channel?.title || "",
      excerpt: plain.slice(0, EXCERPT_CHARS),
      links: extractLinks(raw),
      publishedUrl: p.vaibeCodUrl,
    };
  });

  if (sources.length === 0) {
    return {
      query: q,
      matched: 0,
      firstSeen: null,
      lastSeen: null,
      sources: [],
      brief: `Архів не містить жодної згадки «${q}». Тему доведеться досліджувати з нуля, зовнішніми джерелами.`,
    };
  }

  const material = sources
    .map(
      (s) =>
        `[#${s.postId}] ${s.date} ${s.channel}\n${s.excerpt}${
          s.links.length ? `\nПосилання: ${s.links.join(" ")}` : ""
        }`
    )
    .join("\n\n---\n\n");

  let brief: string;
  try {
    brief = await llmCall(
      BRIEF_PROMPT,
      `Тема: ${q}\nЗнайдено постів: ${total} (нижче ${sources.length} найдавніших)\n\n${material}`,
      0.4
    );
  } catch (err) {
    brief = `Не вдалося згенерувати бриф: ${(err as Error).message}\n\nМатеріали зібрані, дивись список джерел нижче.`;
  }

  return {
    query: q,
    matched: total,
    firstSeen: sources[0].date,
    lastSeen: sources[sources.length - 1].date,
    sources,
    brief,
  };
}

/**
 * Topic candidates: which terms appear often enough in the archive to carry a
 * full article. Deliberately dumb frequency counting over a curated term list —
 * an LLM pass here would invent topics that are not in the data.
 */
export async function suggestTopics(minMentions = 4): Promise<
  { term: string; mentions: number; firstSeen: string; lastSeen: string }[]
> {
  const posts = await prisma.post.findMany({
    select: { id: true, originalText: true, translatedText: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Multi-word proper names and tool-ish tokens: capitalised words, slugs, @handles
  const counts = new Map<string, { n: number; first: Date; last: Date }>();
  for (const p of posts) {
    const text = stripHtml(p.translatedText || p.originalText || "");
    const terms = new Set(
      (text.match(/\b[A-Z][A-Za-z0-9]{2,}(?:[ -][A-Z][A-Za-z0-9]{2,}){0,2}\b|\b[a-z][a-z0-9]+(?:-[a-z0-9]+){2,}\b/g) || [])
        .map((t) => t.trim())
        .filter((t) => t.length >= 4 && t.length <= 48)
    );
    for (const term of terms) {
      const cur = counts.get(term);
      if (cur) {
        cur.n += 1;
        if (p.createdAt < cur.first) cur.first = p.createdAt;
        if (p.createdAt > cur.last) cur.last = p.createdAt;
      } else {
        counts.set(term, { n: 1, first: p.createdAt, last: p.createdAt });
      }
    }
  }

  return [...counts.entries()]
    .filter(([, v]) => v.n >= minMentions)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 60)
    .map(([term, v]) => ({
      term,
      mentions: v.n,
      firstSeen: v.first.toISOString().slice(0, 10),
      lastSeen: v.last.toISOString().slice(0, 10),
    }));
}
