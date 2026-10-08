/**
 * V1-23 to V1-28 and V1-57: the motion scan (D-2, D-5, Q-4), PostCSS over
 * source CSS (.css files and .astro <style> blocks) and built CSS. One
 * exported function, `scanV1Motion`, used by the unit test on src/, the build
 * test on dist/ and every negative fixture in tests/fixtures/v1/css/.
 *
 *  V1-23 @keyframes steps set only transform/translate/scale/rotate/opacity;
 *        transitions name only those (never `all`, never a bare shorthand).
 *  V1-24 every animation/transition declaration sits inside
 *        @media (prefers-reduced-motion: no-preference); animation-timeline also
 *        inside @supports (animation-timeline: view()). `none` values (the F1
 *        reduce rule) are exempt.
 *  V1-26 no animation-fill-mode backwards/both (longhand or shorthand), and no
 *        opacity below 1 outside @keyframes (base styles are always visible).
 *  V1-27 iteration count 1 only; no duration or delay over 1 s; no keyframes
 *        that alternate opacity more than once.
 *  V1-28 load animations: each ≤ 400 ms, the last one ends ≤ 800 ms after the
 *        first starts, at most 6 staggered steps (rules using :nth-child).
 *        Chart draw-in (keyframes named "*-draw") ≤ 600 ms (V1-31).
 *  V1-57 no rule combines a delay above 0 with keyframes whose first step sets
 *        opacity below 1 (no blink).
 */
import postcss, { type AtRule, type ChildNode, type Container, type Declaration, type Root } from "postcss";

export type MotionRule = "V1-23" | "V1-24" | "V1-26" | "V1-27" | "V1-28" | "V1-31" | "V1-57";
export interface MotionProblem {
  file: string;
  line?: number | undefined;
  rule: MotionRule;
  message: string;
}
export interface CssInput {
  file: string;
  css: string;
}

export const MOTION_CAPS = { element: 400, staggerEnd: 800, steps: 6, draw: 600, max: 1000 } as const;
const MOVABLE = new Set(["transform", "translate", "scale", "rotate", "opacity"]);
const KEYFRAME_OK = new Set([...MOVABLE, "animation-timing-function"]);
const TIME = /^(-?\d*\.?\d+)(ms|s)$/;
const EASING = /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|cubic-bezier\(.*\)|steps\(.*\))$/;

/** --name -> value from tokens.css (for resolving var() durations). */
export function tokenMap(tokensCss: string): Map<string, string> {
  const m = new Map<string, string>();
  postcss.parse(tokensCss).walkDecls(/^--/, (d) => {
    m.set(d.prop, d.value.trim());
  });
  return m;
}

function resolve(value: string, tokens: Map<string, string>, depth = 0): string {
  if (depth > 5) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_m, name: string, fb?: string) =>
    resolve(tokens.get(name) ?? fb ?? "", tokens, depth + 1),
  );
}

const ms = (t: string): number | undefined => {
  const m = TIME.exec(t.trim());
  if (!m) return undefined;
  return Number(m[1]) * (m[2] === "s" ? 1000 : 1);
};

function splitTop(v: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of v) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const words = (v: string) => splitTop(v, " ").filter(Boolean);

function ancestors(node: ChildNode): AtRule[] {
  const out: AtRule[] = [];
  let p: Container | Root | undefined = node.parent as Container | undefined;
  while (p && p.type !== "root") {
    if (p.type === "atrule") out.push(p as AtRule);
    p = p.parent as Container | undefined;
  }
  return out;
}
const inGuard = (n: ChildNode) =>
  ancestors(n).some((a) => a.name === "media" && /prefers-reduced-motion\s*:\s*no-preference/.test(a.params));
const inSupportsView = (n: ChildNode) =>
  ancestors(n).some((a) => a.name === "supports" && /animation-timeline\s*:\s*view\(\)/.test(a.params));
const inKeyframes = (n: ChildNode) => ancestors(n).some((a) => /keyframes$/.test(a.name));

interface Keyframes {
  steps: { at: number[]; opacity?: number }[];
}

/** One parsed animation: from a shorthand or the longhands on one rule. */
interface Anim {
  name: string;
  duration: number;
  delay: number;
  iterations: string;
  fill: string;
}

