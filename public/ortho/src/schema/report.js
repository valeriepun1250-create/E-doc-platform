// Turning answers into the note.
//
// A `report` template is written for the fullest case and tidyLine() clears away what
// an empty placeholder leaves behind — so an optional cross-reference goes in brackets
// and the brackets vanish with it. The templates have no conditionals by design: when
// a format seems to need one, the answer has been a new option or question key that
// other forms can use too.
//
// buildSchemaSummary fills one buffer per summary part. A section with `flatPart` also
// pushes its lines, joined into one string, into a second part — which is how the
// Green Box carries the whole OT comment on one line for the ward's 250-character
// handover field while the same block prints in full under COMMON ASSESSMENT NOTES.

import { formSections, formTypeOf } from "../forms/registry.js";
import {
  hasAnyScore, hasPendingScore, scoreBand, scoreBreakdownLines, scoreMax, scoreTotal
} from "../score.js";
import {
  boxes, collapseSharedValue, fmtEventDate, isBlankAnswer, joinList, objField,
  pickLabels, tidyLine, wrapSemicolons
} from "../util.js";
import {
  detailKey, isReportable, normOption, qOptions, schemaQuestions, showQuestion,
  subKey
} from "./engine.js";

// ── Schema summary builder ─────────────────────────────────────────────────
export function buildSchemaSummary(a, sections, parts) {
  const buf = {};
  parts.forEach(p => { buf[p.key] = []; });

  sections.forEach(sec => {
    const target = buf[sec.part];
    if (!target) return;

    const lines = [];
    // When a section also feeds a flat part, each line remembers which question put
    // it there, so the flattened copy can vary the separator in front of it.
    const flat = sec.flatPart ? [] : null;
    (sec.questions || []).forEach(q => {
      if (!isReportable(q) || q.hideInReport || !showQuestion(a, q)) return;
      const got = schemaReportLines(a, q, sections);
      if (!got) return;
      lines.push(...got);
      if (flat) {
        got.filter(l => l !== "")
           .forEach((l, i) => flat.push({ q, first: i === 0, text: l }));
      }
    });

    // A separator earns its blank only when there is something above to separate from.
    while (lines[0] === "") lines.shift();

    // A section nobody answered is omitted entirely, heading included.
    if (!lines.length) return;

    // A section may also feed a second part as one line — the Green Box wants the OT
    // comment with its line breaks turned into separators. A question may name its
    // own: a free-text remark reads better after a full stop than a fifth semicolon.
    // Only a line that follows something takes a separator at all.
    if (flat && flat.length && buf[sec.flatPart.key]) {
      const between = sec.flatPart.join || "; ";
      buf[sec.flatPart.key].push(flat
        .map((f, i) => (i ? (f.first && f.q.flatJoin) || between : "") + f.text)
        .join(""));
    }

    if (sec.reportTitle) target.push(sec.reportTitle);
    lines.forEach(l => target.push(l));
    target.push("");
  });

  const out = {};
  parts.forEach(p => { out[p.key] = buf[p.key].join("\n").trimEnd(); });
  return out;
}

export function schemaReportLines(a, q, sections) {
  // Paper tick-box style: every option printed, ticked or not.
  if (q.boxes) {
    const sel = Array.isArray(a[q.id]) ? a[q.id] : (a[q.id] ? [a[q.id]] : []);
    if (!sel.length) return null;
    const map = {};
    qOptions(q).forEach(o => { map[o.value] = o.label; });
    return [q.label + ":"].concat(boxes(sel, map));
  }

  const ans = formatSchemaAnswer(a, q);
  if (!ans) return null;

  // An option may take its question out of the note — "Performed" says nothing the
  // score line beneath it does not already say.
  const sole = soleOption(a, q);
  if (sole && sole.hideInReport) return null;

  let lines = applyTemplate(reportTemplate(a, q), a, q, ans, sections)
    .split("\n").filter(l => l !== "");

  // A template can tidy away to nothing — every fragment it had was an unanswered
  // placeholder — and an empty string is not a line worth printing.
  if (!lines.length) return null;

  // Only for the case it is for: the question's own answer being that option, not
  // merely two grades that happen to match.
  if (q.collapseWhenAllEqual && sole &&
      [].concat(q.collapseWhenAllEqual).includes(sole.value)) {
    lines = lines.map(collapseSharedValue);
  }

  if (q.wrapSemicolons) lines = lines.flatMap(wrapSemicolons);

  // A scored instrument may print its per-item scores beneath the total.
  if (q.breakdown && q.type === "score") {
    lines.push(...scoreBreakdownLines(a, q.id, q.items,
      q.breakdown.perLine || 5, q.breakdown.sep || "   "));
  }

  // Separates this question's block from the one above it in the note. The blank
  // survives the join; only the end of a whole part gets trimmed.
  if (q.blankBefore) lines.unshift("");
  return lines;
}

