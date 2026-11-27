import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  parseBlocks,
  RichContentRenderer,
  tokenizeInline,
  uploadsImagePattern,
} from "./rich-content-renderer.js";

// Component test in the node environment (no jsdom): render to static markup and
// assert on the emitted HTML. This proves what reaches the DOM, including that
// author-supplied HTML never becomes a live element.
function render(content: string): string {
  return renderToStaticMarkup(<RichContentRenderer content={content} />);
}

const validUpload = "/uploads/3f1c9b2e-8a4d-4c7e-9f10-2b6a5d8e1c33.png";

describe("RichContentRenderer — stored XSS (RISK-QB-003)", () => {
  it("escapes <script> as text and never emits a live script element", () => {
    const html = render("<script>alert(1)</script>");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("alert(1)");
  });

  it("escapes arbitrary raw HTML tags", () => {
    const html = render("<b onclick=\"alert(1)\">in đậm</b> & <img src=x onerror=alert(1)>");
    expect(html).not.toContain("<b");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;b");
    expect(html).toContain("in đậm");
  });

  it("keeps javascript: URLs as inert text, never an href/src", () => {
    const html = render("[nhấn vào đây](javascript:alert(1)) và ![ảnh](javascript:alert(2))");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a");
    expect(html).toContain("javascript:alert(1)");
    expect(html).toContain("javascript:alert(2)");
  });

  it("refuses external image URLs and renders the markdown as text", () => {
    const html = render("![ảnh](https://evil.example/a.png)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example/a.png\"");
    expect(html).toContain("https://evil.example/a.png");
  });

  it("refuses protocol-relative and traversal /uploads/ paths", () => {
    expect(render("![x](//evil.example/a.png)")).not.toContain("<img");
    expect(render("![x](/uploads/../../etc/passwd)")).not.toContain("<img");
    expect(render("![x](/uploads/not-a-uuid.png)")).not.toContain("<img");
    expect(uploadsImagePattern.test(validUpload)).toBe(true);
    expect(uploadsImagePattern.test("/uploads/not-a-uuid.png")).toBe(false);
  });

  it("renders a valid /uploads/ image with its alt text", () => {
    const html = render(`![Biểu đồ hàm số](${validUpload})`);
    expect(html).toContain("<img");
    expect(html).toContain(`src="${validUpload}"`);
    expect(html).toContain('alt="Biểu đồ hàm số"');
  });

  it("never lets HTML injected through a math expression execute", () => {
    const html = render("$<script>alert(1)</script>$");
    expect(html).not.toContain("<script");
    expect(html).toContain("katex");
  });
});

describe("RichContentRenderer — math, code and structure", () => {
  it("renders inline and display math and retains the MathML span", () => {
    const html = render("Công thức $x^2$ và\n\n$$\\frac{1}{2}$$");
    expect(html).toContain("katex");
    expect(html).toContain("katex-mathml");
    expect(html).toContain("<math");
    expect(html).toContain("x");
  });

  it("escapes fenced code and keeps the block keyboard reachable", () => {
    const html = render("```\nconst x = '<script>alert(1)</script>';\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("tabindex=\"0\"");
    expect(html).toContain("<code");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script");
  });

  it("does not throw on malformed TeX", () => {
    expect(() => render("$\\frac{}{}$")).not.toThrow();
    expect(render("$\\frac{}{}$")).toContain("katex");
  });

  it("shows an empty-state placeholder for blank content", () => {
    expect(render("   \n\n ")).toContain("Chưa có nội dung để xem trước");
  });
});

describe("parseBlocks / tokenizeInline", () => {
  it("splits paragraphs on blank lines and isolates code and display math", () => {
    const blocks = parseBlocks("Một\n\n$$\nx^2\n$$\n\n```\ncode()\n```\n\nHai");
    expect(blocks).toEqual([
      { kind: "paragraph", text: "Một" },
      { kind: "math", tex: "x^2" },
      { kind: "code", code: "code()" },
      { kind: "paragraph", text: "Hai" },
    ]);
  });

  it("tokenizes inline math, images and plain text in order", () => {
    const tokens = tokenizeInline(`A $x$ B ![alt](${validUpload}) C`);
    expect(tokens.map((token) => token.kind)).toEqual(["text", "math", "text", "image", "text"]);
    expect(tokens[1]).toEqual({ kind: "math", tex: "x" });
    expect(tokens[3]).toEqual({ kind: "image", alt: "alt", url: validUpload });
  });

  it("keeps a javascript: image token as a token so the renderer can refuse it", () => {
    expect(tokenizeInline("![x](javascript:alert(1))")).toEqual([
      { kind: "image", alt: "x", url: "javascript:alert(1)" },
    ]);
  });
});
