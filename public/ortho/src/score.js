// Scored instruments: the item lists both forms share, the arithmetic over a
// record's answers, and the grid they are rated on.
//
// An item may stand in for another once rated — Wheelchair takes Mobility's place in
// the note — which is why the total and the printed breakdown are computed separately
// rather than one being derived from the other.

import { render } from "./render.js";
import { el, formCard } from "./dom.js";
import { setSubField } from "./state.js";
import { isBlankAnswer, objField } from "./util.js";

// Modified Barthel Index — item key, label, max score (totals 100)
export const MBI_ITEMS = [
  { key: "bowels",    label: "Bowels",    max: 10, scale: [0, 2, 5, 8, 10] },
  { key: "bladder",   label: "Bladder",   max: 10, scale: [0, 2, 5, 8, 10] },
  { key: "grooming",  label: "Grooming",  max: 5,  scale: [0, 1, 3, 4, 5] },
  { key: "toileting", label: "Toileting", max: 10, scale: [0, 2, 5, 8, 10] },
  { key: "feeding",   label: "Feeding",   max: 10, scale: [0, 2, 5, 8, 10] },
  { key: "dressing",  label: "Dressing",  max: 10, scale: [0, 2, 5, 8, 10] },
  { key: "bathing",   label: "Bathing",   max: 5,  scale: [0, 1, 3, 4, 5] },
  { key: "transfer",  label: "Transfer",  max: 15, scale: [0, 3, 8, 12, 15] },
  // Both rows are on screen once Mobility is 0, but they share one slot in the note:
  // a rated Wheelchair stands in for Mobility, under its own label and maximum.
  { key: "mobility",  label: "Mobility",  max: 15, scale: [0, 3, 8, 12, 15] },
  // Rated only when Mobility is scored 0, where it substitutes into the Mobility
  // slot — so it must not add to the /100 denominator.
  { key: "wheelchair", label: "Wheelchair", max: 5, scale: [0, 1, 3, 4, 5],
    onlyWhen: o => o.mobility === "0", excludeFromMax: true,
    substitutes: "mobility" },
  { key: "stairs",    label: "Stairs",    max: 10, scale: [0, 2, 5, 8, 10] }
];

export const LAWTON_ITEMS = [
  { key: "phone",      label: "Use of telephone",  max: 3, scale: [0, 1, 2, 3] },
  { key: "transport",  label: "Transportation",    max: 3, scale: [0, 1, 2, 3] },
  { key: "shopping",   label: "Shopping",          max: 3, scale: [0, 1, 2, 3] },
  { key: "meal",       label: "Meal preparation",  max: 3, scale: [0, 1, 2, 3] },
  { key: "housework",  label: "Housework",         max: 3, scale: [0, 1, 2, 3] },
  { key: "handyman",   label: "Handyman work",     max: 3, scale: [0, 1, 2, 3] },
  { key: "laundry",    label: "Laundry",           max: 3, scale: [0, 1, 2, 3] },
  { key: "medication", label: "Medication Mx",     max: 3, scale: [0, 1, 2, 3] },
  { key: "money",      label: "Money Mx",          max: 3, scale: [0, 1, 2, 3] }
];

// Items whose `onlyWhen` guard passes for the current answers. The form and the
// summary both read through this, so the note can never show a hidden score.
export function visibleScoreItems(a, key, items) {
  const obj = objField(a, key);
  return items.filter(it => !it.onlyWhen || it.onlyWhen(obj));
}

export function scoreTotal(a, key, items) {
  const obj = objField(a, key);
  return visibleScoreItems(a, key, items)
    .reduce((sum, it) => sum + (parseInt(obj[it.key], 10) || 0), 0);
}

// A substituting item (Wheelchair) fills another item's slot rather than adding
// its own, so it is excluded to keep the denominator at 100.
export function scoreMax(items) {
  return items.reduce((sum, it) => sum + (it.excludeFromMax ? 0 : it.max), 0);
}

