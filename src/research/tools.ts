import { config } from "../config.js";

/**
 * The two capabilities the research agents share: searching the open web
 * through the self-hosted SearXNG instance, and reading any page as markdown.
 */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  engine: string;
  publishedDate: string | null;
}

const SEARCH_TIMEOUT_MS = 25_000;
const READ_TIMEOUT_MS = 40_000;
const MAX_PAGE_CHARS = 6000;

function authHeader(): Record<string, string> {
  const { user, pass } = config.searxng;
  if (!user) return {};
  return {
    Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
  };
}

export async function webSearch(
  query: string,
  opts: { categories?: string; timeRange?: string; limit?: number } = {}
): Promise<SearchHit[]> {
  if (!config.searxng.url) return [];
  const params = new URLSearchParams({ q: query, format: "json" });
  if (opts.categories) params.set("categories", opts.categories);
  if (opts.timeRange) params.set("time_range", opts.timeRange);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.searxng.url}/search?${params}`, {
      headers: authHeader(),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`SearXNG ${res.status}`);
    const data = (await res.json()) as any;
    return (data.results || [])
      .slice(0, opts.limit ?? 10)
      .map((r: any) => ({
        title: String(r.title || ""),
        url: String(r.url || ""),
        snippet: String(r.content || "").slice(0, 300),
        engine: String(r.engine || ""),
        publishedDate: r.publishedDate || null,
      }))
      .filter((r: SearchHit) => r.url);
  } catch (err) {
    console.warn(`[research] search failed for "${query}":`, (err as Error).message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a page as markdown via Jina's reader. Free, no key, and it strips
 * navigation/ads that would otherwise dominate the extracted text.
 */
export async function readPage(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), READ_TIMEOUT_MS);
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "X-Return-Format": "markdown" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`reader ${res.status}`);
    const text = await res.text();
    return text.slice(0, MAX_PAGE_CHARS);
  } catch (err) {
    console.warn(`[research] read failed for ${url}:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Parse a JSON object out of an LLM reply that may be fenced or padded. */
export function parseJsonReply<T>(raw: string, fallback: T): T {
  const cleaned = raw
    .replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (m.includes("```") ? "" : m))
    .replace(/```[\s\S]*$/i, "")
    .trim();
  const candidate = cleaned.startsWith("{") || cleaned.startsWith("[") ? cleaned : raw.trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Last resort: grab the outermost braces
    const start = candidate.search(/[{[]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    return fallback;
  }
}