function parseAnimationShorthand(value: string, tokens: Map<string, string>): Anim[] {
  return splitTop(resolve(value, tokens)).map((one) => {
    const a: Anim = { name: "", duration: 0, delay: 0, iterations: "1", fill: "none" };
    let times = 0;
    for (const w of words(one)) {
      const t = ms(w);
      if (t !== undefined) {
        if (times === 0) a.duration = t;
        else a.delay = t;
        times++;
      } else if (/^(infinite|\d*\.?\d+)$/.test(w)) a.iterations = w;
      else if (/^(none|forwards|backwards|both)$/.test(w)) a.fill = w === "none" ? a.fill : w;
      else if (EASING.test(w) || /^(normal|reverse|alternate|alternate-reverse|running|paused)$/.test(w)) continue;
      else a.name = w;
    }
    return a;
  });
}

export function scanV1Motion(inputs: readonly CssInput[], tokens: Map<string, string>): MotionProblem[] {
  const problems: MotionProblem[] = [];
  const keyframes = new Map<string, Keyframes>();
  const roots = inputs.map((i) => ({ file: i.file, root: postcss.parse(i.css, { from: i.file }) }));

  // Pass 1: keyframes.
  for (const { file, root } of roots) {
    root.walkAtRules(/keyframes$/, (kf) => {
      const k: Keyframes = { steps: [] };
      kf.each((step) => {
        if (step.type !== "rule") return;
        const at = step.selector.split(",").map((s) => {
          const t = s.trim();
          return t === "from" ? 0 : t === "to" ? 100 : Number.parseFloat(t);
        });
        let opacity: number | undefined;
        step.walkDecls((d) => {
          if (!KEYFRAME_OK.has(d.prop))
            problems.push({
              file,
              line: d.source?.start?.line,
              rule: "V1-23",
              message: `@keyframes ${kf.params} animates ${d.prop}; only transform and opacity may move`,
            });
          if (d.prop === "opacity") opacity = Number.parseFloat(resolve(d.value, tokens));
        });
        k.steps.push({ at, ...(opacity === undefined ? {} : { opacity }) });
      });
      // V1-27: opacity alternating more than once (a flash).
      const ops = k.steps
        .flatMap((s) => s.at.map((a) => [a, s.opacity] as const))
        .filter(([, o]) => o !== undefined)
        .sort((x, y) => x[0] - y[0])
        .map(([, o]) => o as number);
      let turns = 0;
      for (let i = 2; i < ops.length; i++) {
        const a = Math.sign((ops[i - 1] ?? 0) - (ops[i - 2] ?? 0));
        const b = Math.sign((ops[i] ?? 0) - (ops[i - 1] ?? 0));
        if (a !== 0 && b !== 0 && a !== b) turns++;
      }
      if (turns > 0)
        problems.push({
          file,
          line: kf.source?.start?.line,
          rule: "V1-27",
          message: `@keyframes ${kf.params} alternates opacity (flash)`,
        });
      keyframes.set(kf.params.trim(), k);
    });
  }

  const loadAnims: { file: string; line?: number | undefined; selector: string; a: Anim }[] = [];

  // Pass 2: declarations.
  for (const { file, root } of roots) {
    root.walkRules((rule) => {
      if (inKeyframes(rule)) return;
      const decls = rule.nodes.filter((n): n is Declaration => n.type === "decl");
      const anims: Anim[] = [];
      let timeline = false;
      for (const d of decls) {
        const line = d.source?.start?.line;
        const add = (r: MotionRule, message: string) => problems.push({ file, line, rule: r, message });
        const v = d.value.trim();
        const isNone = /^(none|0s?|0ms)$/.test(v);
        const motionProp = /^(animation|transition)(-|$)/.test(d.prop);
        // V1-26: base opacity
        if (d.prop === "opacity" && Number.parseFloat(resolve(v, tokens)) < 1)
          add("V1-26", `${rule.selector} { opacity: ${v} }: content must be fully visible without animation`);
        if (!motionProp) continue;
        if (isNone) continue;
        // V1-24 guard
        if (!inGuard(d))
          add(
            "V1-24",
            `${rule.selector} { ${d.prop}: ${v} } is outside @media (prefers-reduced-motion: no-preference)`,
          );
        if (d.prop === "animation-timeline") {
          timeline = true;
          if (!inSupportsView(d)) add("V1-24", `${d.prop} outside @supports (animation-timeline: view())`);
        }
        // V1-23 transitions
        if (d.prop === "transition" || d.prop === "transition-property") {
          for (const part of splitTop(resolve(v, tokens))) {
            const prop =
              d.prop === "transition-property"
                ? part
                : (words(part).find((w) => ms(w) === undefined && !EASING.test(w)) ?? "all");
            if (!MOVABLE.has(prop))
              add("V1-23", `${rule.selector}: transition of "${prop}"; only transform and opacity may transition`);
          }
        }
        // V1-27 durations on transitions
        if (d.prop === "transition" || d.prop === "transition-duration" || d.prop === "transition-delay") {
          for (const w of words(resolve(v, tokens).replace(/,/g, " "))) {
            const t = ms(w);
            if (t !== undefined && t > MOTION_CAPS.max) add("V1-27", `${d.prop}: ${v} is over 1 s`);
          }
        }
        if (d.prop === "animation") anims.push(...parseAnimationShorthand(v, tokens));
        if (d.prop === "animation-name") {
          const a = anims[0] ?? { name: "", duration: 0, delay: 0, iterations: "1", fill: "none" };
          a.name = resolve(v, tokens);
          if (!anims[0]) anims.push(a);
        }
        for (const [p, key] of [
          ["animation-duration", "duration"],
          ["animation-delay", "delay"],
        ] as const) {
          if (d.prop === p) {
            const t = ms(resolve(v, tokens)) ?? 0;
            if (anims[0]) anims[0][key] = t;
            else anims.push({ name: "", duration: 0, delay: 0, iterations: "1", fill: "none", [key]: t });
          }
        }
        if (d.prop === "animation-iteration-count") {
          if (anims[0]) anims[0].iterations = resolve(v, tokens);
          else anims.push({ name: "", duration: 0, delay: 0, iterations: resolve(v, tokens), fill: "none" });
        }
        if (d.prop === "animation-fill-mode") {
          if (anims[0]) anims[0].fill = v;
          else anims.push({ name: "", duration: 0, delay: 0, iterations: "1", fill: v });
        }
      }
      for (const a of anims) {
        const line = rule.source?.start?.line;
        const add = (r: MotionRule, message: string) => problems.push({ file, line, rule: r, message });
        if (/backwards|both/.test(a.fill))
          add("V1-26", `${rule.selector}: animation fill mode ${a.fill} can leave content hidden`);
        if (a.iterations !== "1")
          add("V1-27", `${rule.selector}: iteration count ${a.iterations}; animations run once`);
        if (a.duration > MOTION_CAPS.max || a.delay > MOTION_CAPS.max || a.duration + a.delay > MOTION_CAPS.max)
          add("V1-27", `${rule.selector}: ${a.duration} ms + ${a.delay} ms delay is over 1 s`);
        const kf = keyframes.get(a.name);
        const first = kf?.steps.find((s) => s.at.includes(0));
        if (a.delay > 0 && first?.opacity !== undefined && first.opacity < 1)
          add(
            "V1-57",
            `${rule.selector}: ${a.name} is delayed ${a.delay} ms and starts at opacity ${first.opacity} (blink)`,
          );
        if (/-draw$/.test(a.name)) {
          if (a.duration + a.delay > MOTION_CAPS.draw) add("V1-31", `${rule.selector}: chart draw-in over 600 ms`);
        } else if (!timeline && a.name) {
          loadAnims.push({ file, line, selector: rule.selector, a });
        }
      }
    });
  }

  // V1-28: load animations and the stagger.
  for (const { file, line, selector, a } of loadAnims) {
    if (a.duration > MOTION_CAPS.element)
      problems.push({
        file,
        line,
        rule: "V1-28",
        message: `${selector}: ${a.duration} ms load animation is over 400 ms`,
      });
    if (a.delay + a.duration > MOTION_CAPS.staggerEnd)
      problems.push({
        file,
        line,
        rule: "V1-28",
        message: `${selector}: ends at ${a.delay + a.duration} ms, after the 800 ms stagger cap`,
      });
  }
  const steps = new Set(
    loadAnims.filter((l) => /:nth-child/.test(l.selector)).map((l) => `${l.a.delay}+${l.a.duration}`),
  );
  if (steps.size > MOTION_CAPS.steps)
    problems.push({
      file: inputs.map((i) => i.file).join(", "),
      rule: "V1-28",
      message: `${steps.size} stagger steps; at most 6`,
    });
  return problems;
}
