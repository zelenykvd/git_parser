/**
 * Canonical HTML helpers. Three near-identical copies of tag stripping used to
 * live in publisher.ts, vaibecod.ts and linkedin.ts — keep new variants out.
 */

const ENTITIES: [RegExp, string][] = [
  [/&nbsp;/g, " "],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  // Ampersand last, so decoded entities are not re-decoded
  [/&amp;/g, "&"],
];

function decodeEntities(text: string): string {
  return ENTITIES.reduce((acc, [re, ch]) => acc.replace(re, ch), text);
}

/** Drop all tags, leaving a single run of plain text. */
export function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ""));
}

/**
 * Drop all tags but keep the block structure as newlines — for targets that
 * render plain text yet still need paragraphs (LinkedIn, previews).
 */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n");
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Escape a string for safe use inside an HTML attribute. */
export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
