import * as path from "path";
import * as fs from "fs";
import { config } from "../config.js";
import { llmCall } from "../translator/llm.js";
import {
  updatePostVaibeCod,
  getPublishedPostsWithoutVaibeCod,
} from "../db/repository.js";
import { entitiesToTelegramHtml, stripMarkdownArtifacts } from "../parser/formatter.js";

const MEDIA_DIR = path.resolve("media");

// ——— Ukrainian transliteration table ———

const TRANSLIT = new Map<string, string>([
  ["а", "a"], ["б", "b"], ["в", "v"], ["г", "h"], ["ґ", "g"], ["д", "d"], ["е", "e"], ["є", "ye"],
  ["ж", "zh"], ["з", "z"], ["и", "y"], ["і", "i"], ["ї", "yi"], ["й", "y"], ["к", "k"], ["л", "l"],
  ["м", "m"], ["н", "n"], ["о", "o"], ["п", "p"], ["р", "r"], ["с", "s"], ["т", "t"], ["у", "u"],
  ["ф", "f"], ["х", "kh"], ["ц", "ts"], ["ч", "ch"], ["ш", "sh"], ["щ", "shch"], ["ь", ""],
  ["ю", "yu"], ["я", "ya"], ["'", ""], ["\u2019", ""], ["\u02BC", ""],
  ["А", "A"], ["Б", "B"], ["В", "V"], ["Г", "H"], ["Ґ", "G"], ["Д", "D"], ["Е", "E"], ["Є", "Ye"],
  ["Ж", "Zh"], ["З", "Z"], ["И", "Y"], ["І", "I"], ["Ї", "Yi"], ["Й", "Y"], ["К", "K"], ["Л", "L"],
  ["М", "M"], ["Н", "N"], ["О", "O"], ["П", "P"], ["Р", "R"], ["С", "S"], ["Т", "T"], ["У", "U"],
  ["Ф", "F"], ["Х", "Kh"], ["Ц", "Ts"], ["Ч", "Ch"], ["Ш", "Sh"], ["Щ", "Shch"], ["Ь", ""],
  ["Ю", "Yu"], ["Я", "Ya"],
]);

// ——— Utilities ———

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function generateSlug(title: string, postId: number): string {
  const transliterated = title
    .split("")
    .map((ch) => TRANSLIT.get(ch) ?? ch)
    .join("");

  const slug = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return `${slug}-${postId}`;
}

function fallbackTitle(htmlText: string): string {
  const plain = stripHtml(htmlText).trim();
  const firstLine = plain.split(/[.!?\n]/)[0]?.trim() || "Пост";
  return firstLine.length > 200 ? firstLine.slice(0, 197) + "..." : firstLine;
}

function fallbackExcerpt(htmlText: string): string {
  const plain = stripHtml(htmlText).trim();
  return plain.length > 160 ? plain.slice(0, 157) + "..." : plain;
}

// SVG icons (MIT-licensed, from Simple Icons / Lucide)
const GITHUB_ICON = `<svg class="github-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;
const ARROW_ICON = `<svg class="github-card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;

/**
 * Extract readable repo/path label from a GitHub URL.
 * e.g. "https://github.com/user/repo" → "user/repo"
 *      "https://github.com/user/repo/tree/main/src" → "user/repo/tree/main/src"
 */
function githubLabel(url: string): string {
  try {
    const u = new URL(url);
    // Remove trailing slash and return path without leading /
    return u.pathname.replace(/^\//, "").replace(/\/$/, "");
  } catch {
    return url;
  }
}

function githubLinkToCard(url: string): string {
  const label = githubLabel(url);
  // Show owner/repo as title, full path as subtitle if deeper
  const parts = label.split("/");
  const repo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : label;
  const showUrl = parts.length > 2 ? label : `github.com/${label}`;

  return `<a href="${url}" class="github-card" target="_blank" rel="noopener noreferrer">${GITHUB_ICON}<div class="github-card-body"><div class="github-card-repo">${repo}</div><div class="github-card-url">${showUrl}</div></div>${ARROW_ICON}</a>`;
}

export function prepareContentForWeb(htmlText: string): string {
  let content = htmlText;
  // Replace Telegram-specific spoiler tag
  content = content.replace(/<spoiler>/g, "<span>").replace(/<\/spoiler>/g, "</span>");
  // Auto-link plain URLs that are not already inside <a> tags
  content = content.replace(
    /(?<!href="|">)(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>'
  );
  // Transform GitHub <a> links into styled cards
  content = content.replace(
    /<a href="(https?:\/\/github\.com\/[^"]+)"[^>]*>[^<]*<\/a>/g,
    (_, url) => githubLinkToCard(url)
  );
  // Convert double newlines to paragraphs, single to <br>
  const paragraphs = content.split(/\n\n+/);
  content = paragraphs
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return content;
}

