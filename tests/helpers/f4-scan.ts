/**
 * F4 source and bundle scans. Each function is pure over (file, text), so the
 * real tree, the dist/ bundle and every negative fixture in
 * tests/fixtures/f4/source/ go through exactly the same code (AGENTS.md
 * rule 7).
 *
 * F4-01 pure modules · F4-13 one money formatter · F4-27 no network, storage
 * or URL APIs · F4-30 no inline or define:vars scripts · F4-31 no islands ·
 * F4-32 no eval or HTML sinks · F4-33 no inline styles.
 */
export type F4Rule = "F4-01" | "F4-13" | "F4-27" | "F4-30" | "F4-31" | "F4-32" | "F4-33";

export interface F4Problem {
  file: string;
  rule: F4Rule;
  message: string;
}

/**
 * Removes JS comments (block and line) so prose like "no Date" in a doc
 * comment isn't a hit. Strings and regex literals are kept as they are; a
 * "//" inside a string literal is skipped by tracking the quote state.
 */
export function stripJsComments(text: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const c = text.charAt(i);
    const next = text.charAt(i + 1);
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next;
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      out += " ";
      continue;
    }
    if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function hits(file: string, text: string, rule: F4Rule, checks: readonly [RegExp, string][]): F4Problem[] {
  // Emitted bundles are scanned as they are (stricter); sources without comments.
  const code = /\.m?js$/.test(file) ? text : stripJsComments(text);
  return checks.filter(([re]) => re.test(code)).map(([, message]) => ({ file, rule, message }));
}

/* ------------------------------------------------------------------ F4-01 */

