import Slugger from "github-slugger";

export type MarkdownAction =
  "bold" | "italic" | "code" | "link" | "h2" | "h3" | "ul" | "ol" | "quote" | "codeblock" | "hr";

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface MarkdownHeading {
  level: number;
  text: string;
  id: string;
}

export function slugify(text: string): string {
  const slugger = new Slugger();
  return slugger.slug(text);
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function extractHeadings(markdown: string): MarkdownHeading[] {
  const slugger = new Slugger();
  const headings: MarkdownHeading[] = [];
  let inFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const marker = match[1] ?? "";
    const rawText = match[2] ?? "";
    const text = stripInlineMarkdown(rawText);
    if (!text) continue;

    headings.push({ level: marker.length, text, id: slugger.slug(text) });
  }

  return headings;
}

export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~]/g, "");
}

export function countWords(markdown: string): number {
  const text = stripMarkdown(markdown);
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function readingMinutes(words: number, wordsPerMinute = 200): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): TextEdit {
  const selected = value.slice(start, end) || placeholder;
  const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
  const selectionStart = start + before.length;
  return {
    value: next,
    selectionStart,
    selectionEnd: selectionStart + selected.length,
  };
}

function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string | ((index: number) => string),
): TextEdit {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextBreak = value.indexOf("\n", end);
  const blockEnd = nextBreak === -1 ? value.length : nextBreak;
  const block = value.slice(lineStart, blockEnd);
  const lines = block.split("\n");
  const prefixed = lines
    .map((line, index) => `${typeof prefix === "string" ? prefix : prefix(index)}${line}`)
    .join("\n");
  const firstPrefix = typeof prefix === "string" ? prefix : prefix(0);
  const delta = prefixed.length - block.length;

  return {
    value: `${value.slice(0, lineStart)}${prefixed}${value.slice(blockEnd)}`,
    selectionStart: start + firstPrefix.length,
    selectionEnd: end + delta,
  };
}

export function applyMarkdownAction(
  value: string,
  start: number,
  end: number,
  action: MarkdownAction,
): TextEdit {
  switch (action) {
    case "bold":
      return wrapSelection(value, start, end, "**", "**", "texto");
    case "italic":
      return wrapSelection(value, start, end, "_", "_", "texto");
    case "code":
      return wrapSelection(value, start, end, "`", "`", "código");
    case "link":
      return wrapSelection(value, start, end, "[", "](url)", "texto");
    case "h2":
      return prefixLines(value, start, end, "## ");
    case "h3":
      return prefixLines(value, start, end, "### ");
    case "ul":
      return prefixLines(value, start, end, "- ");
    case "ol":
      return prefixLines(value, start, end, (index) => `${index + 1}. `);
    case "quote":
      return prefixLines(value, start, end, "> ");
    case "codeblock":
      return wrapSelection(value, start, end, "```\n", "\n```", "código");
    case "hr": {
      const needsLeadingBreak = start > 0 && value[start - 1] !== "\n";
      const insertion = `${needsLeadingBreak ? "\n\n" : ""}---\n\n`;
      const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
      return {
        value: next,
        selectionStart: start + insertion.length,
        selectionEnd: start + insertion.length,
      };
    }
    default:
      return { value, selectionStart: start, selectionEnd: end };
  }
}
