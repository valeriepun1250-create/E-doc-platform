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
// opts.open  — where an untouched card starts. It applies only until the user has
//              decided for themselves: once they tap, the key is set and their choice
//              wins, open or shut. Omit it and an untouched card is closed, which is
//              what every caller before it relied on.
// opts.hint   — a line under the title saying when the card is worth opening. It sits
//              in the header, not the body, so it is readable while the card is shut —
//              which is the only time it can do any good.
export function collapsibleCard(subKey, title, count, buildBody, opts = {}) {
  const isOpen = State.expanded[subKey] === undefined
    ? !!opts.open : !!State.expanded[subKey];
  // Stacked only when there is a hint, so a card without one keeps the markup it had.
  const titleEl = opts.hint
    ? el("span", { class: "collapsible-title stacked" },
        el("span", {}, title),
        el("span", { class: "collapsible-hint" }, opts.hint))
    : el("span", { class: "collapsible-title" }, title);
  const header = el("div", { class: "collapsible-header" + (isOpen ? " open" : "") },
    el("span", { class: "collapsible-caret" }, isOpen ? "▼" : "▶"),
    titleEl,
    count ? el("span", { class: "collapsible-count" }, "(" + count + ")") : null
  );
  header.addEventListener("click", () => { State.expanded[subKey] = !isOpen; render(); });
  const body = isOpen ? el("div", { class: "collapsible-body" }, ...buildBody()) : null;
  return el("div", { class: "form-card collapsible" + (isOpen ? " open" : "") }, header, body);
}

// Copy button with the clipboard-API-then-execCommand fallback and a "copied" flip.
// Copying a note is the last step of every assessment, so it has to be both correct
// and honest about failing.
//
// The text goes on the clipboard twice: as plain text, and as HTML. The HTML flavour is
// not for formatting — it is what stops the receiving app reading the note as a link.
// A block beginning "Treatment:" is a bare word and a colon, the shape of a URI scheme,
// and apps that take only plain text have lowercased the scheme and percent-encoded the
// rest: "treatment:%0ACognitive%20…". Selecting by hand never had the problem, because a
// selection carries both flavours — this gives the button the same two, on every path it
// can take, including the fallback below.
function asHtml(text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // <pre> keeps the runs of spaces the score breakdowns line their columns up with.
  return '<pre style="font-family:inherit;white-space:pre-wrap">' + esc + "</pre>";
}

// Last resort, for a browser with no clipboard API — a non-secure origin, say, which
// is what an intranet served over plain http:// is. Not a rare path, then: wherever the
// app ends up hosted without TLS, this is the only path, so it has to be as good as the
// modern one rather than a degraded version of it.
//
// Which is why it copies a selection over a contenteditable element rather than a
// textarea. A textarea holds no markup, so copying from one puts plain text on the
// clipboard and nothing else — the exact condition that had "Treatment:" arriving as a
// percent-encoded link. Selecting rendered HTML is what the user does by hand when they
// select the note themselves, and that has always pasted correctly.
//
// The element must also end up genuinely selected: execCommand copies whatever the
// selection holds, so a failure to select this one means copying whatever was already
// selected on the page — which is how a copy can silently return the screen's furniture
// instead of the note.
function legacyCopy(text) {
  const sel = document.getSelection && document.getSelection();
  if (!sel) return false;                   // nothing to select with, nothing to copy

  const host = document.createElement("div");
  host.setAttribute("contenteditable", "true");   // what lets iOS select and copy it
  host.innerHTML = asHtml(text);
  host.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;" +
    "padding:0;border:none;opacity:0;overflow:hidden;font-size:16px;" +   // 16px: iOS zooms below it
    "-webkit-user-select:text;user-select:text";   // the page's own rules may forbid it
  document.body.appendChild(host);

  const prev = sel.rangeCount ? sel.getRangeAt(0) : null;

  let ok = false;
  try {
    const range = document.createRange();
    range.selectNodeContents(host);
    sel.removeAllRanges();
    sel.addRange(range);
    ok = document.execCommand("copy");
  } catch { ok = false; }

  document.body.removeChild(host);
  // Drop our own range whatever happened — it points into a node that no longer exists —
  // and put back whatever the user had selected; copying should not disturb it.
  sel.removeAllRanges();
  if (prev) sel.addRange(prev);
  return ok;
}

export function copyButton(getText) {
  const btn = el("button", { class: "btn btn-primary btn-sm" }, "Copy");
  btn.addEventListener("click", () => {
    const text = getText();
    const say = (label, cls) => {
      btn.textContent = label;
      if (cls) btn.classList.add(cls);
      setTimeout(() => { btn.textContent = "Copy"; if (cls) btn.classList.remove(cls); }, 2000);
    };
    const done = () => say("✓ Copied!", "copied");
    // Never claim success it did not have: a button that says "Copied!" over an
    // untouched clipboard is worse than one that admits it failed.
    const failed = () => say("Copy failed");

    const clip = navigator.clipboard;
    const both = () => {
      if (!clip || !clip.write || typeof ClipboardItem === "undefined") return null;
      return clip.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html":  new Blob([asHtml(text)], { type: "text/html" })
      })]);
    };
    const plain = () => (clip && clip.writeText ? clip.writeText(text) : null);
    const legacy = () => { legacyCopy(text) ? done() : failed(); };

    // Each step falls to the next, so an unsupported API is the same as a refused one.
    try {
      const rich = both();
      if (rich) { rich.then(done).catch(() => {
        const p = plain();
        if (p) p.then(done).catch(legacy); else legacy();
      }); return; }
      const p = plain();
      if (p) { p.then(done).catch(legacy); return; }
    } catch { /* fall through */ }
    legacy();
  });
  return btn;
}
