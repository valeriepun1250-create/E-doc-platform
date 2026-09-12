// The schema engine: seeding a record from a section array, deciding what is
// visible, and turning each question into a widget.
//
// The stale-value rule lives here. A hidden question's answer is cleared from the
// record, not merely hidden, and clearHiddenSchemaAnswers() sweeps every section on
// each render because a trigger and its dependants can sit on different tabs.
// Anything reading another question's answer has to respect that.
//
// Extras — a chip's text box, a chip's second level — are stored under keys derived by
// detailKey() and subKey(), and cleared whenever their chip is unpicked.

import { render } from "../render.js";
import { computedValue } from "./report.js";
import {
  chipOption, chipsFromMap, dateInput, el, fieldBlock, formCard, numInput, textArea,
  textInput
} from "../dom.js";
import { quickFillChip, scoreBody } from "../score.js";
import {
  State, saveSoon, setField, setSingle, setSubField, toggleChip, toggleChipExclusive
} from "../state.js";
import { isBlankAnswer, objField } from "../util.js";

// One value or several: a question may have more than one answer that cannot sit
// beside a grade, or beside each other.
export const exclusiveValues = q => q.exclusive == null ? [] : [].concat(q.exclusive);

// Headings are layout only, and a computed field is derived from other answers on
// every read — neither is ever stored, so neither is seeded, cleared or counted
// towards progress. Everything else holds its answer at a[q.id].
export function isAnswerable(q) { return q.type !== "heading" && q.type !== "computed"; }

// Questions that appear in the note. A computed field has no stored answer but
// still reports, so it needs its own predicate.
export function isReportable(q) { return q.type !== "heading"; }

export function schemaQuestions(sections) {
  return sections.flatMap(s => s.questions || []);
}

// Options are written in whichever shape reads best in the schema — a bare string
// when the label is the value, an object when it needs more. Everything downstream
// sees the same normalised form.
export function normOption(o) {
  return typeof o === "string" ? { value: o, label: o } : Object.assign({ label: o.value }, o);
}

export function qOptions(q) { return (q.options || []).map(normOption); }

// An option's extras live beside the answer under derived keys, so "Other: ___" and
// a second level of tick boxes travel with the record without their own schema entry.
export function detailKey(q, value) { return q.id + "__d_" + value; }

export function subKey(q, value)    { return q.id + "__s_" + value; }

export function blankFor(q) {
  if (q.type === "multi" || q.type === "range") return [];
  if (q.type === "score" || q.type === "composite") return {};
  return "";
}

export function seedSchemaFields(a, sections) {
  schemaQuestions(sections).forEach(q => { if (isAnswerable(q)) a[q.id] = blankFor(q); });
}

// ── Conditional visibility ─────────────────────────────────────────────────
// One condition, four operators, no nesting — all the paper forms actually need,
// and small enough to read at a glance.
export function evalShowIf(cond, a) {
  if (!cond) return true;
  let v = a[cond.questionId];
  if (cond.itemId !== undefined) v = objField(a, cond.questionId)[cond.itemId];
  const matches = x => Array.isArray(v) ? v.includes(x) : v === x;
  if (cond.equals    !== undefined) return matches(cond.equals);
  if (cond.anyOf     !== undefined) return cond.anyOf.some(matches);
  if (cond.notAnyOf  !== undefined) return !cond.notAnyOf.some(matches);
  if (cond.notEquals !== undefined) return !matches(cond.notEquals);
  return true;
}

export function showQuestion(a, q) { return evalShowIf(q.showIf, a); }

// The app's stale-value rule: an answer sitting behind a condition that no longer
// holds is wrong, not merely hidden, so it is cleared rather than left to reappear.
// Sweeps every section, since the trigger and its dependants can live on different tabs.
export function clearHiddenSchemaAnswers(a, sections) {
  let changed = false;
  schemaQuestions(sections).forEach(q => {
    if (!isAnswerable(q) || showQuestion(a, q)) return;
    if (!isBlankAnswer(a[q.id])) { a[q.id] = blankFor(q); changed = true; }
    qOptions(q).forEach(o => {
      if (!isBlankAnswer(a[detailKey(q, o.value)])) { a[detailKey(q, o.value)] = ""; changed = true; }
      if (!isBlankAnswer(a[subKey(q, o.value)]))    { a[subKey(q, o.value)] = []; changed = true; }
    });
  });
  if (changed) saveSoon();
}

// Clears one option's text box and sub-ticks — used whenever its chip goes unpicked.
// Marking one question "Not tested" carries the same answer and reason down the rest
// of its group — whatever stopped one test stopped the ones after it. This overwrites:
// a reading already recorded is reset, which is what "whenever" asks for.
export function cascadeOption(a, q, value) {
  const o = qOptions(q).find(x => x.value === value);
  if (!o || !o.cascadeTo) return;
  const many = q.type === "range" || q.type === "multi";
  const reason = a[detailKey(q, value)] || "";
  o.cascadeTo.forEach(id => {
    // Already on this answer: leave it be, reason of its own included.
    const already = many
      ? Array.isArray(a[id]) && a[id].length === 1 && a[id][0] === value
      : a[id] === value;
    if (already) return;
    // Whatever it said before takes its own text box with it.
    const prev = many ? (Array.isArray(a[id]) ? a[id] : []) : (a[id] ? [a[id]] : []);
    prev.forEach(v => { if (v !== value) a[id + "__d_" + v] = ""; });
    a[id] = many ? [value] : value;
    if (reason) a[id + "__d_" + value] = reason;
  });
  saveSoon();
}

