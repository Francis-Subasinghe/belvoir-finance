/**
 * F4 explorer, progressive enhancement (D-1 to D-3). Reads the five inputs,
 * calls the pure view() and writes the results with textContent, attributes
 * and `hidden` only (F4-32, F4-33). Results update on commit only: an input's
 * change event, Enter in any input, or the Update button (D-2, Q-3). Nothing
 * is requested, stored or put in the URL (D-7). Focus is never moved (F4-20).
 * Every handler is attached before the fieldset is enabled, so a script that
 * fails part-way leaves the JavaScript-off page (F4-38).
 */
import { errorCountSentence, FIELDS, JS_NOTE, RESET_NOTE } from "../lib/cash-vs-profit/copy.ts";
import { DEFAULTS } from "../lib/cash-vs-profit/defaults.ts";
import { type RawInputs, view } from "../lib/cash-vs-profit/view.ts";

const COLUMNS = ["profit", "cashIn", "cashOut", "closing"] as const;

function need<T extends Element>(root: ParentNode, selector: string, type: { new (): T; prototype: T }): T {
  const el = root.querySelector(selector);
  if (!(el instanceof type)) throw new Error(`cash-vs-profit: missing ${selector}`);
  return el;
}

function enhance(root: HTMLElement): void {
  const prefix = root.dataset["cvp"] ?? "cvp";
  const fieldset = need(root, "[data-cvp-fields]", HTMLFieldSetElement);
  const note = need(root, "[data-cvp-note]", HTMLElement);
  const status = need(root, "[data-cvp-status]", HTMLElement);
  const table = need(root, "[data-cvp-table]", HTMLElement);
  const fix = need(root, "[data-cvp-fix]", HTMLElement);
  const update = need(root, '[data-action="update"]', HTMLButtonElement);
  const reset = need(root, '[data-action="reset"]', HTMLButtonElement);
  const fields = FIELDS.map((f) => {
    const id = `${prefix}-${f.id}`;
    const error = need(root, `#${id}-error`, HTMLElement);
    return {
      id: f.id,
      input: need(root, `#${id}`, HTMLInputElement),
      error,
      errorText: need(error, ".field-error-text", HTMLElement),
      errorId: `${id}-error`,
      hintId: `${id}-hint`,
    };
  });
  const cells = new Map<string, HTMLElement>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-cvp-cell]")) {
    cells.set(el.dataset["cvpCell"] ?? "", el);
  }

  const read = (): RawInputs => {
    const raw = { ...DEFAULTS } as Record<string, string>;
    for (const f of fields) raw[f.id] = f.input.value;
    return raw as RawInputs;
  };
  let committed = JSON.stringify(read());

  /** One commit: fields, table and exactly one write to the live region. */
  function commit(raw: RawInputs, lead = ""): void {
    committed = JSON.stringify(raw);
    const v = view(raw);
    for (const f of fields) {
      const err = v.ok ? undefined : v.errors.find((e) => e.id === f.id);
      if (err) {
        f.errorText.textContent = err.message;
        f.error.hidden = false;
        f.input.setAttribute("aria-invalid", "true");
        f.input.setAttribute("aria-describedby", `${f.errorId} ${f.hintId}`);
      } else {
        f.error.hidden = true;
        f.errorText.textContent = "";
        f.input.removeAttribute("aria-invalid");
        f.input.setAttribute("aria-describedby", f.hintId);
      }
    }
    if (v.ok) {
      for (const row of v.rows) {
        for (const c of COLUMNS) {
          const cell = cells.get(`${row.month}-${c}`);
          if (cell) cell.textContent = row[c];
        }
      }
      table.hidden = false;
      fix.hidden = true;
      status.textContent = `${lead}${v.summary}`;
    } else {
      table.hidden = true;
      fix.hidden = false;
      status.textContent = errorCountSentence(v.errors.length);
    }
  }

  for (const f of fields) {
    f.input.addEventListener("change", () => {
      // Enter already committed these exact values; don't announce twice.
      if (JSON.stringify(read()) !== committed) commit(read());
    });
    f.input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      commit(read());
    });
  }
  update.addEventListener("click", () => commit(read()));
  reset.addEventListener("click", () => {
    for (const f of fields) f.input.value = DEFAULTS[f.id];
    commit(read(), `${RESET_NOTE} `);
  });

  note.textContent = JS_NOTE;
  fieldset.disabled = false;
}

for (const root of document.querySelectorAll<HTMLElement>("[data-cvp]")) enhance(root);