// A score slot may hold something other than a number: an item nobody has got to yet,
// or a device that zeroes it outright. Both count as zero — scoreTotal's parseInt sees
// to that — and differ only in how they read and whether the total is still
// provisional.
export const SCORE_NOT_ASSESSED = { value: "not_assessed", label: "Not assessed" };

export function scoreSlotText(it, v) {
  if (v === SCORE_NOT_ASSESSED.value) return SCORE_NOT_ASSESSED.label;
  const x = (it.extras || []).find(e => e.value === v);
  return x ? "0/" + it.max + " (" + x.label + ")" : null;
}

// One unassessed item makes the total a floor rather than a result.
export function hasPendingScore(a, key, items) {
  const obj = objField(a, key);
  return visibleScoreItems(a, key, items)
    .some(it => obj[it.key] === SCORE_NOT_ASSESSED.value);
}

export function hasAnyScore(a, key, items) {
  const obj = objField(a, key);
  return items.some(it => obj[it.key] !== undefined && obj[it.key] !== "");
}

// Per-item "Label: n/max" entries. Filtered through visibleScoreItems, so the note
// can never list a score the form is hiding — that is what keeps Wheelchair out until
// Mobility is 0. A `substitutes` item then takes the named item's place, under its
// own label, but only once it has been rated: an unrated Wheelchair leaves the note
// reading the Mobility score it has not yet replaced.
export function scoreEntries(a, key, items) {
  const obj = objField(a, key);
  const vis = visibleScoreItems(a, key, items);
  const standingIn = vis.filter(it => it.substitutes && !isBlankAnswer(obj[it.key]));
  const replaced = new Set(standingIn.map(it => it.substitutes));
  return vis
    .filter(it => !replaced.has(it.key) && (!it.substitutes || standingIn.includes(it)))
    .map(it => {
      const slot = scoreSlotText(it, obj[it.key]);
      return it.label + ": " + (slot || (obj[it.key] || 0) + "/" + it.max);
    });
}

// The same entries wrapped into lines of `perLine`, for the paper forms that print
// a score breakdown as a short block rather than one long line.
export function scoreBreakdownLines(a, key, items, perLine, sep) {
  const entries = scoreEntries(a, key, items);
  const lines = [];
  for (let i = 0; i < entries.length; i += perLine) {
    lines.push(entries.slice(i, i + perLine).join(sep));
  }
  return lines;
}

// Score card with a live total that updates without a full re-render,
// so the number input the therapist is typing into keeps focus.
// Each item is scored by tapping one of its fixed scale values, so only scores the
// instrument actually allows can be recorded.
export function scoreCard(a, title, objKey, items, opts = {}) {
  return formCard(title, ...scoreBody(a, objKey, items, opts));
}

// Filling a grid one chip at a time is ten taps; its ceiling or its floor is one.
// The pair only ever writes — a second tap re-applies rather than clearing — so no
// stray tap can empty a grid that was entered by hand.
export function quickFillChip(label, on, fill) {
  const chip = el("span", { class: "chip" + (on ? " selected" : "") }, label);
  chip.addEventListener("click", () => { fill(); render(); });
  return chip;
}

