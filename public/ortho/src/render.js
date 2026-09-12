// The render loop and the three moves between views.
//
// render() clears #root and rebuilds it. There is no diffing and no framework: every
// change to a record calls render() again, which is why handlers can write straight to
// the record and return.
//
// This module and the views import each other. That is deliberate and safe: render()
// and the navigators are function declarations, which are hoisted before any module
// body runs, and every call to them happens inside an event handler long after the
// whole graph has evaluated. Do not turn them into const arrow functions — that would
// replace hoisting with a temporal dead zone and break the cycle at load time.

import { State } from "./state.js";
import { isMonthPrecision } from "./util.js";
import { renderForm } from "./views/form.js";
import { renderHome } from "./views/home.js";
import { renderSummary } from "./views/summary.js";

// ── Navigation ─────────────────────────────────────────────────────────────
export function goHome() {
  State.view = "home";
  State.currentId = null;
  render();
}

// Leave the Ortho platform and return to the Edoc hub.
export function goMainHome() {
  window.location.href = "../";
}

export function goForm(id) {
  State.currentId = id;
  State.view = "form";
  State.section = 0;
  State.expanded = {};
  // Seed the picker from what was actually recorded, so a month-only date
  // reopens in the month picker.
  const rec = State.assessments[id];
  State.odEventMonthOnly = isMonthPrecision(rec && rec.od_eventDate);
  State.summaryEditing = {};
  render();
}

export function goSummary() {
  State.view = "summary";
  render();
}

// ── Root render dispatcher ─────────────────────────────────────────────────
export function render() {
  const root = document.getElementById("root");
  root.innerHTML = "";

  switch (State.view) {
    case "home":    root.appendChild(renderHome()); break;
    case "form":    root.appendChild(renderForm()); break;
    case "summary": root.appendChild(renderSummary()); break;
  }
}
