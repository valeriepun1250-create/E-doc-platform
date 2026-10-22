// The record store: what a case is, where it is kept, and every write to it.
//
// All patient data lives in localStorage on the device and is never sent anywhere.
// Storage.load() carries the one-off migrations, each commented with the date after
// which it can go; records already on ward devices were written against older
// versions of the schema, so a renamed field either gets a migration or an explicit
// decision that old values are dropped. There is no save button — saveSoon() debounces
// every write by 400ms.

import { seedOrthoDayFields } from "./forms/ortho-day.js";
import { FORM_TYPES } from "./forms/registry.js";
import { goHome, render } from "./render.js";
import { seedSchemaFields } from "./schema/engine.js";
import { isBlankAnswer, objField, today, uid } from "./util.js";

export const STORAGE_KEY = "ortho.assessments.v1";
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function isExpiredAssessment(a, now = Date.now()) {
  const created = Date.parse(a && a.createdAt || "");
  return Number.isFinite(created) && now - created >= RETENTION_MS;
}

export function expireAssessments() {
  const expired = Object.keys(State.assessments).filter(id => isExpiredAssessment(State.assessments[id]));
  if (!expired.length) return false;
  expired.forEach(id => { delete State.assessments[id]; });
  Storage.save(State.assessments);
  if (expired.includes(State.currentId)) {
    State.currentId = null;
    State.view = "home";
  }
  return true;
}

// Where a record keeps its pinned (hand-edited) summary parts. The "od_" prefix is
// historic — it predates the second form — but the field is per-record, so every
// form shares the name and no saved data needs migrating.
export const SUMMARY_EDITS_KEY = "od_summaryEdits";

