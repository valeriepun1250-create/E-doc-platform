// Every form the app offers, and how to resolve one from a record.
//
// `sections`, `parts` and `computed` are thunks because the data they name is declared
// in the form modules this file imports; deferring the lookup to call time keeps the
// registry free of evaluation-order constraints. `kind` picks the rendering path —
// write new forms as `schema`. A record whose formType is no longer registered
// resolves to null here, and every caller degrades rather than throwing.

import { GHF_COMPUTED, GHF_PARTS, GHF_SECTIONS } from "./ghf.js";
import { OD_SECTIONS, SUMMARY_PARTS } from "./ortho-day.js";

// ── Form type registry ─────────────────────────────────────────────────────
// `kind` picks the rendering path: "coded" forms have hand-written renderXxxForm /
// buildXxxSummary functions, "schema" forms are driven from a section/question data
// array by the generic engine further down.
// `sections` and `parts` are thunks, not values: the data they name is declared
// later in this file, and a thunk is only called at render time, after everything
// has initialised.
export const FORM_TYPES = [
  {
    id: "ortho_day",
    name: "Ortho Day Rehab FU",
    // Prefixes the form in the Create dropdown and tags its cases in History.
    category: "Ortho",
    icon: "🦴",
    desc: "Bone health medication / post-operation follow-up assessment",
    kind: "coded",
    sections: () => OD_SECTIONS,
    parts: () => SUMMARY_PARTS
  },
  {
    id: "ghf_initial",
    name: "Geriatric Hip Fracture Initial",
    category: "Ortho",
    // Emoji 11.0 — renders on iOS 12.1 and later. The x-ray glyph would have been
    // apter but is Emoji 14.0, so it boxes out on older ward iPads.
    icon: "🦵",
    desc: "Inpatient initial assessment for geriatric hip fracture",
    kind: "schema",
    sections: () => GHF_SECTIONS,
    parts: () => GHF_PARTS,
    // Thunked like the two above: the data is declared later in the file.
    computed: () => GHF_COMPUTED
  }
];

// ── Form type accessors ────────────────────────────────────────────────────
// A record whose formType is no longer registered returns null here, and every
// caller degrades to the "form no longer available" path rather than throwing.
export function formTypeOf(a) {
  return (a && FORM_TYPES.find(f => f.id === a.formType)) || null;
}

export function formSections(a) {
  const f = formTypeOf(a);
  return f && f.sections ? f.sections() : null;
}

export function formParts(a) {
  const f = formTypeOf(a);
  return f && f.parts ? f.parts() : SUMMARY_PARTS;
}
