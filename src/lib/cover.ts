/**
 * V1-42 cover patterns: derived, never stored. A pure function of the story id
 * and its first pillar (decided, Q-2): FNV-1a over `${id}|${pillar}` picks one
 * of six motifs and its parameters; the pillar picks the accent. The result is
 * plain shape data that StoryCover.astro renders as component markup (no file,
 * never raw HTML), coloured only through token classes (V1-14). Numbers are
 * rounded to 2 decimals (V1-38) and nothing reads the clock or randomness
 * (V1-40), so the same id gives the same SVG on every build (V1-39).
 */
export const COVER_W = 320;
export const COVER_H = 120;
export const MOTIFS = ["stripes", "dots", "arcs", "steps", "waves", "blocks"] as const;
export type Motif = (typeof MOTIFS)[number];

export type CoverElement = "rect" | "circle" | "path";
export interface CoverShape {
  el: CoverElement;
  cls: string;
  attrs: Record<string, number | string>;
}
export interface Cover {
  motif: Motif;
  accent: string;
  hash: number;
  shapes: CoverShape[];
}

/** Accent class per pillar; the others are the shared secondary tones. */
const ACCENT: Record<string, string> = {
  "understand-the-numbers": "art-f-gold",
  "make-better-decisions": "art-f-teal",
  "finance-in-context": "art-f-light",
  "build-capability": "art-f-gold",
};
const SECOND: Record<string, string> = {
  "understand-the-numbers": "art-f-teal",
  "make-better-decisions": "art-f-gold",
  "finance-in-context": "art-f-teal",
  "build-capability": "art-f-light",
};

/** 32-bit FNV-1a over the UTF-8 bytes of a string. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A small deterministic sequence from the hash (xorshift32), for parameters only. */
function sequence(seed: number): () => number {
  let x = seed || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x100000000;
  };
}

export function coverFor(id: string, pillar: string): Cover {
  const hash = fnv1a(`${id}|${pillar}`);
  const motif = MOTIFS[(hash >>> 16) % MOTIFS.length] as Motif;
  const next = sequence(hash);
  const accent = ACCENT[pillar] ?? "art-f-gold";
  const second = SECOND[pillar] ?? "art-f-teal";
  const shapes: CoverShape[] = [];
  const rect = (cls: string, x: number, y: number, width: number, height: number, rx = 0) =>
    shapes.push({
      el: "rect",
      cls,
      attrs: { x: r2(x), y: r2(y), width: r2(width), height: r2(height), ...(rx ? { rx } : {}) },
    });
  const circle = (cls: string, cx: number, cy: number, r: number) =>
    shapes.push({ el: "circle", cls, attrs: { cx: r2(cx), cy: r2(cy), r: r2(r) } });
  const path = (cls: string, d: string, stroke = 0) =>
    shapes.push({
      el: "path",
      cls,
      attrs: stroke ? { d, fill: "none", "stroke-width": stroke, "stroke-linecap": "round" } : { d },
    });

  switch (motif) {
    case "stripes": {
      const gap = 18 + Math.floor(next() * 10);
      const tilt = 30 + Math.floor(next() * 50);
      for (let x = -tilt, i = 0; x < COVER_W; x += gap, i++)
        path(
          i % 4 === 0 ? accent.replace("-f-", "-s-") : "art-s-slate",
          `M${x} ${COVER_H}L${x + tilt} 0`,
          i % 4 === 0 ? 5 : 3,
        );
      break;
    }
    case "dots": {
      const step = 30 + Math.floor(next() * 8);
      const hot = Math.floor(next() * 7);
      for (let y = step / 2, row = 0; y < COVER_H; y += step, row++)
        for (let x = step / 2 + (row % 2) * (step / 2), col = 0; x < COVER_W; x += step, col++)
          circle((col + row) % 7 === hot ? accent : "art-f-slate", x, y, (col + row) % 7 === hot ? 5 : 3);
      break;
    }
    case "arcs": {
      const cx = 40 + next() * 240;
      for (let r = 20, i = 0; r < 220; r += 22, i++)
        path(
          i % 3 === 0 ? accent.replace("-f-", "-s-") : "art-s-slate",
          `M${r2(cx - r)} ${COVER_H}A${r} ${r} 0 0 1 ${r2(cx + r)} ${COVER_H}`,
          i % 3 === 0 ? 4 : 2,
        );
      break;
    }
    case "steps": {
      const n = 6 + Math.floor(next() * 4);
      const w = COVER_W / n;
      for (let i = 0; i < n; i++) {
        const h = 16 + ((i + 1) / n) * 80 + next() * 10;
        rect(i === n - 1 ? accent : i % 2 ? second : "art-f-slate", i * w + 3, COVER_H - h, w - 6, h, 2);
      }
      break;
    }
    case "waves": {
      const amp = 8 + next() * 10;
      for (let i = 0; i < 5; i++) {
        const y = 20 + i * 20;
        const k = 40 + Math.floor(next() * 30);
        let d = `M0 ${r2(y)}`;
        for (let x = 0; x < COVER_W; x += k) d += `Q${r2(x + k / 2)} ${r2(y + (i % 2 ? amp : -amp))} ${x + k} ${r2(y)}`;
        path(i === 2 ? accent.replace("-f-", "-s-") : "art-s-slate", d, i === 2 ? 4 : 2);
      }
      break;
    }
    case "blocks": {
      const cols = 8;
      const rows = 3;
      const w = COVER_W / cols;
      const h = COVER_H / rows;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const v = next();
          if (v < 0.35) continue;
          rect(v > 0.9 ? accent : v > 0.7 ? second : "art-f-slate", col * w + 4, row * h + 4, w - 8, h - 8, 3);
        }
      break;
    }
  }
  // The pillar's accent always appears as one rule, so every cover carries its pillar colour.
  rect(accent, 0, COVER_H - 6, 48 + (hash % 5) * 24, 6);
  return { motif, accent, hash, shapes };
}