// ── Storage ────────────────────────────────────────────────────────────────
export const Storage = {
  load() {
    let data;
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
    // The caregiver's relationship moved onto the Caregiver chip itself, so it lives
    // under a different key now. Removable once no device still holds a record
    // written before 2026-08-27.
    const now = Date.now();
    const kept = Object.fromEntries(Object.entries(data).filter(([, a]) => !isExpiredAssessment(a, now)));
    if (Object.keys(kept).length !== Object.keys(data).length) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(kept)); } catch {}
    }
    Object.values(kept).forEach(a => {
      if (a.ghf_carerRelationship && !a.ghf_premorbidSource__d_caregiver) {
        a.ghf_premorbidSource__d_caregiver = a.ghf_carerRelationship;
      }
      // Handrail moved from the bathing facilities to the assistive devices, taking
      // its "at …" box with it. Removable once no device holds a record written
      // before 2026-08-29.
      if (Array.isArray(a.ghf_bathing) && a.ghf_bathing.includes("handrail")) {
        a.ghf_bathing = a.ghf_bathing.filter(v => v !== "handrail");
        const dev = (Array.isArray(a.ghf_assistiveDevices) ? a.ghf_assistiveDevices : [])
          .filter(v => v !== "nil");          // "Nil" cannot coexist with a device
        if (!dev.includes("handrail")) dev.push("handrail");
        a.ghf_assistiveDevices = dev;
        if (a.ghf_bathing__d_handrail && !a.ghf_assistiveDevices__d_handrail) {
          a.ghf_assistiveDevices__d_handrail = a.ghf_bathing__d_handrail;
        }
        delete a.ghf_bathing__d_handrail;
      }
      // One Performed/Failed/Declined became one per test. Without this the tests
      // fall behind unanswered gates and their scores get swept away. Removable once
      // no device holds a record written before 2026-08-29.
      if (a.ghf_cogStatus) {
        ["amt", "cdt", "moca"].forEach(t => {
          const k = "ghf_" + t + "Status";
          if (!a[k]) a[k] = a.ghf_cogStatus;
          if (a.ghf_cogStatus__d_failed && !a[k + "__d_failed"]) {
            a[k + "__d_failed"] = a.ghf_cogStatus__d_failed;
          }
        });
      }
      // "Performed" is no longer an option — a test is present unless a status says
      // otherwise — so it maps to no status at all. Catches both records migrated by
      // an earlier version of the block above and ones it migrates on this load.
      ["amt", "cdt", "moca"].forEach(t => {
        if (a["ghf_" + t + "Status"] === "performed") a["ghf_" + t + "Status"] = "";
      });
      // Expressive/receptive dysphasia and dysarthria collapsed into one "Limited".
      // Removable once no device holds a record written before 2026-08-29.
      // "Transit wheelchair" gave way to "Powered wheelchair" in the outdoor aids.
      // A transit chair is a manual one, so it folds into the plain "Wheelchair"
      // still on the list rather than being restated as powered. Removable once no
      // device holds a record written before 2026-08-30.
      if (a.ghf_outdoorAid === "Transit wheelchair") a.ghf_outdoorAid = "Wheelchair";
      // "Other findings" became "Remarks". Removable once no device holds a record
      // written before 2026-08-30.
      if (a.ghf_physicalOther && !a.ghf_remarks) a.ghf_remarks = a.ghf_physicalOther;
      // "Impression" gave way to the MBI's own "Comment". Removable once no device
      // holds a record written before 2026-09-01.
      if (a.ghf_mbiImpression && !a.ghf_mbiComment) a.ghf_mbiComment = a.ghf_mbiImpression;
      if (Array.isArray(a.ghf_speech)) {
        const retired = ["expressive", "receptive", "dysarthria"];
        if (a.ghf_speech.some(v => retired.includes(v))) {
          a.ghf_speech = a.ghf_speech.filter(v => !retired.includes(v));
          if (!a.ghf_speech.includes("limited")) a.ghf_speech.push("limited");
        }
      }
      // Oxygen status was a free-text box inside the vitals composite; it is now a
      // Room air chip and a numeric flow rate. Removable once no device holds a record
      // written before 2026-09-12.
      const o2 = a.ghf_vitals && typeof a.ghf_vitals === "object"
        ? String(a.ghf_vitals.o2 || "").trim() : "";
      // Operative timing for the functional assessment was a day number plus a Pre-op
      // chip on each of the two instruments, which could contradict each other. It is
      // one choice for the section now. Removable once no device holds a record
      // written before 2026-09-16.
      if (!a.ghf_funcTiming) {
        // Where a record says both, Pre-op wins: it was an explicit statement that the
        // instruments were not tested, where a day may have been typed out of habit.
        // The day stays on the record either way, simply unread.
        if (a.ghf_mbiStatus === "pre_op" || a.ghf_lawtonStatus === "pre_op") {
          a.ghf_funcTiming = "pre";
        } else if (!isBlankAnswer(a.ghf_funcPod)) {
          a.ghf_funcTiming = "post";
          a.ghf_funcTiming__d_post = String(a.ghf_funcPod);
        }
      }
      // "Pre-op" is no longer one of their answers, so leaving it would gate the grids
      // shut against a value nothing can now clear.
      ["ghf_mbiStatus", "ghf_lawtonStatus"].forEach(k => {
        if (a[k] === "pre_op") a[k] = "";
      });
      if (o2 && !a.ghf_o2 && !a.ghf_o2Flow) {
        const litres = o2.match(/^(\d+(?:\.\d+)?)\s*L/i);
        if (/room\s*air/i.test(o2)) a.ghf_o2 = "room";
        else if (litres) a.ghf_o2Flow = litres[1];
        // Anything else — "2L via NP", "FiO2 40%" — is left where it is rather than
        // moved into a field that would print "L O2" after it a second time. It stops
        // appearing in the note, which is the same fate as any retired value.
      }
      // Pain had a site row above the three severities — fracture site / Nil / other
      // site / not tested — but it was always the fracture site, so the line says so
      // outright now. Three of its four answers still mean something, and only that row
      // could say them. Removable once no device holds a record written before
      // 2026-09-19.
      const painRows = ["ghf_painRest", "ghf_painMove", "ghf_painWB"];
      // Guarded on blanks throughout: a severity the therapist actually recorded is
      // what the row said, and outranks anything inferred from the retired one.
      const fillPain = v => painRows.forEach(k => { if (isBlankAnswer(a[k])) a[k] = v; });
      if (a.ghf_painSite === "nil") fillPain("Nil");
      else if (a.ghf_painSite === "not_tested") fillPain("Not tested");
      else if (a.ghf_painSite === "other") {
        // The site was typed into the chip's own text box. Another painful site is
        // exactly what the new remarks field is for, so it moves there.
        const site = String(a.ghf_painSite__d_other || "").trim();
        if (site && isBlankAnswer(a.ghf_painNote)) a.ghf_painNote = site;
      }
      // "fracture" needs nothing: it is what the line now reads outright. The retired
      // answer stays on the record unread, as every retired value here does.
    });
    return kept;
  },
  save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { alert("Storage full. Please delete some assessments."); }
  }
};

