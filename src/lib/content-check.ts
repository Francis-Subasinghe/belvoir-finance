/**
 * Content checks that run in CI (via Vitest) and from `npm run check:content`.
 * - F1-11: no .mdx anywhere under content/.
 * - F1-12: Markdoc uses only allowlisted tags and contains no raw HTML.
 * - Links in content are internal or https (ADR-0001, security requirement 2).
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import Markdoc from "@markdoc/markdoc";
import { allowedTags } from "./markdoc-allowlist.ts";
import { toSafeLink } from "./links.ts";

export interface ContentProblem {
  file?: string | undefined;
  line?: number | undefined;
  rule: "mdx-forbidden" | "markdoc-invalid" | "raw-html" | "unsafe-link";
  message: string;
}

export function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

export function findMdx(contentDir: string): string[] {
  return listFiles(contentDir).filter((f) => f.toLowerCase().endsWith(".mdx"));
}

const htmlTokenizer = new Markdoc.Tokenizer({ html: true });

interface Tok {
  type: string;
  map?: [number, number] | null;
  children?: Tok[] | null;
}

function findRawHtml(source: string): number[] {
  const lines: number[] = [];
  const visit = (toks: Tok[], line?: number) => {
    for (const t of toks) {
      const here = t.map ? t.map[0] + 1 : line;
      if (t.type === "html_block" || t.type === "html_inline") lines.push(here ?? 0);
      if (t.children) visit(t.children, here);
    }
  };
  visit(htmlTokenizer.tokenize(source) as unknown as Tok[]);
  return lines;
}

export function checkMarkdoc(source: string, file?: string): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const ast = Markdoc.parse(source);
  const config = { tags: allowedTags } as unknown as Parameters<typeof Markdoc.validate>[1];
  for (const e of Markdoc.validate(ast, config)) {
    problems.push({
      file,
      line: e.lines[0] !== undefined ? e.lines[0] + 1 : undefined,
      rule: "markdoc-invalid",
      message: `${e.error.id}: ${e.error.message}`,
    });
  }
  for (const line of findRawHtml(source)) {
    problems.push({ file, line, rule: "raw-html", message: "raw HTML is not allowed in content" });
  }
  for (const node of ast.walk()) {
    // markdown-it refuses dangerous link schemes and leaves them as inert
    // text; flag them anyway so authors see the problem.
    if (node.type === "text" && /\]\(\s*(?:javascript|vbscript|data):/i.test(String(node.attributes.content ?? ""))) {
      problems.push({
        file,
        line: node.lines[0] !== undefined ? node.lines[0] + 1 : undefined,
        rule: "unsafe-link",
        message: "link with a javascript:, vbscript: or data: URL refused",
      });
    }
    if (node.type === "link" || node.type === "image") {
      const attr = node.type === "link" ? "href" : "src";
      const value = node.attributes[attr] as string | undefined;
      const res = toSafeLink(value);
      const bad = !res.ok || (node.type === "image" && res.external);
      if (bad) {
        problems.push({
          file,
          line: node.lines[0] !== undefined ? node.lines[0] + 1 : undefined,
          rule: "unsafe-link",
          message: `${node.type} ${attr} "${value ?? ""}" refused: ${res.ok ? "external images are not allowed" : res.reason}`,
        });
      }
    }
  }
  return problems;
}

export async function checkContentDir(
  contentDir: string,
  read: (f: string) => Promise<string>,
): Promise<ContentProblem[]> {
  const problems: ContentProblem[] = findMdx(contentDir).map((f) => ({
    file: relative(process.cwd(), f),
    rule: "mdx-forbidden" as const,
    message: ".mdx files are not allowed under content/ (Markdoc only)",
  }));
  for (const f of listFiles(contentDir).filter((x) => x.endsWith(".mdoc") || x.endsWith(".md"))) {
    problems.push(...checkMarkdoc(await read(f), relative(process.cwd(), f)));
  }
  return problems;
}
