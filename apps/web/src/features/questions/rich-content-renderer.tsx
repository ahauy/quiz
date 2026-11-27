import type { ReactNode } from "react";
import katex from "katex";

// Fixed rich-content subset (BR-QB-016 / ADR-QB-05): $$..$$ and $..$ math,
// fenced code, /uploads/<uuid>.<ext> images, blank-line paragraphs. Author
// text is always rendered as React text (escaped); the only raw HTML that ever
// reaches the DOM is KaTeX's own escaped output.
// ponytail: katex.renderToString instead of the react-katex wrapper because
// react-katex ships no usable .d.ts (its dist/react-katex.d.ts is a JSDoc
// directory). Upgrade path: add a local module shim if the wrapper is desired.

export type RichBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "code"; code: string }
  | { kind: "math"; tex: string };

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "math"; tex: string }
  | { kind: "image"; alt: string; url: string };

// E-08 only serves names matching this shape; anything else is never an <img>.
export const uploadsImagePattern = /^\/uploads\/[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/;

// Image URLs may contain one balanced paren group (e.g. a javascript: payload);
// capture it whole so the whole markdown token is refused, not just a prefix.
const inlinePattern = /\$([^$\n]+)\$|!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

export function parseBlocks(content: string): RichBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: RichBlock[] = [];
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed === "") {
      flush();
      continue;
    }
    if (trimmed.startsWith("```")) {
      flush();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ kind: "code", code: code.join("\n") });
      continue;
    }
    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
      flush();
      blocks.push({ kind: "math", tex: trimmed.slice(2, -2).trim() });
      continue;
    }
    if (trimmed === "$$") {
      flush();
      const tex: string[] = [];
      index += 1;
      while (index < lines.length && (lines[index] ?? "").trim() !== "$$") {
        tex.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ kind: "math", tex: tex.join("\n") });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  inlinePattern.lastIndex = 0;
  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > cursor) tokens.push({ kind: "text", text: text.slice(cursor, match.index) });
    const tex = match[1];
    const alt = match[2];
    const url = match[3];
    if (tex !== undefined) tokens.push({ kind: "math", tex });
    else if (alt !== undefined && url !== undefined) tokens.push({ kind: "image", alt, url });
    cursor = match.index + (match[0] ?? "").length;
  }
  if (cursor < text.length) tokens.push({ kind: "text", text: text.slice(cursor) });
  return tokens;
}

function renderMath(tex: string, displayMode: boolean): ReactNode {
  let html: string;
  try {
    html = katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      // Keeps the MathML span for screen readers (NFR-QB-006).
      output: "htmlAndMathml",
      trust: false,
      strict: "ignore",
    });
  } catch {
    // Malformed TeX: never throw out of a render; show the source as escaped text.
    return <span className="text-red-700">{tex}</span>;
  }
  // ponytail: dangerouslySetInnerHTML is strictly bounded to KaTeX output;
  // author-supplied HTML never reaches this path.
  return (
    <span
      className={displayMode ? "block" : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderInline(text: string): ReactNode[] {
  return tokenizeInline(text).map((token, index) => {
    switch (token.kind) {
      case "text":
        return <span key={index}>{token.text}</span>;
      case "math":
        return <span key={index}>{renderMath(token.tex, false)}</span>;
      case "image":
        if (!uploadsImagePattern.test(token.url)) {
          // External / javascript: / traversal URLs stay visible as safe text.
          return <span key={index}>{`![${token.alt}](${token.url})`}</span>;
        }
        return (
          <img
            key={index}
            src={token.url}
            alt={token.alt}
            className="max-h-96 rounded-md border border-gray-200"
          />
        );
    }
  });
}

interface RichContentRendererProps {
  content: string;
  className?: string | undefined;
}

export function RichContentRenderer({ content, className = "" }: RichContentRendererProps) {
  const blocks = parseBlocks(content);
  return (
    <div
      data-testid="rich-content"
      className={`flex flex-col gap-2 text-sm text-gray-900 ${className}`}
    >
      {blocks.length === 0 ? (
        <p className="text-gray-600 italic">Chưa có nội dung để xem trước.</p>
      ) : null}
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "paragraph":
            return (
              <p key={index} className="whitespace-pre-line leading-relaxed">
                {renderInline(block.text)}
              </p>
            );
          case "code":
            return (
              <pre
                key={index}
                tabIndex={0}
                className="overflow-x-auto rounded-md border border-gray-300 bg-gray-50 p-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <code>{block.code}</code>
              </pre>
            );
          case "math":
            return (
              <div key={index} className="overflow-x-auto py-1">
                {renderMath(block.tex, true)}
              </div>
            );
        }
      })}
    </div>
  );
}
