// Building a DOM tree, and the handful of inputs every form is made of.
//
// el() silently skips null children, which is the whole trick behind conditional
// rendering here: a ternary returning null, never an if block. Each input writes
// straight to the current record and lets the debounced save pick it up.

import { render } from "./render.js";
import { subKey } from "./schema/engine.js";
import { State, getAssessment, setField, setSingle, toggleChip, toggleChipExclusive } from "./state.js";
import { isMonthPrecision } from "./util.js";

// ── DOM helper ─────────────────────────────────────────────────────────────
export function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (k === "class") e.className = v;
      else if (k === "html")  e.innerHTML = v;
      else if (v !== undefined && v !== null) e.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

// ── Component helpers ──────────────────────────────────────────────────────
// Reads live assessment state on every call — never cache the selected flag.
// `exclusive` names a value (e.g. "nil") that cannot coexist with the others.
export function chipOption(key, value, label, multi = false, exclusive) {
  const a = getAssessment();
  const isSelected = multi
    ? a && Array.isArray(a[key]) && a[key].includes(value)
    : a && a[key] === value;
  return el("span", {
    class: "chip" + (isSelected ? " selected" : ""),
    onclick: () => {
      if (!multi) return setSingle(key, value);
      if (exclusive) return toggleChipExclusive(key, value, exclusive);
      toggleChip(key, value);
    }
  }, label);
}

// Build a chip row straight from a label map, preserving map order.
export function chipsFromMap(key, labelMap, multi = false, only, exclusive) {
  const keys = only || Object.keys(labelMap);
  return el("div", { class: "chips" },
    ...keys.map(k => chipOption(key, k, labelMap[k], multi, exclusive))
  );
}

export function textInput(key, placeholder, cls = "") {
  const a = getAssessment();
  const inp = el("input", {
    type: "text",
    class: "text-input" + (cls ? " " + cls : ""),
    placeholder: placeholder || "",
    value: a ? (a[key] || "") : ""
  });
  inp.addEventListener("input", () => setField(key, inp.value));
  return inp;
}

export function numInput(key, placeholder, max, cls = "narrow") {
  const a = getAssessment();
  const inp = el("input", {
    type: "number",
    class: "text-input " + cls,
    placeholder: placeholder || "—",
    value: a ? (a[key] || "") : "",
    min: "0",
    max: max !== undefined ? String(max) : null
  });
  inp.addEventListener("input", () => setField(key, inp.value));
  return inp;
}

// opts.month   — render a month picker ("YYYY-MM") instead of a full date picker
// opts.rerender — re-render after a change, for dates other views depend on
export function dateInput(key, opts = {}) {
  const a = getAssessment();
  const stored = a ? (a[key] || "") : "";
  const wantMonth = !!opts.month;
  const inp = el("input", {
    type: wantMonth ? "month" : "date",
    class: "text-input medium",
    // A month value can't be shown in a date picker, or vice versa — leave it blank
    // rather than displaying something that disagrees with what is stored.
    value: (!stored || wantMonth === isMonthPrecision(stored)) ? stored : ""
  });
  inp.addEventListener("change", () => {
    setField(key, inp.value);
    if (opts.rerender) render();
  });
  return inp;
}

export function textArea(key, placeholder) {
  const a = getAssessment();
  const ta = el("textarea", { class: "text-area", placeholder: placeholder || "" },
    a ? (a[key] || "") : "");
  ta.addEventListener("input", () => setField(key, ta.value));
  return ta;
}

// An "N/A" answer and a score are mutually exclusive — selecting N/A clears the
// score so it cannot sit hidden behind N/A and reappear later.
export function naChip(naKey, scoreKey) {
  const a = getAssessment();
  const chip = el("span", {
    class: "chip" + (a && a[naKey] === "yes" ? " selected" : "")
  }, "N/A");
  chip.addEventListener("click", () => {
    if (!a || a[naKey] !== "yes") setField(scoreKey, "");
    setSingle(naKey, "yes");
  });
  return chip;
}

export function fieldBlock(label, ...contents) {
  return el("div", { class: "field" },
    el("span", { class: "field-label" }, label),
    ...contents
  );
}

// Put several short fieldBlocks on one row; wraps to stacked rows when narrow.
export function fieldRow(...blocks) {
  return el("div", { class: "field-grid" }, ...blocks);
}

export function formCard(title, ...fields) {
  return el("div", { class: "form-card" },
    el("div", { class: "form-card-title" }, title),
    ...fields
  );
}

// Collapsible subsection card — State.expanded[subKey] drives open/closed.
export function collapsibleCard(subKey, title, count, buildBody) {
  const isOpen = !!State.expanded[subKey];
  const header = el("div", { class: "collapsible-header" + (isOpen ? " open" : "") },
    el("span", { class: "collapsible-caret" }, isOpen ? "▼" : "▶"),
    el("span", { class: "collapsible-title" }, title),
    count ? el("span", { class: "collapsible-count" }, "(" + count + ")") : null
  );
  header.addEventListener("click", () => { State.expanded[subKey] = !isOpen; render(); });
  const body = isOpen ? el("div", { class: "collapsible-body" }, ...buildBody()) : null;
  return el("div", { class: "form-card collapsible" + (isOpen ? " open" : "") }, header, body);
}

// Copy button with the clipboard-API-then-execCommand fallback and a "copied" flip.
export function copyButton(getText) {
  const btn = el("button", { class: "btn btn-primary btn-sm" }, "Copy");
  btn.addEventListener("click", () => {
    const text = getText();
    const done = () => {
      btn.textContent = "✓ Copied!";
      btn.classList.add("copied");
      setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2000);
    };
    navigator.clipboard.writeText(text).then(done).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    });
  });
  return btn;
}

// ══ Geriatric Hip Fracture Initial Assessment ══════════════════════════════
// Content follows the NS Initial Assessment used by the neurosurgery OT team
// (forms/ns-initial-assessment.json in the OT E-Documentation Platform), with the
// spinal instruments dropped and the ortho paper form's vocabulary preferred where
// it is the more specific of the two.