// The one option that is the whole answer, if there is one — the hook for an option
// that reports differently from its question, or not at all.
export function soleOption(a, q) {
  if (q.type === "single") return qOptions(q).find(x => x.value === a[q.id]) || null;
  if (q.type === "multi" || q.type === "range") {
    const sel = Array.isArray(a[q.id]) ? a[q.id] : [];
    return sel.length === 1 ? qOptions(q).find(x => x.value === sel[0]) || null : null;
  }
  return null;
}

// An option may carry its own `report`, for the case where picking it changes what the
// line says rather than merely what it says about.
export function reportTemplate(a, q) {
  const o = soleOption(a, q);
  return (o && o.report) || q.report || "{label}: {answer}";
}

export function formatSchemaAnswer(a, q) {
  const v = a[q.id];
  switch (q.type) {
    case "multi": {
      const sel = Array.isArray(v) ? v : [];
      // Declared option order, never click order. A list of things carried out
      // reads as a record rather than a menu once each pick says so, so a question
      // may suffix every one; an option overrides that wording, or opts out with "".
      const parts = qOptions(q).filter(o => sel.includes(o.value))
        .map(o => optionText(a, q, o) +
          (o.itemSuffix !== undefined ? o.itemSuffix : (q.itemSuffix || "")));
      return joinList(parts, q.joinWith || ", ", q.joinLast);
    }
    case "single": {
      const o = qOptions(q).find(x => x.value === v);
      // Same rule as `number` and the default branch: a prefix travels with the value,
      // so a template can be written for the fullest case and the separator in front of
      // an unanswered question disappears along with it.
      return o ? (q.prefix || "") + optionText(a, q, o) + (q.suffix || "") : "";
    }
    case "range": {
      const sel = Array.isArray(v) ? v : [];
      const picked = qOptions(q).filter(o => sel.includes(o.value));
      if (!picked.length) return "";
      if (picked.length === 1) return optionText(a, q, picked[0]);
      // These scales are declared best-first, so reading the pair back to front
      // gives the natural "Fair to Good" rather than "Good to Fair".
      return picked.reverse().map(o => optionText(a, q, o)).join(" to ");
    }
    case "yesno":
      return v === "yes" ? "Yes" : v === "no" ? "No" : "";
    case "date":
      return isBlankAnswer(v) ? "" : fmtEventDate(v);
    case "computed": {
      const s = computedValue(a, q);
      return s ? (q.prefix || "") + s + (q.suffix || "") : "";
    }
    case "number":
      // `prefix` keeps the caption attached to the value, so a template can wrap the
      // whole thing in brackets and have them vanish when the score is not recorded.
      return isBlankAnswer(v) ? "" : (q.prefix || "") + String(v) + (q.suffix || "");
    case "composite": {
      const obj = objField(a, q.id);
      // `prefix` is what the note puts in front of the value; `label` is only what
      // the form shows. GCS wants "E4", so it sets prefix "E" and label "E".
      return q.parts
        .map(p => {
          const t = (obj[p.id] || "").trim();
          if (!t) return null;
          const lead = p.prefix !== undefined ? p.prefix : (p.label ? p.label + " " : "");
          return lead + t + (p.suffix || "");
        })
        .filter(Boolean)
        .join(q.joinWith || "; ");
    }
    case "score": {
      if (!hasAnyScore(a, q.id, q.items)) return "";
      const total = scoreTotal(a, q.id, q.items);
      const band = scoreBand(q, total);
      const pending = hasPendingScore(a, q.id, q.items);
      // "62/100", the way both paper templates and the ortho_day note write it —
      // or a floor, when something is still to be assessed.
      return (pending ? ">=" : "") + total + "/" + scoreMax(q.items) +
             (pending ? ", pending further assessment" : "") +
             (band ? " (" + band + ")" : "");
    }
    default: {
      const s = String(v == null ? "" : v).trim();
      // Same rule as `number`: a prefix keeps the caption attached to the value, so a
      // template can bracket the pair and have both vanish together.
      return s ? (q.prefix || "") + s + (q.suffix || "") : "";
    }
  }
}