// ——— SEO generation via AI ———

interface TagMeta {
  slug: string;
  nameUk: string;
  nameEn: string;
}

interface SeoMeta {
  title: string;
  excerpt: string;
  tags: TagMeta[];
}

const SEO_PROMPT_UK = `Ти — SEO-спеціаліст. На основі тексту статті створи:
1. title — SEO-заголовок українською (до 70 символів)
2. excerpt — meta description українською (до 160 символів)
3. tags — масив з 3-5 тегів, кожен з полями: slug (латиницею, lowercase, через дефіс), nameUk (українська назва), nameEn (англійська назва)

Поверни ТІЛЬКИ валідний JSON без markdown-обгортки:
{"title": "...", "excerpt": "...", "tags": [{"slug": "ai-tools", "nameUk": "AI інструменти", "nameEn": "AI Tools"}, ...]}`;

const SEO_PROMPT_EN = `You are an SEO specialist. Based on the article text, create:
1. title — SEO title in English (up to 70 characters)
2. excerpt — meta description in English (up to 160 characters)
3. tags — array of 3-5 tags, each with fields: slug (lowercase, hyphen-separated), nameUk (Ukrainian name), nameEn (English name)

Return ONLY valid JSON without markdown wrapping:
{"title": "...", "excerpt": "...", "tags": [{"slug": "ai-tools", "nameUk": "AI інструменти", "nameEn": "AI Tools"}, ...]}`;

function parseTags(rawTags: unknown): TagMeta[] {
  if (!Array.isArray(rawTags)) return [];
  return rawTags.slice(0, 5).map((t) => {
    if (typeof t === "string") {
      return { slug: t, nameUk: t.replace(/-/g, " "), nameEn: t.replace(/-/g, " ") };
    }
    if (t && typeof t === "object") {
      return {
        slug: String(t.slug || ""),
        nameUk: String(t.nameUk || t.slug || "").slice(0, 100),
        nameEn: String(t.nameEn || t.slug || "").slice(0, 100),
      };
    }
    return null;
  }).filter((t): t is TagMeta => t !== null && t.slug.length > 0);
}

export async function generateSeoMeta(htmlText: string, locale: "uk" | "en"): Promise<SeoMeta> {
  const prompt = locale === "uk" ? SEO_PROMPT_UK : SEO_PROMPT_EN;
  try {
    const raw = await llmCall(prompt, stripHtml(htmlText), 0.3);
    // Strip potential markdown code fences
    const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(jsonStr);
    return {
      title: String(parsed.title || "").slice(0, 200),
      excerpt: String(parsed.excerpt || "").slice(0, 500),
      tags: parseTags(parsed.tags),
    };
  } catch (err) {
    console.warn(`[VaibeCod] SEO generation failed (${locale}), using fallback:`, (err as Error).message);
    return {
      title: fallbackTitle(htmlText),
      excerpt: fallbackExcerpt(htmlText),
      tags: [],
    };
  }
}

// ——— Translate to English ———

const TRANSLATE_EN_PROMPT = `You are a professional translator. Translate the following text from Ukrainian to English.

The text may contain HTML markup. CRITICAL rules:
- PRESERVE ALL HTML tags EXACTLY as they are — do not remove, add, or modify attributes
- Every opening tag MUST have a matching closing tag
- Do NOT translate content inside <code> and <pre> — it is program code
- Do NOT translate URLs, @usernames, #hashtags, technology names
- Return ONLY the translated text without explanations`;

export async function translateToEnglish(htmlText: string): Promise<string> {
  return llmCall(TRANSLATE_EN_PROMPT, htmlText, 0.3);
}

// ——— VaibeCod API client ———

