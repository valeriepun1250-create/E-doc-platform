// The form view: a topbar, section tabs, and whichever renderer the form's `kind`
// selects — the schema engine for a schema form, a hand-written one for a coded form.

import { goHome, goMainHome, goSummary, render } from "../render.js";
import { el } from "../dom.js";
import { renderOrthoDayForm } from "../forms/ortho-day.js";
import { FORM_TYPES, formSections } from "../forms/registry.js";
import { renderSchemaForm } from "../schema/engine.js";
import { State, getAssessment } from "../state.js";
import { fmtDate } from "../util.js";

// ── Form shell ─────────────────────────────────────────────────────────────
export function renderForm() {
  const a = getAssessment();
  if (!a) { goHome(); return el("div", {}); }

  const formType = FORM_TYPES.find(f => f.id === a.formType);
  const screen = el("div", { class: "screen" });

  screen.appendChild(
    el("div", { class: "topbar" },
      el("button", { class: "topbar-back", onclick: goHome }, "‹"),
      el("div", { style: "flex:1;min-width:0" },
        el("div", { class: "topbar-title" },
          (formType ? formType.icon + " " + formType.name : "Assessment")),
        el("div", { class: "topbar-subtitle" },
          (a.label || "—") + "  ·  " + fmtDate(a.date))
      ),
      el("button", { class: "topbar-action", onclick: goSummary }, "Summary"),
      el("button", { class: "topbar-action", onclick: goMainHome }, "Main Home")
    )
  );

  const sections = formSections(a);
  const sectionInfo = sections && sections.length ? {
    tabs: sections, idx: State.section,
    setIdx: i => { State.section = i; }, extraClass: " scroll-tabs"
  } : null;

  if (sectionInfo) {
    screen.appendChild(
      el("div", { class: "section-tabs" + sectionInfo.extraClass },
        ...sectionInfo.tabs.map((s, i) =>
          el("div", {
            class: "section-tab" + (i === sectionInfo.idx ? " active" : ""),
            onclick: () => { sectionInfo.setIdx(i); window.scrollTo(0, 0); render(); }
          }, s.label)
        )
      )
    );
  }

  const content = el("div", { class: "content" });
  screen.appendChild(content);

  if (formType && formType.kind === "schema") renderSchemaForm(a, content, formType.sections());
  else if (a.formType === "ortho_day") renderOrthoDayForm(a, content);
  else {
    content.appendChild(el("div", { class: "form-card", style: "color:#888;text-align:center;padding:24px" },
      "This assessment form is no longer available."));
  }

  if (sectionInfo) {
    const isFirst = sectionInfo.idx === 0;
    const isLast  = sectionInfo.idx === sectionInfo.tabs.length - 1;
    screen.appendChild(
      el("div", { class: "bottom-nav" },
        el("button", { class: "btn btn-secondary", style: "flex:1", onclick: goHome }, "‹ Home"),
        isFirst ? null : el("button", {
          class: "btn btn-secondary", style: "flex:1",
          onclick: () => { sectionInfo.setIdx(sectionInfo.idx - 1); window.scrollTo(0, 0); render(); }
        }, "‹ Prev"),
        isLast
          ? el("button", { class: "btn btn-primary", style: "flex:2", onclick: goSummary }, "Summary →")
          : el("button", {
              class: "btn btn-primary", style: "flex:2",
              onclick: () => { sectionInfo.setIdx(sectionInfo.idx + 1); window.scrollTo(0, 0); render(); }
            }, "Next ›")
      )
    );
  } else {
    screen.appendChild(
      el("div", { class: "bottom-nav" },
        el("button", { class: "btn btn-secondary", style: "flex:1", onclick: goHome }, "‹ Home"),
        el("button", { class: "btn btn-primary", style: "flex:2", onclick: goSummary }, "View Summary →")
      )
    );
  }

  return screen;
}