// "Other (hip pain)" — an option's label with whatever was typed or ticked beneath
// it folded in, so the note reads as one phrase.
export function optionText(a, q, o) {
  const detail = (a[detailKey(q, o.value)] || "").trim();
  // `detailOnly` lets what was typed stand in for the label — "son", not "Caregiver
  // son" — with the chip's own wording used when nothing was typed. `reportLabel` is
  // the note's wording where it differs from the chip's.
  let s = detail && o.detailOnly ? detail : (o.reportLabel || o.label);
  if (detail && !o.detailOnly) s += (o.detailJoiner || " ") + detail + (o.detailSuffix || "");

  const sub = a[subKey(q, o.value)];
  if (Array.isArray(sub) && sub.length) {
    const map = {};
    o.sub.map(normOption).forEach(x => { map[x.value] = x.reportLabel || x.label; });
    const text = pickLabels(sub, map).join(o.subJoin || ", ");
    // `subOnly` lets the sub-chips stand in for the label, as `detailOnly` does for a
    // typed detail — "Powered wheelchair", not "Wheelchair (Powered)".
    if (o.subOnly) s = text;
    else {
      // Bracketed after the label, unless the option words its sub-chips into the
      // sentence instead — "Sitting shower on shower chair".
      const open  = o.subJoiner !== undefined ? o.subJoiner : " (";
      const close = o.subSuffix !== undefined ? o.subSuffix : ")";
      s += open + text + close;
    }
  }
  return s;
}

// {answer} the formatted answer · {label} the question label · {partId} one composite
// part · {q:otherId} another question's answer. Enough for the wording the paper forms
// use, without a template language to learn.
export function applyTemplate(tpl, a, q, ans, sections) {
  const obj = objField(a, q.id);
  const filled = tpl
    .replace(/\{answer\}/g, ans)
    .replace(/\{label\}/g, q.label || "")
    .replace(/\{q:([A-Za-z0-9_]+)\}/g, (_, id) => {
      const other = schemaQuestions(sections).find(x => x.id === id);
      // A question behind a condition that no longer holds contributes nothing, so a
      // value the form is hiding can never reach the note through a cross-reference.
      return other && showQuestion(a, other) ? formatSchemaAnswer(a, other) : "";
    })
    .replace(/\{([A-Za-z0-9_]+)\}/g, (_, id) => obj[id] || "");
  return filled.split("\n").map(tidyLine).join("\n");
}

// One question's answer as the note would print it. A question the form is hiding
// contributes nothing, so a value behind a failed condition can never leak into a
// summary built from other answers — the same rule applyTemplate applies to {q:…}.
export function answerOf(a, id) {
  const q = schemaQuestions(formSections(a) || []).find(x => x.id === id);
  return q && showQuestion(a, q) ? formatSchemaAnswer(a, q) : "";
}

// A form's computed table is its own — declared as a thunk beside its sections, so
// the engine resolves one from the record without naming any form.
export function computedValue(a, q) {
  const ft = formTypeOf(a);
  const table = (ft && ft.computed && ft.computed()) || {};
  const fn = table[q.compute];
  return fn ? fn(a) : "";
}