// A cascading option's reason mirrors into its group while they still match, so
// editing it here updates the rest — until one is given a reason of its own, after
// which that one is left alone.
export function detailInput(a, q, o) {
  const key = detailKey(q, o.value);
  if (!o.cascadeTo) return textInput(key, o.detailPlaceholder || "Specify…");
  const inp = el("input", { type: "text", class: "text-input",
    placeholder: o.detailPlaceholder || "Specify…", value: a[key] || "" });
  inp.addEventListener("input", () => {
    const was = a[key] || "";
    setField(key, inp.value);
    o.cascadeTo.forEach(id => {
      const dk = id + "__d_" + o.value;
      if ((a[dk] || "") === was) setField(dk, inp.value);
    });
  });
  // Redrawn on blur, not on input, so the caret is left alone while typing.
  inp.addEventListener("change", render);
  return inp;
}

export function clearOptionExtras(a, q, value) {
  if (!isBlankAnswer(a[detailKey(q, value)])) setField(detailKey(q, value), "");
  if (!isBlankAnswer(a[subKey(q, value)]))    setField(subKey(q, value), []);
}

// ── Schema form renderer ───────────────────────────────────────────────────
export function renderSchemaForm(a, content, sections) {
  clearHiddenSchemaAnswers(a, sections);
  const section = sections[Math.min(State.section, sections.length - 1)];
  if (!section) return;

  // A `heading` question opens a new card; anything before the first heading goes
  // into a card named after the section. Cards with nothing visible are dropped, so
  // a hidden branch never leaves an empty box behind.
  // `label` is the short tab text; `title` is the full name, for the card.
  const groups = [{ title: section.title || section.label, items: [] }];
  (section.questions || []).forEach(q => {
    // A question may exist only to shape the note — the card shows these facts
    // already, in the grid above.
    if (!showQuestion(a, q) || q.reportOnly) return;
    if (q.type === "heading") groups.push({ title: q.label, items: [] });
    else groups[groups.length - 1].items.push(q);
  });

  groups.forEach(g => {
    if (!g.items.length) return;
    content.appendChild(formCard(g.title, ...g.items.map(q => renderSchemaQuestion(a, q))));
  });
}

export function renderSchemaQuestion(a, q) {
  const widget = schemaWidget(a, q);
  const hint = q.hint ? el("div", { class: "field-hint" }, q.hint) : null;
  return q.hideLabel
    ? el("div", { class: "field" }, widget, hint)
    : fieldBlock(q.label, widget, hint);
}

export function schemaWidget(a, q) {
  switch (q.type) {
    case "text":      return textInput(q.id, q.placeholder);
    case "textarea":  return q.maxLength ? countedTextArea(a, q) : textArea(q.id, q.placeholder);
    case "date":      return dateInput(q.id, { month: !!q.month, rerender: !!q.rerender });
    case "number": {
      const row = el("div", { class: "tolerated-row" },
        numInput(q.id, q.placeholder, q.max),
        q.suffix ? el("span", { class: "unit" }, q.suffix) : null);
      if (!q.quickFill) return row;
      const set = v => () => setField(q.id, v);
      return el("div", {},
        el("div", { class: "chips score-quick" },
          quickFillChip("Full score", String(a[q.id]) === String(q.max), set(String(q.max))),
          quickFillChip("Zero score", String(a[q.id]) === "0", set("0"))),
        row);
    }
    case "yesno":     return chipsFromMap(q.id, { yes: "Yes", no: "No" });
    case "single":
    case "multi":     return schemaChips(a, q);
    case "range":     return schemaRange(a, q);
    case "composite": return schemaComposite(a, q);
    case "score":     return el("div", { class: "score-group" },
                        ...scoreBody(a, q.id, q.items, { hideTotal: q.hideTotal,
                          notAssessed: q.notAssessed, quickFill: q.quickFill,
                          groups: q.groups }));
    case "computed":  return el("div", { class: "computed-value" },
                        computedValue(a, q) || "—");
    default:          return el("div", { class: "field-hint" }, "Unsupported field type: " + q.type);
  }
}

