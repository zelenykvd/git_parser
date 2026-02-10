import { Api } from "telegram";

interface EntityRange {
  offset: number;
  length: number;
  type: string;
  url?: string;
  language?: string;
}

const MD_CHARS = "*_~`|";

/**
 * Strip markdown markers that gramjs MarkdownParser.unparse() inserts.
 * Old posts have originalText from message.text (with ** etc.) but
 * entities with offsets for the clean text (message.message).
 * Stripping restores alignment between text and entity offsets.
 */
export function stripMarkdownArtifacts(text: string): string {
  return text.replace(/\*\*/g, "").replace(/__/g, "").replace(/~~/g, "");
}

/**
 * Escape markdown-significant characters so they are not misinterpreted as formatting.
 */
function escapeMarkdownChar(ch: string): string {
  return MD_CHARS.includes(ch) ? "\\" + ch : ch;
}

/**
 * Convert Telegram message entities to Markdown text.
 * Characters outside entity ranges are escaped so that literal *, _, ~ etc.
 * are not misinterpreted as markdown formatting.
 */
export function entitiesToMarkdown(
  text: string,
  entities: EntityRange[]
): string {
  // Convert string to array of code points for proper Unicode handling
  const chars = [...text];

  if (!entities || entities.length === 0) {
    return chars.map((ch) => escapeMarkdownChar(ch)).join("");
  }

  // Find character positions covered by at least one entity
  const covered = new Set<number>();
  for (const e of entities) {
    for (let i = e.offset; i < e.offset + e.length; i++) {
      covered.add(i);
    }
  }

  // Escape markdown chars at positions NOT covered by any entity
  let result: string[] = chars.map((ch, i) =>
    covered.has(i) ? ch : escapeMarkdownChar(ch)
  );

  // Sort entities by offset (descending) so we process from end to start
  // to preserve offsets when inserting markers
  const sorted = [...entities].sort((a, b) => {
    if (b.offset !== a.offset) return b.offset - a.offset;
    return b.length - a.length;
  });

  for (const entity of sorted) {
    const start = entity.offset;
    const end = entity.offset + entity.length;
    const content = result.slice(start, end).join("");

    let replacement: string;

    switch (entity.type) {
      case "bold":
        replacement = `**${content}**`;
        break;
      case "italic":
        replacement = `*${content}*`;
        break;
      case "code":
        replacement = `\`${content}\``;
        break;
      case "pre":
        replacement = entity.language
          ? `\`\`\`${entity.language}\n${content}\n\`\`\``
          : `\`\`\`\n${content}\n\`\`\``;
        break;
      case "textUrl":
        replacement = `[${content}](${entity.url})`;
        break;
      case "url":
        replacement = content;
        break;
      case "strikethrough":
        replacement = `~~${content}~~`;
        break;
      case "underline":
        replacement = `__${content}__`;
        break;
      case "blockquote":
        replacement = content
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        break;
      case "spoiler":
        replacement = `||${content}||`;
        break;
      case "mention":
      case "hashtag":
      case "botCommand":
        replacement = content;
        break;
      default:
        replacement = content;
    }

    result = [
      ...result.slice(0, start),
      ...([...replacement] as string[]),
      ...result.slice(end),
    ];
  }

  return result.join("");
}

/**
 * Get opening and closing HTML tags for an entity type.
 */
function entityToTags(e: EntityRange): [string, string] {
  switch (e.type) {
    case "bold": return ["<b>", "</b>"];
    case "italic": return ["<i>", "</i>"];
    case "code": return ["<code>", "</code>"];
    case "pre": return e.language
      ? [`<pre><code class="language-${e.language}">`, "</code></pre>"]
      : ["<pre>", "</pre>"];
    case "textUrl": return [`<a href="${e.url}">`, "</a>"];
    case "strikethrough": return ["<s>", "</s>"];
    case "underline": return ["<u>", "</u>"];
    case "blockquote": return ["<blockquote>", "</blockquote>"];
    case "spoiler": return ["<spoiler>", "</spoiler>"];
    default: return ["", ""];
  }
}

/**
 * Convert Telegram message entities directly to Telegram HTML.
 *
 * Uses UTF-16 string indices (substring) to match Telegram entity offsets.
 * Handles nested entities correctly via open/close event map.
 */
