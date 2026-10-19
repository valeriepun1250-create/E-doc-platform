// The summary view: one box per part, each with Copy, Edit and Revert.
//
// An edited part stops regenerating from the form and keeps the user's wording until
// it is reverted — which is why the edits are stored on the record rather than being
// recomputed.

import { goHome, goMainHome, render } from "../render.js";
import { copyButton, el } from "../dom.js";
import { buildOrthoDaySummary } from "../forms/ortho-day.js";
import { formParts, formTypeOf } from "../forms/registry.js";
import { buildSchemaSummary } from "../schema/report.js";
import {
  SUMMARY_EDITS_KEY, State, getAssessment, setField, setSubField, summaryPartText
} from "../state.js";
import { objField } from "../util.js";

// ── Summary dispatcher ─────────────────────────────────────────────────────
// Returns one text block per summary part, keyed by the part keys the form declares.
export function buildSummary(a) {
  const ft = formTypeOf(a);
  if (ft && ft.kind === "schema") return buildSchemaSummary(a, ft.sections(), ft.parts());
  if (a.formType === "ortho_day") return buildOrthoDaySummary(a);
  return { A: "This assessment form is no longer available.", B: "", C: "", D: "" };
}

// ── Summary view ───────────────────────────────────────────────────────────
export function renderSummary() {
  const a = getAssessment();
  if (!a) { goHome(); return el("div", {}); }

  const generated = buildSummary(a);
  const edits = objField(a, SUMMARY_EDITS_KEY);
  const screen = el("div", { class: "screen" });

  screen.appendChild(
    el("div", { class: "topbar" },
      el("div", { class: "topbar-title" }, "Assessment Summary"),
      el("button", { class: "topbar-action", onclick: () => { State.view = "form"; render(); } }, "Assessment"),
      el("button", { class: "topbar-action", onclick: goMainHome }, "Main Home")
    )
  );

  const content = el("div", { class: "content summary-content" });
  screen.appendChild(content);

  const shown = formParts(a).filter(p =>
    summaryPartText(a, generated, p.key) || edits[p.key] !== undefined);

  if (!shown.length) {
    content.appendChild(el("div", { class: "form-card", style: "color:var(--text-secondary)" },
      "Nothing recorded yet."));
  }

  shown.forEach(p => content.appendChild(renderSummaryPart(a, generated, edits, p)));

  content.appendChild(
    el("button", {
      class: "btn btn-secondary btn-full", style: "margin-top:4px",
      onclick: () => { State.view = "form"; render(); }
    }, "‹ Back to Form")
  );

  return screen;
}

// One summary part: heading, its own Copy and Edit buttons, and Revert once edited.
export function renderSummaryPart(a, generated, edits, part) {
  const key = part.key;
  const text = summaryPartText(a, generated, key);
  const isEdited = edits[key] !== undefined;
  const isEditing = !!State.summaryEditing[key];

  const editBtn = el("button", { class: "btn btn-secondary btn-sm" }, isEditing ? "Done" : "Edit");
  editBtn.addEventListener("click", () => {
    // Opening the editor seeds the stored edit from what is on screen, so the
    // part is pinned to this wording from the moment editing starts.
    if (!isEditing && !isEdited) setSubField(SUMMARY_EDITS_KEY, key, text);
    State.summaryEditing[key] = !isEditing;
    render();
  });

  const revertBtn = isEdited
    ? el("button", { class: "btn btn-secondary btn-sm" }, "Revert")
    : null;
  if (revertBtn) {
    revertBtn.addEventListener("click", () => {
      if (!confirm("Discard your edits to " + part.title + " and regenerate from the form?")) return;
      const next = Object.assign({}, objField(getAssessment(), SUMMARY_EDITS_KEY));
      delete next[key];
      setField(SUMMARY_EDITS_KEY, next);
      delete State.summaryEditing[key];
      render();
    });
  }

  // A part bound for a sized field counts as it is typed, and goes red once over.
  // The limit is advisory: the generated text can already exceed it, and truncating
  // a handover note in silence would be worse than showing it too long.
  const counter = part.limit ? el("div", { class: "char-count" }) : null;
  const paintCount = v => {
    if (!counter) return;
    counter.textContent = v.length + " / " + part.limit + " characters";
    counter.classList.toggle("over-limit", v.length > part.limit);
  };
  paintCount(text);

  const body = isEditing
    ? (() => {
        const ta = el("textarea", { class: "summary-edit" }, text);
        // A one-line part refuses Enter, and turns a pasted break into the separator
        // the rest of the line already uses.
        if (part.oneLine) {
          ta.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });
        }
        // No re-render on input, so the caret is left alone while typing — which is
        // why the counter repaints itself here rather than on the next render.
        ta.addEventListener("input", () => {
          if (part.oneLine && /[\r\n]/.test(ta.value)) {
            const at = ta.selectionStart;
            ta.value = ta.value.replace(/\s*[\r\n]+\s*/g, "; ");
            ta.setSelectionRange(at, at);
          }
          setSubField(SUMMARY_EDITS_KEY, key, ta.value);
          paintCount(ta.value);
        });
        return ta;
      })()
    : el("div", { class: "summary-box" }, text);

  return el("div", { class: "form-card" },
    el("div", { class: "summary-part-head" },
      el("div", { class: "summary-part-title" },
        part.title,
        isEdited ? el("span", { class: "badge" }, "Edited") : null),
      el("div", { class: "summary-part-actions" },
        revertBtn,
        editBtn,
        copyButton(() => summaryPartText(getAssessment(), generated, key)))
    ),
    body,
    counter
  );
}