const IMPURE: readonly [RegExp, string][] = [
  [/\bdocument\b/, "uses document"],
  [/\bwindow\b/, "uses window"],
  [/\bglobalThis\b/, "uses globalThis"],
  [/\bself\b/, "uses self"],
  [/\bnavigator\b/, "uses navigator"],
  [/\blocation\b/, "uses location"],
  [/\bhistory\b/, "uses history"],
  [/\b(?:local|session)Storage\b/, "uses web storage"],
  [/\bindexedDB\b/, "uses indexedDB"],
  [/\bfetch\s*\(/, "calls fetch"],
  [/\bXMLHttpRequest\b/, "uses XMLHttpRequest"],
  [/\bDate\b/, "uses Date"],
  [/\bperformance\b/, "uses performance"],
  [/\bMath\.random\b/, "uses Math.random"],
  [/\bcrypto\b/, "uses crypto"],
  [/\bprocess\b/, "uses process"],
  [/\bimport\s*\(/, "dynamic import"],
  [/\brequire\s*\(/, "uses require"],
];

/** F4-01: no DOM, network, storage, Date or randomness, and no import from outside the folder. */
export function pureModuleProblems(file: string, text: string): F4Problem[] {
  const problems = hits(file, text, "F4-01", IMPURE);
  const code = stripJsComments(text);
  for (const m of code.matchAll(
    /\b(?:import|export)\b[^"';]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g,
  )) {
    const spec = m[1] ?? m[2] ?? "";
    if (!/^\.\/[\w.-]+\.ts$/.test(spec)) {
      problems.push({ file, rule: "F4-01", message: `imports ${spec} (only ./<file>.ts in the same folder)` });
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ F4-13 */

/** F4-13: formatGBP (format.ts) is the only path from a number to money text. */
export function moneyPathProblems(file: string, text: string): F4Problem[] {
  return hits(file, text, "F4-13", [
    [/\.toFixed\s*\(/, "toFixed outside formatGBP"],
    [/\.toLocaleString\s*\(/, "toLocaleString outside formatGBP"],
    [/\bIntl\s*\.\s*NumberFormat\b/, "Intl.NumberFormat outside formatGBP"],
    [/\.toPrecision\s*\(/, "toPrecision outside formatGBP"],
  ]);
}

/* ------------------------------------------------------------------ F4-27 */

const BANNED_APIS: readonly [RegExp, string][] = [
  [/\bfetch\s*\(/, "fetch("],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bsendBeacon\b/, "sendBeacon"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bEventSource\b/, "EventSource"],
  [/\blocalStorage\b/, "localStorage"],
  [/\bsessionStorage\b/, "sessionStorage"],
  [/\bdocument\s*\.\s*cookie\b/, "document.cookie"],
  [/\bcookieStore\b/, "cookieStore"],
  [/\bindexedDB\b/, "indexedDB"],
  [/\bcaches\b/, "caches"],
  [/\bserviceWorker\b/, "serviceWorker"],
  [/\bpushState\b/, "history.pushState"],
  [/\breplaceState\b/, "history.replaceState"],
  [/\blocation\s*(?:\.\s*(?:href|hash|search|pathname))?\s*=(?!=)/, "assignment to location"],
  [/\blocation\s*\.\s*(?:assign|replace|reload)\s*\(/, "location navigation"],
  [/\bimport\s*\(/, "import("],
  [/\bpostMessage\b/, "postMessage"],
  [/\bwindow\s*\.\s*open\s*\(/, "window.open"],
];

/** F4-27: no request, storage, cookie or URL change, in the source or the emitted bundle. */
export function bannedApiProblems(file: string, text: string): F4Problem[] {
  return hits(file, text, "F4-27", BANNED_APIS);
}

/* ------------------------------------------------------------------ F4-32 */

const SINKS: readonly [RegExp, string][] = [
  [/\beval\s*\(/, "eval("],
  [/\bnew\s+Function\b/, "new Function"],
  [/\bFunction\s*\(\s*["'`]/, "Function(string)"],
  [/\bset(?:Timeout|Interval)\s*\(\s*["'`]/, "setTimeout/setInterval with a string"],
  [/\binnerHTML\b/, "innerHTML"],
  [/\bouterHTML\b/, "outerHTML"],
  [/\binsertAdjacentHTML\b/, "insertAdjacentHTML"],
  [/\bdocument\s*\.\s*write(?:ln)?\b/, "document.write"],
  [/\bDOMParser\b/, "DOMParser"],
  [/\bcreateContextualFragment\b/, "createContextualFragment"],
  [/\bsetHTMLUnsafe\b/, "setHTMLUnsafe"],
];

/** F4-32: no eval and no HTML sinks; set:html in a component is checked by componentProblems. */
export function sinkProblems(file: string, text: string): F4Problem[] {
  return hits(file, text, "F4-32", SINKS);
}

/* ------------------------------------------------------------------ F4-33 */

const STYLE_WRITES: readonly [RegExp, string][] = [
  [/\.\s*style\s*(?:\.|\[|=(?!=))/, "element.style"],
  [/\bsetAttribute\s*\(\s*["'`]style["'`]/i, 'setAttribute("style")'],
  [/\bcssText\b/, "cssText"],
  [/\b(?:insertRule|deleteRule|addRule)\s*\(/, "CSSOM rule"],
  [/\bCSSStyleSheet\b/, "CSSStyleSheet"],
  [/\badoptedStyleSheets\b/, "adoptedStyleSheets"],
  [/\battributeStyleMap\b/, "attributeStyleMap"],
];

/** F4-33: state is shown with classes and `hidden`, never a style write. */
export function styleWriteProblems(file: string, text: string): F4Problem[] {
  return hits(file, text, "F4-33", STYLE_WRITES);
}

/* ------------------------------------------- F4-30 / F4-31 / F4-32 (.astro) */

/**
 * Astro templates: no is:inline, define:vars, client:* or set:html. JsonLd.astro
 * is the one exception for is:inline and set:html (F3: JSON-LD is data, not a
 * script), and it never gets client:* or define:vars either.
 */
export function componentProblems(file: string, text: string): F4Problem[] {
  const problems: F4Problem[] = [];
  const jsonLd = /(?:^|\/)JsonLd\.astro$/.test(file);
  if (!jsonLd && /\bis:inline\b/.test(text)) problems.push({ file, rule: "F4-30", message: "is:inline script" });
  if (/\bdefine:vars\b/.test(text)) problems.push({ file, rule: "F4-30", message: "define:vars" });
  if (/\bclient:[a-z]+\b/.test(text)) problems.push({ file, rule: "F4-31", message: "client:* island directive" });
  if (!jsonLd && /\bset:html\b/.test(text)) problems.push({ file, rule: "F4-32", message: "set:html" });
  return problems;
}

/** Every scan that applies to the browser script and to emitted .js files. */
export function scriptProblems(file: string, text: string): F4Problem[] {
  return [
    ...bannedApiProblems(file, text),
    ...sinkProblems(file, text),
    ...styleWriteProblems(file, text),
    ...moneyPathProblems(file, text),
  ];
}
