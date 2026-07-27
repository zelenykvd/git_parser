import * as path from "path";
import { uploadBufferToVaibeCod } from "../bot/vaibecod.js";

/**
 * Image harvesting from researched pages.
 *
 * Re-hosting someone else's image is a copyright decision, not a technical one,
 * so licence drives the behaviour: freely licensed sources are mirrored
 * automatically, project-owned assets and official docs are mirrored but held
 * for review with attribution attached, and everything else is only recorded as
 * a link for a human to decide on. Nothing is ever published without a credit.
 */

const MIN_BYTES = 10_000; // below this it is an icon, avatar or tracking pixel
const MAX_BYTES = 8_000_000;
const MAX_PER_PAGE = 4;
const FETCH_TIMEOUT_MS = 20_000;

export type LicenceTier = "free" | "project" | "docs" | "unknown";

export interface HarvestedImage {
  sourceUrl: string;
  sourcePage: string;
  alt: string;
  tier: LicenceTier;
  /** filled once mirrored to our own storage */
  hostedUrl: string | null;
  attribution: string;
  needsReview: boolean;
  skippedReason?: string;
}

/** Domains whose media carries a free licence by default. */
const FREE_DOMAINS = [
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "images.unsplash.com",
  "unsplash.com",
  "images.pexels.com",
  "pexels.com",
  "cdn.pixabay.com",
  "pixabay.com",
  "openverse.org",
];

/** Assets served by a project itself: its own screenshots, logos, diagrams. */
const PROJECT_DOMAINS = [
  "raw.githubusercontent.com",
  "github.com",
  "user-images.githubusercontent.com",
  "objects.githubusercontent.com",
  "gitlab.com",
  "huggingface.co",
];

/** Official documentation and product sites: usable as illustration with credit. */
const DOCS_HINTS = ["/docs/", "docs.", "developer.", "/blog/", "/assets/", "/images/"];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function classifyImage(imageUrl: string, pageUrl = ""): LicenceTier {
  const host = hostOf(imageUrl);
  if (!host) return "unknown";
  if (FREE_DOMAINS.some((d) => host === d || host.endsWith("." + d))) return "free";
  if (PROJECT_DOMAINS.some((d) => host === d || host.endsWith("." + d))) return "project";
  if (DOCS_HINTS.some((h) => imageUrl.includes(h))) return "docs";
  // An illustration served by the very site we are citing belongs to that site,
  // whatever CDN path it sits behind — that is the same standing as its docs.
  const pageHost = hostOf(pageUrl);
  if (pageHost && (host === pageHost || host.endsWith("." + pageHost))) return "docs";
  return "unknown";
}

/** Obvious non-content images: sprites, icons, badges, avatars, pixels. */
function looksLikeChrome(url: string, alt: string): boolean {
  const u = url.toLowerCase();
  if (u.startsWith("data:")) return true;
  if (/\.svg(\?|$)/.test(u) && /(icon|logo|sprite|badge)/.test(u)) return true;
  if (/(favicon|sprite|avatar|gravatar|pixel|tracking|beacon|spacer|1x1)/.test(u)) return true;
  if (/(shields\.io|badgen|codecov|travis-ci|circleci)/.test(u)) return true;
  if (/^(logo|icon|avatar)$/i.test(alt.trim())) return true;
  return false;
}

/** Pull `![alt](url)` and bare <img src> out of the markdown a reader returned. */
export function extractImages(markdown: string, pageUrl: string): { url: string; alt: string }[] {
  const out: { url: string; alt: string }[] = [];
  const seen = new Set<string>();

  const push = (raw: string, alt: string) => {
    let url = raw.trim().split(/\s+/)[0].replace(/^<|>$/g, "");
    if (!url) return;
    try {
      url = new URL(url, pageUrl).toString();
    } catch {
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, alt: alt.trim() });
  };

  for (const m of markdown.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) push(m[2], m[1]);
  for (const m of markdown.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) push(m[1], "");

  return out;
}

function fileNameFor(url: string): string {
  try {
    const base = path.basename(new URL(url).pathname) || "image";
    const clean = base.split("?")[0].slice(0, 80);
    return /\.(jpe?g|png|webp|gif|avif)$/i.test(clean) ? clean : `${clean}.jpg`;
  } catch {
    return "image.jpg";
  }
}

async function download(url: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VaibeCodResearch/1.0)" },
    });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "";
    if (!mime.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < MIN_BYTES || buffer.length > MAX_BYTES) return null;
    return { buffer, mime: mime.split(";")[0] };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function attributionFor(tier: LicenceTier, imageUrl: string, pageUrl: string): string {
  const host = hostOf(imageUrl) || hostOf(pageUrl);
  switch (tier) {
    case "free":
      return `Джерело: ${host}. Перевірте конкретну ліцензію файлу перед публікацією.`;
    case "project":
      return `Ілюстрація проєкту, ${host}. Використання з посиланням на ${pageUrl}`;
    case "docs":
      return `Скріншот з офіційної документації, ${host}. Джерело: ${pageUrl}`;
    default:
      return `Невідома ліцензія, ${host}. Не публікувати без дозволу правовласника.`;
  }
}

/**
 * Mirror usable images from one researched page. `unknown` licences are never
 * downloaded — they come back as links with a reason attached.
 */
export async function harvestPageImages(
  markdown: string,
  pageUrl: string
): Promise<HarvestedImage[]> {
  const found = extractImages(markdown, pageUrl)
    .filter((i) => !looksLikeChrome(i.url, i.alt))
    .slice(0, MAX_PER_PAGE * 3);

  const results: HarvestedImage[] = [];
  for (const img of found) {
    if (results.filter((r) => r.hostedUrl).length >= MAX_PER_PAGE) break;

    const tier = classifyImage(img.url, pageUrl);
    const base: HarvestedImage = {
      sourceUrl: img.url,
      sourcePage: pageUrl,
      alt: img.alt,
      tier,
      hostedUrl: null,
      attribution: attributionFor(tier, img.url, pageUrl),
      needsReview: tier !== "free",
    };

    if (tier === "unknown") {
      results.push({ ...base, skippedReason: "невідома ліцензія, завантаження пропущено" });
      continue;
    }

    const file = await download(img.url);
    if (!file) {
      results.push({ ...base, skippedReason: "не зображення, замале або недоступне" });
      continue;
    }

    try {
      const hostedUrl = await uploadBufferToVaibeCod(file.buffer, fileNameFor(img.url), file.mime);
      results.push({ ...base, hostedUrl });
    } catch (err) {
      results.push({ ...base, skippedReason: `помилка завантаження: ${(err as Error).message}` });
    }
  }
  return results;
}