// The rows and total line without the surrounding card, so the schema engine can
// drop a score grid into a card it already owns. `opts.hideTotal` is for instruments
// whose raw sum is not the result — HDRS averages within factors before banding.
export function scoreBody(a, objKey, items, opts = {}) {
  const obj = objField(a, objKey);
  const max = scoreMax(items);

  // Tapping any answer, numeric or not, stores it and drops an `onlyWhen` dependant
  // (Wheelchair, which applies only while Mobility is 0) that the change has hidden,
  // so it cannot keep counting from behind a row that is gone.
  const pick = (it, value, selected) => () => {
    setSubField(objKey, it.key, selected ? "" : value);
    const stillVisible = new Set(visibleScoreItems(a, objKey, items).map(x => x.key));
    items.forEach(other => {
      if (other.onlyWhen && !stillVisible.has(other.key) && obj[other.key] !== undefined) {
        setSubField(objKey, other.key, "");
      }
    });
    render();
  };

  // Every value goes in as a string, the way `pick` stores one: `onlyWhen` compares
  // Mobility against "0", and numInput's `a[key] || ""` would render a numeric 0 as
  // an empty box.
  const slotFor = (it, top) => top ? String(it.max) : "0";

  const filledTo = top => {
    const now = objField(a, objKey);
    const vis = visibleScoreItems(a, objKey, items);
    return vis.length > 0 && vis.every(it => String(now[it.key]) === slotFor(it, top));
  };

  const fillAll = top => () => {
    items.forEach(it => setSubField(objKey, it.key, slotFor(it, top)));
    // The sweep `pick` already does: a dependant the new values have hidden —
    // Wheelchair, once Mobility is no longer 0 — must stop counting.
    const shown = new Set(visibleScoreItems(a, objKey, items).map(x => x.key));
    items.forEach(it => {
      if (it.onlyWhen && !shown.has(it.key)) setSubField(objKey, it.key, "");
    });
  };

  const rows = visibleScoreItems(a, objKey, items).map(it => {
    const chips = it.scale.map(v => {
      const selected = String(obj[it.key]) === String(v);
      const chip = el("span", { class: "chip score-chip" + (selected ? " selected" : "") },
        String(v));
      chip.addEventListener("click", pick(it, String(v), selected));
      return chip;
    });

    // Words, not numbers, so they sit on their own row rather than in the scale's
    // equal-width grid.
    const extras = (it.extras || []).concat(opts.notAssessed ? [SCORE_NOT_ASSESSED] : []);
    const extraChips = extras.map(x => {
      const selected = obj[it.key] === x.value;
      const chip = el("span", { class: "chip" + (selected ? " selected" : "") }, x.label);
      chip.addEventListener("click", pick(it, x.value, selected));
      return chip;
    });

    return el("div", { class: "score-row" },
      el("div", { class: "score-head" },
        el("span", { class: "score-label" }, it.label),
        el("span", { class: "score-max" }, "/ " + it.max)),
      // --n drives the segmented grid's column count for this row's scale.
      el("div", { class: "chips score-chips", style: "--n:" + it.scale.length }, ...chips),
      extraChips.length ? el("div", { class: "chips" }, ...extraChips) : null
    );
  });

  // A grid whose items belong to named groups reads as one block per group, each
  // headed by that group's own rating, rather than one flat list.
  if (opts.groups) {
    const byKey = {};
    visibleScoreItems(a, objKey, items).forEach((it, i) => { byKey[it.key] = rows[i]; });
    const now = objField(a, objKey);
    return opts.groups.map(g => {
      const r = g.rating(now);
      return el("div", { class: "score-block" },
        el("div", { class: "score-block-head" },
          el("span", { class: "score-block-name" }, g.title),
          el("span", { class: "score-block-rating" },
            r === null ? "—" : "Rating " + r + " / 5")),
        el("div", { class: "score-block-desc" }, g.label),
        ...g.keys.map(k => byKey[k]).filter(Boolean));
    });
  }

  const pending = hasPendingScore(a, objKey, items);
  return [
    opts.quickFill ? el("div", { class: "chips score-quick" },
      quickFillChip("Full score", filledTo(true),  fillAll(true)),
      quickFillChip("Zero score", filledTo(false), fillAll(false))) : null,
    ...rows,
    opts.hideTotal ? null : el("div", { class: "score-total" },
      el("span", {}, "Total"),
      el("span", {}, (pending ? ">= " : "") + scoreTotal(a, objKey, items) + " / " + max)
    )
  ].filter(Boolean);
}

// Score-to-category mapping is data, not code: the first band the score does not
// exceed wins, and a band with no `max` is the catch-all.
export function scoreBand(q, total) {
  if (!q.bands) return "";
  const hit = q.bands.find(b => b.max === undefined || total <= b.max);
  return hit ? hit.label : "";
}

// A score item list from plain {key,label,max}, scored 0..max. Instruments with an
// irregular scale (MBI, Lawton) declare their `scale` explicitly instead.
export function linearItems(items, min = 0) {
  return items.map(it => Object.assign({}, it, {
    scale: Array.from({ length: it.max - min + 1 }, (_, i) => i + min)
  }));
}