// ── State ──────────────────────────────────────────────────────────────────
export const State = {
  view: "home",            // "home" | "form" | "summary"
  assessments: Storage.load(),
  currentId: null,
  saveTimer: null,
  section: 0,              // active section index, for any form with section tabs
  expanded: {},            // { [subKey]: true } — open collapsible subsections
  odEventMonthOnly: false, // month-precision event date picker, before a date is entered
  summaryEditing: {}       // { [partKey]: true } — summary parts open for editing
};

export function getAssessment() { return State.assessments[State.currentId]; }

// ── Blank record ───────────────────────────────────────────────────────────
export function blankAssessment(label, date, formType) {
  const a = {
    id: uid(),
    label: label || "",
    formType,
    date: date || today(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    // Hand-edited summary parts, keyed by part key. A key present here means that
    // part keeps the user's wording and no longer regenerates from the form.
    [SUMMARY_EDITS_KEY]: {}
  };

  const ft = FORM_TYPES.find(f => f.id === formType);
  if (ft && ft.kind === "schema") seedSchemaFields(a, ft.sections());
  else if (formType === "ortho_day") seedOrthoDayFields(a);

  return a;
}

// ── Auto-save ──────────────────────────────────────────────────────────────
export function saveSoon() {
  clearTimeout(State.saveTimer);
  State.saveTimer = setTimeout(() => {
    if (expireAssessments()) {
      render();
      return;
    }
    if (State.currentId && State.assessments[State.currentId]) {
      State.assessments[State.currentId].updatedAt = new Date().toISOString();
    }
    Storage.save(State.assessments);
  }, 400);
}

// ── Field setters ──────────────────────────────────────────────────────────
export function setField(key, value) {
  const a = getAssessment();
  if (!a) return;
  a[key] = value;
  saveSoon();
}

export function setSubField(obj, key, value) {
  const a = getAssessment();
  if (!a) return;
  if (!a[obj] || typeof a[obj] !== "object") a[obj] = {};
  a[obj][key] = value;
  saveSoon();
}

export function toggleChip(key, value) {
  const a = getAssessment();
  if (!a) return;
  if (!Array.isArray(a[key])) a[key] = [];
  const i = a[key].indexOf(value);
  if (i === -1) a[key].push(value); else a[key].splice(i, 1);
  saveSoon();
  render();
}

// A "Nil" answer contradicts any real finding, so the two can never coexist:
// picking Nil clears everything else, and picking anything else clears Nil.
export function toggleChipExclusive(key, value, exclusiveValue) {
  const a = getAssessment();
  if (!a) return;
  if (!Array.isArray(a[key])) a[key] = [];
  const excl = [].concat(exclusiveValue);
  const selecting = !a[key].includes(value);
  if (selecting && excl.includes(value)) a[key] = [];
  else if (selecting) a[key] = a[key].filter(v => !excl.includes(v));
  toggleChip(key, value);
}

export function setSingle(key, value) {
  const a = getAssessment();
  if (!a) return;
  a[key] = a[key] === value ? "" : value;
  saveSoon();
  render();
}

export function createAssessment(label, date, formType) {
  const a = blankAssessment(label, date, formType);
  State.assessments[a.id] = a;
  Storage.save(State.assessments);
  State.currentId = a.id;
  State.view = "form";
  State.section = 0;
  State.expanded = {};
  State.odEventMonthOnly = false;
  State.summaryEditing = {};
}

export function deleteAssessment(id) {
  if (!confirm("Delete this assessment?")) return;
  delete State.assessments[id];
  Storage.save(State.assessments);
  if (State.currentId === id) goHome();
  else render();
}

// The text shown for a part: the hand-edited version when one exists, otherwise
// the freshly generated one. This is what makes an edited part stop regenerating.
export function summaryPartText(a, generated, key) {
  const edits = objField(a, SUMMARY_EDITS_KEY);
  return edits[key] !== undefined ? edits[key] : generated[key];
}