interface VaibeCodePayload {
  slug: string;
  uk?: { title: string; content: string; excerpt?: string };
  en?: { title: string; content: string; excerpt?: string };
  coverImage?: string;
  published: boolean;
  publishedAt?: string;
  tags?: TagMeta[];
}

interface VaibeCodeResponse {
  translationId: string;
  slug: string;
  published: boolean;
  posts: { id: string; slug: string; locale: string; url: string }[];
}

async function publishToVaibeCod(payload: VaibeCodePayload): Promise<VaibeCodeResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${config.vaibeCod.apiUrl}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.vaibeCod.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      // Retry with modified slug on duplicate
      if (res.status === 400 && body.includes("slug")) {
        const suffix = Math.random().toString(36).slice(2, 6);
        payload.slug = `${payload.slug}-${suffix}`;
        const retryRes = await fetch(`${config.vaibeCod.apiUrl}/posts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.vaibeCod.apiKey}`,
          },
          body: JSON.stringify(payload),
        });
        if (!retryRes.ok) {
          throw new Error(`VaibeCod API error (retry): ${retryRes.status} ${await retryRes.text()}`);
        }
        return retryRes.json() as Promise<VaibeCodeResponse>;
      }
      throw new Error(`VaibeCod API error: ${res.status} ${body}`);
    }

    return res.json() as Promise<VaibeCodeResponse>;
  } finally {
    clearTimeout(timeout);
  }
}

// ——— Media helpers ———

interface MediaFile {
  id: number;
  type: string;
  filePath: string;
  fileName?: string | null;
  mimeType?: string | null;
}

/**
 * Upload a file to VaibeCod and return the uploaded path (e.g. "/uploads/1713200000-abc.jpg")
 */
function getMimeType(fileName: string, mimeType?: string | null): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const ext = path.extname(fileName).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
    ".mp4": "video/mp4", ".webm": "video/webm", ".ogg": "video/ogg",
    ".mov": "video/mp4",
  };
  return mimeMap[ext] || "application/octet-stream";
}

async function uploadToVaibeCod(filePath: string, fileName: string, mimeType?: string | null): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const resolvedMime = getMimeType(fileName, mimeType);

  // Build multipart/form-data manually to ensure correct Content-Type
  const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${resolvedMime}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const headerBuf = Buffer.from(header);
  const footerBuf = Buffer.from(footer);
  const body = Buffer.concat([headerBuf, fileBuffer, footerBuf]);

  const res = await fetch(`${config.vaibeCod.apiUrl}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.vaibeCod.apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`VaibeCod upload failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as any;
  return data.url || data.path || data.filePath;
}

/**
 * Upload all media files to VaibeCod, return array of { type, uploadedUrl }
 */
async function uploadMediaFiles(mediaFiles: MediaFile[]): Promise<{ type: string; url: string; fileName: string }[]> {
  const results: { type: string; url: string; fileName: string }[] = [];
  const seen = new Set<string>();
  for (const m of mediaFiles) {
    if (seen.has(m.filePath)) continue;
    seen.add(m.filePath);
    const localPath = path.join(MEDIA_DIR, m.filePath);
    if (!fs.existsSync(localPath)) {
      console.warn(`[VaibeCod] Media file not found: ${localPath}, skipping`);
      continue;
    }
    try {
      const uploadedUrl = await uploadToVaibeCod(localPath, m.fileName || path.basename(m.filePath), m.mimeType);
      results.push({ type: m.type, url: uploadedUrl, fileName: m.fileName || path.basename(m.filePath) });
    } catch (err) {
      console.warn(`[VaibeCod] Failed to upload media ${m.id}:`, (err as Error).message);
    }
  }
  return results;
}

function buildMediaHtml(uploadedMedia: { type: string; url: string; fileName: string }[]): string {
  if (uploadedMedia.length === 0) return "";
  const parts: string[] = [];
  for (const m of uploadedMedia) {
    if (m.type === "photo") {
      parts.push(`<img src="${m.url}" alt="${m.fileName}" style="max-width:100%;height:auto;" />`);
    } else if (m.type === "video" || m.type === "animation") {
      parts.push(`<video src="${m.url}" controls style="max-width:100%;height:auto;"></video>`);
    }
  }
  return parts.length > 0 ? `<div>${parts.join("")}</div>` : "";
}

