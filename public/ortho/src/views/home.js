// The home page: the hospital header, an inline Create New Case row, and History.
//
// A case is opened without leaving the page — ward/bed, date and form on one row.
// History rows are the only route to an existing case, and carry the export and
// import buttons, which are the only way data leaves or re-enters a device.

import { goForm, render } from "../render.js";
import { describeImport, exportAssessments, importAssessments } from "../backup.js";
import { el } from "../dom.js";
import { FORM_TYPES } from "../forms/registry.js";
import { State, createAssessment, deleteAssessment } from "../state.js";
import { fmtDateLong, today } from "../util.js";

// ── Home ───────────────────────────────────────────────────────────────────
export function renderHome() {
  const screen = el("div", { class: "screen" });
  const content = el("div", { class: "content home" });
  screen.appendChild(content);

  content.appendChild(
    el("div", { class: "home-card home-header" },
      el("a", { class: "home-main-link", href: "../" }, "Main Home"),
      el("div", { class: "home-eyebrow" }, "Queen Elizabeth Hospital"),
      el("h1", { class: "home-title" }, "Ortho OT Assessment")
    )
  );

  content.appendChild(renderCreateCase());
  content.appendChild(renderHistory());
  return screen;
}

// Ward, date and form on one row, so a case is opened without leaving the page.
export function renderCreateCase() {
  const wardInp = el("input", {
    type: "text", class: "text-input", placeholder: "e.g. G9/12 LCM"
  });
  const dateInp = el("input", { type: "date", class: "text-input", value: today() });

  const formSel = el("select", { class: "text-input select-input" },
    el("option", { value: "" }, "Select assessment form"),
    ...FORM_TYPES.map(ft =>
      el("option", { value: ft.id }, "[" + ft.category + "] " + ft.name))
  );

  // Inert until a form is named: a case has to be one kind of assessment or another,
  // and nothing else on the row has to be filled in.
  const createBtn = el("button", { class: "btn btn-primary" }, "Create");
  const paint = () => createBtn.classList.toggle("btn-disabled", !formSel.value);
  formSel.addEventListener("change", paint);
  paint();

  createBtn.addEventListener("click", () => {
    if (!formSel.value) return;
    createAssessment(wardInp.value.trim(), dateInp.value || today(), formSel.value);
    render();
  });

  const todayLink = el("button", { class: "link-btn" }, "Today");
  todayLink.addEventListener("click", () => { dateInp.value = today(); });

  return el("div", { class: "home-card" },
    el("h2", { class: "home-card-title" }, "Create New Case"),
    el("div", { class: "create-row" },
      el("div", { class: "create-field" },
        el("label", { class: "create-label" }, "Ward / Bed number / Initial"),
        wardInp),
      el("div", { class: "create-field" },
        el("label", { class: "create-label" }, "Assessment Date", todayLink),
        dateInp),
      el("div", { class: "create-field" },
        el("label", { class: "create-label" }, "Assessment Form"),
        formSel),
      el("div", { class: "create-action" }, createBtn)
    )
  );
}

export function renderHistory() {
  const exportBtn = el("button", { class: "btn btn-secondary btn-sm" }, "Export");
  exportBtn.addEventListener("click", exportAssessments);

  const picker = el("input", {
    type: "file", accept: "application/json", style: "display:none"
  });
  picker.addEventListener("change", () => {
    const f = picker.files && picker.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const plan = importAssessments(String(reader.result));
      picker.value = "";          // so the same file can be picked again
      if (plan) { alert(describeImport(plan)); render(); }
    };
    reader.readAsText(f);
  });

  const importBtn = el("button", { class: "btn btn-secondary btn-sm" }, "Import");
  importBtn.addEventListener("click", () => picker.click());

  const card = el("div", { class: "home-card" },
    el("div", { class: "home-card-head" },
      el("h2", { class: "home-card-title" }, "History"),
      el("div", { class: "home-card-actions" }, exportBtn, importBtn, picker)),
    );

  // A record whose form type is no longer registered has nothing to open into.
  const validIds = new Set(FORM_TYPES.map(f => f.id));
  const list = Object.values(State.assessments)
    .filter(a => validIds.has(a.formType))
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

  if (!list.length) {
    card.appendChild(el("div", { class: "history-empty" },
      "No cases yet — create one above."));
    return card;
  }

  list.forEach(a => card.appendChild(renderHistoryRow(a)));
  return card;
}

export function renderHistoryRow(a) {
  const ft = FORM_TYPES.find(f => f.id === a.formType);

  const openBtn = el("button", { class: "btn btn-primary btn-sm" }, "Open");
  openBtn.addEventListener("click", () => goForm(a.id));

  const delBtn = el("button", { class: "btn btn-outline-danger btn-sm" }, "Delete");
  delBtn.addEventListener("click", () => deleteAssessment(a.id));

  return el("div", { class: "history-row" },
    el("span", { class: "history-cat" }, ft.category),
    el("div", { class: "history-main" },
      el("div", { class: "history-label" }, a.label || "(No label)"),
      el("div", { class: "history-date" }, fmtDateLong(a.date))),
    el("span", { class: "history-form" }, ft.name),
    el("div", { class: "history-actions" }, openBtn, delBtn)
  );
}