export function entitiesToTelegramHtml(
  text: string,
  entities: EntityRange[]
): string {
  if (!entities || entities.length === 0) return escapeHtml(text);

  // Build open/close tag events keyed by UTF-16 position
  const opens = new Map<number, { tag: string; length: number }[]>();
  const closes = new Map<number, { tag: string; length: number }[]>();

  for (const e of entities) {
    const [open, close] = entityToTags(e);
    if (!open) continue;

    if (!opens.has(e.offset)) opens.set(e.offset, []);
    opens.get(e.offset)!.push({ tag: open, length: e.length });

    const closePos = e.offset + e.length;
    if (!closes.has(closePos)) closes.set(closePos, []);
    closes.get(closePos)!.push({ tag: close, length: e.length });
  }

  // Sort: opens by length descending (outer first), closes by length ascending (inner first)
  for (const [, arr] of opens) arr.sort((a, b) => b.length - a.length);
  for (const [, arr] of closes) arr.sort((a, b) => a.length - b.length);

  let result = "";

  for (let i = 0; i <= text.length; i++) {
    // Close tags at this position (inner first for proper nesting)
    if (closes.has(i)) {
      result += closes.get(i)!.map((t) => t.tag).join("");
    }
    // Open tags at this position (outer first for proper nesting)
    if (opens.has(i)) {
      result += opens.get(i)!.map((t) => t.tag).join("");
    }

    if (i < text.length) {
      const code = text.charCodeAt(i);
      // Handle surrogate pairs (emoji etc.) — don't split them
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        result += text[i] + text[i + 1];
        i++; // skip low surrogate
      } else {
        const ch = text[i];
        if (ch === "&") result += "&amp;";
        else if (ch === "<") result += "&lt;";
        else if (ch === ">") result += "&gt;";
        else result += ch;
      }
    }
  }

  return result;
}

/**
 * Extract entity info from GramJS message entities.
 */
export function parseGramJSEntities(
  entities: Api.TypeMessageEntity[] | undefined
): EntityRange[] {
  if (!entities) return [];

  return entities.map((e) => {
    const base = {
      offset: e.offset,
      length: e.length,
    };

    if (e instanceof Api.MessageEntityBold) return { ...base, type: "bold" };
    if (e instanceof Api.MessageEntityItalic) return { ...base, type: "italic" };
    if (e instanceof Api.MessageEntityCode) return { ...base, type: "code" };
    if (e instanceof Api.MessageEntityPre)
      return { ...base, type: "pre", language: (e as any).language || "" };
    if (e instanceof Api.MessageEntityTextUrl)
      return { ...base, type: "textUrl", url: (e as any).url };
    if (e instanceof Api.MessageEntityUrl) return { ...base, type: "url" };
    if (e instanceof Api.MessageEntityStrike)
      return { ...base, type: "strikethrough" };
    if (e instanceof Api.MessageEntityUnderline)
      return { ...base, type: "underline" };
    if (e instanceof Api.MessageEntityBlockquote)
      return { ...base, type: "blockquote" };
    if (e instanceof Api.MessageEntitySpoiler)
      return { ...base, type: "spoiler" };
    if (e instanceof Api.MessageEntityMention)
      return { ...base, type: "mention" };
    if (e instanceof Api.MessageEntityHashtag)
      return { ...base, type: "hashtag" };
    if (e instanceof Api.MessageEntityBotCommand)
      return { ...base, type: "botCommand" };

    return { ...base, type: "unknown" };
  });
}

/**
 * Convert Markdown back to Telegram HTML for publishing.
 */
// Placeholders for escaped markdown chars (Unicode Private Use Area)
const ESC_MAP: [RegExp, string, string][] = [
  [/\\\*/g, "\uE001", "*"],
  [/\\_/g, "\uE002", "_"],
  [/\\~/g, "\uE003", "~"],
  [/\\`/g, "\uE004", "`"],
  [/\\\|/g, "\uE005", "|"],
];

export function markdownToTelegramHtml(md: string): string {
  let html = md;

  // Protect escaped markdown chars from being processed as formatting
  for (const [pattern, placeholder] of ESC_MAP) {
    html = html.replace(pattern, placeholder);
  }

  // Code blocks: ```lang\n...\n``` → <pre><code class="language-lang">...</code></pre>
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) =>
      lang
        ? `<pre><code class="language-${lang}">${escapeHtml(code.trimEnd())}</code></pre>`
        : `<pre>${escapeHtml(code.trimEnd())}</pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Underline
  html = html.replace(/__(.+?)__/g, "<u>$1</u>");

  // Italic (after bold to avoid conflicts)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blockquotes (including empty `> ` lines)
  html = html.replace(/^> ?(.*)$/gm, "<blockquote>$1</blockquote>");
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, "\n");

  // Spoilers
  html = html.replace(/\|\|(.+?)\|\|/g, '<spoiler>$1</spoiler>');

  // Restore escaped chars as literals
  for (const [, placeholder, literal] of ESC_MAP) {
    html = html.replaceAll(placeholder, literal);
  }

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
