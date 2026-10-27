// Ortho OT Assessment — static vanilla-JS PWA.
// All patient data lives in localStorage on this device. Nothing is sent anywhere.
//
// The entry point, and the only file that starts the app. Everything else defines
// something and waits to be called, so importing any of it — in a test, say — has no
// side effect.
import { goForm, render } from "./render.js";
import { State, summaryPartText } from "./state.js";
import { buildSummary } from "./views/summary.js";
import { formParts } from "./forms/registry.js";

render();

// The main Edoc hub links directly to a saved Ortho case from shared history.
const params = new URLSearchParams(location.search);
const caseId = params.get("case");
if (params.get("pdfExport") === "1" && window.parent !== window) {
  const assessment = State.assessments[caseId];
  const generated = assessment && buildSummary(assessment);
  const sections = assessment ? formParts(assessment).map(part => ({
    title: part.title,
    text: summaryPartText(assessment, generated, part.key)
  })) : null;
  window.parent.postMessage({ type: "edoc-pdf-report", id: caseId, sections }, location.origin);
} else if (caseId && State.assessments[caseId]) goForm(caseId);