// Chips for a single- or multi-select, plus each picked option's extras: a text box
// that appears only once its chip is on, and an optional second level of sub-chips.
export function schemaChips(a, q) {
  const multi = q.type === "multi";
  const opts = qOptions(q);
  const chosen = v => multi ? (a[q.id] || []).includes(v) : a[q.id] === v;

  const row = el("div", { class: "chips" }, ...opts.map(o => {
    const chip = el("span", { class: "chip" + (chosen(o.value) ? " selected" : "") }, o.label);
    chip.addEventListener("click", () => {
      const selecting = !chosen(o.value);
      if (!selecting) clearOptionExtras(a, q, o.value);

      if (!multi) {
        // A radio row keeps at most one answer, so every other option's extras go too.
        opts.forEach(x => { if (x.value !== o.value) clearOptionExtras(a, q, x.value); });
        // Before the answer lands, so the render setSingle triggers shows the group.
        if (selecting) cascadeOption(a, q, o.value);
        return setSingle(q.id, o.value);
      }
      if (q.exclusive) {
        const excl = exclusiveValues(q);
        // Picking an exclusive answer ("Nil") wipes the rest, extras included.
        if (selecting && excl.includes(o.value)) opts.forEach(x => clearOptionExtras(a, q, x.value));
        else if (selecting) excl.forEach(v => clearOptionExtras(a, q, v));
        return toggleChipExclusive(q.id, o.value, q.exclusive);
      }
      toggleChip(q.id, o.value);
    });
    return chip;
  }));

  const extras = opts.filter(o => chosen(o.value)).flatMap(o => [
    o.detail ? fieldBlock(o.label, detailInput(a, q, o)) : null,
    o.sub
      ? fieldBlock(o.label, el("div", { class: "chips" },
          ...o.sub.map(normOption).map(s => chipOption(subKey(q, o.value), s.value, s.label, true))))
      : null
  ]);

  return el("div", {}, row, ...extras);
}

// A capped free-text box with a live remaining-characters count. The count updates
// on input without a re-render, so the caret is left where the therapist put it.
export function countedTextArea(a, q) {
  const ta = el("textarea", {
    class: "text-area",
    placeholder: q.placeholder || "",
    maxlength: String(q.maxLength)
  }, a[q.id] || "");
  const count = el("div", { class: "char-count" });
  const paint = () => {
    count.textContent = ta.value.length + " / " + q.maxLength;
    count.classList.toggle("at-limit", ta.value.length >= q.maxLength);
  };
  ta.addEventListener("input", () => { setField(q.id, ta.value); paint(); });
  paint();
  return el("div", {}, ta, count);
}

// An ordered scale where the honest answer is often a span rather than a point —
// "Fair to Good", "Supervision to Independent". At most two picks, and they must sit
// next to each other; anything else replaces the selection.
export function schemaRange(a, q) {
  const opts = qOptions(q);
  const sel = Array.isArray(a[q.id]) ? a[q.id] : [];
  const idx = v => opts.findIndex(o => o.value === v);

  const row = el("div", { class: "chips" }, ...opts.map(o => {
    const on = sel.includes(o.value);
    const chip = el("span", { class: "chip" + (on ? " selected" : "") }, o.label);
    chip.addEventListener("click", () => {
      const excl = exclusiveValues(q);
      let next;
      if (on) next = sel.filter(v => v !== o.value);
      else if (excl.includes(o.value)) next = [o.value];
      else {
        // Drop any exclusive answer the moment a real grade is picked.
        const graded = sel.filter(v => !excl.includes(v));
        next = (graded.length === 1 && Math.abs(idx(graded[0]) - idx(o.value)) === 1)
          ? graded.concat(o.value)
          : [o.value];
      }
      if (!on) cascadeOption(a, q, o.value);
      // Anything dropped from the selection takes its text box with it.
      sel.filter(v => !next.includes(v)).forEach(v => clearOptionExtras(a, q, v));
      setField(q.id, next);
      render();
    });
    return chip;
  }));

  const extras = opts.filter(o => sel.includes(o.value) && o.detail).map(o =>
    fieldBlock(o.label, detailInput(a, q, o)));

  return el("div", {}, row, ...extras);
}

// A row of small labelled inputs that read as one line in the note — BP and pulse,
// GCS E/V/M, the left/right power grid.
export function schemaComposite(a, q) {
  const obj = objField(a, q.id);
  const cell = p => {
    const inp = el("input", {
      type: "text",
      class: "text-input" + (p.wide ? "" : " narrow"),
      placeholder: p.placeholder || "",
      value: obj[p.id] || ""
    });
    inp.addEventListener("input", () => setSubField(q.id, p.id, inp.value));
    return el("div", { class: "composite-cell" },
      p.label ? el("span", { class: "composite-label" }, p.label) : null,
      inp,
      p.suffix ? el("span", { class: "unit" }, p.suffix) : null);
  };
  // A 2x2 grid (limb power: upper/lower x right/left) needs its headers, so it is
  // laid out as a table rather than a wrapping row.
  if (q.layout === "grid-2x2") {
    const head = el("div", { class: "grid22-row" },
      el("span", { class: "grid22-corner" }, ""),
      ...q.colHeaders.map(h => el("span", { class: "grid22-head" }, h)));
    const rows = q.rowHeaders.map((rh, r) =>
      el("div", { class: "grid22-row" },
        el("span", { class: "grid22-head" }, rh),
        ...q.colHeaders.map((_, c) => cell(q.parts[r * q.colHeaders.length + c]))));
    return el("div", { class: "grid22" }, head, ...rows);
  }

  return el("div", { class: "composite" }, ...q.parts.map(cell));
}