// ——— Main publish flow ———

export async function publishPostToVaibeCod(
  post: { id: number; publishedAt: Date | null; vaibeCodUrl: string | null; mediaFiles?: MediaFile[] },
  htmlText: string
): Promise<string | null> {
  if (!config.vaibeCod.apiKey) return null;
  if (post.vaibeCodUrl) return post.vaibeCodUrl; // already published

  const publishedAt = post.publishedAt?.toISOString() || new Date().toISOString();
  const media = post.mediaFiles || [];

  // Upload media files to VaibeCod
  let uploadedMedia: { type: string; url: string; fileName: string }[] = [];
  if (media.length > 0) {
    console.log(`[VaibeCod] Uploading ${media.length} media files for post #${post.id}...`);
    uploadedMedia = await uploadMediaFiles(media);
  }
  const coverImage = uploadedMedia.find((m) => m.type === "photo")?.url;
  // Exclude cover image from content — it's already shown as preview
  const contentMedia = coverImage
    ? uploadedMedia.filter((m) => m.url !== coverImage)
    : uploadedMedia;
  const mediaHtml = buildMediaHtml(contentMedia);

  // 1. Generate SEO meta for UK
  const seoUk = await generateSeoMeta(htmlText, "uk");
  const slug = generateSlug(seoUk.title, post.id);
  const contentUk = mediaHtml + prepareContentForWeb(htmlText);

  // 2. Translate to English and generate SEO
  console.log(`[VaibeCod] Translating to English for post #${post.id}...`);
  const englishContent = await translateToEnglish(htmlText);
  const seoEn = await generateSeoMeta(englishContent, "en");
  const contentEn = mediaHtml + prepareContentForWeb(englishContent);

  // 3. Publish both locales in a single API call
  console.log(`[VaibeCod] Publishing post #${post.id} (uk+en, ${media.length} media)...`);
  const result = await publishToVaibeCod({
    slug,
    uk: {
      title: seoUk.title,
      content: contentUk,
      excerpt: seoUk.excerpt,
    },
    en: {
      title: seoEn.title,
      content: contentEn,
      excerpt: seoEn.excerpt,
    },
    coverImage,
    tags: seoUk.tags,
    published: true,
    publishedAt,
  });

  // 4. Save results
  const ukPost = result.posts.find((p) => p.locale === "uk");
  const enPost = result.posts.find((p) => p.locale === "en");
  await updatePostVaibeCod(
    post.id,
    ukPost?.id || result.translationId,
    ukPost?.url || result.posts[0]?.url || `/uk/blog/${slug}`,
    enPost?.id || "",
    enPost?.url || `/en/blog/${slug}`
  );
  console.log(`[VaibeCod] Post #${post.id} published: UK=${ukPost?.url}, EN=${enPost?.url}`);

  return ukPost?.url || result.posts[0]?.url || null;
}

// ——— Sync already published posts ———

export async function syncPublishedToVaibeCod(): Promise<void> {
  if (!config.vaibeCod.apiKey) {
    console.log("[VaibeCod] No API key configured, skipping sync");
    return;
  }

  const posts = await getPublishedPostsWithoutVaibeCod(100, 0);
  if (posts.length === 0) {
    console.log("[VaibeCod] All published posts already synced");
    return;
  }

  console.log(`[VaibeCod] Syncing ${posts.length} published posts...`);
  let synced = 0;
  let failed = 0;

  for (const post of posts) {
    try {
      // Build htmlText from the post (same logic as publisher.ts)
      let htmlText: string;
      if (post.translatedText) {
        htmlText = post.translatedText;
      } else {
        htmlText = entitiesToTelegramHtml(
          stripMarkdownArtifacts(post.originalText),
          (post.entities as any[]) || []
        );
      }

      await publishPostToVaibeCod(
        { id: post.id, publishedAt: post.publishedAt, vaibeCodUrl: post.vaibeCodUrl, mediaFiles: post.mediaFiles },
        htmlText
      );
      synced++;

      // Rate limit: 500ms between requests
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      failed++;
      console.error(`[VaibeCod] Failed to sync post #${post.id}:`, (err as Error).message);
    }
  }

  console.log(`[VaibeCod] Sync complete: ${synced} synced, ${failed} failed`);
}
