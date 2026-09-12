// Geriatric Hip Fracture Initial — a schema form: a data array of sections holding
// questions that describe how they render and how they read in the note. Adding
// another form of this kind means writing one of these and registering it; no
// dispatcher, no renderer, no seeding code.
//
// GHF_COMPUTED holds the values that come from a published lookup table rather than a
// threshold — the HK-MoCA norms and the HDRS factor arithmetic — plus the two lines
// the OT comment repeats so the handover line stands on its own. The registry reaches
// them through this form's `computed` thunk, so the engine never imports this file.

import { answerOf } from "../schema/report.js";
import {
  LAWTON_ITEMS, MBI_ITEMS, hasAnyScore, linearItems, scoreTotal
} from "../score.js";
import { isBlankAnswer, objField, wrapSemicolons } from "../util.js";

// Chinese Lawton IADL — 9 items × 3 (totals 27)
// The MBI as the GHF form scores it: three items a device can zero outright. Keys,
// maxima and scales are the shared ones, so anything already recorded still reads.
// The ortho_day form keeps MBI_ITEMS as it is.
export const GHF_MBI_EXTRAS = {
  bowels:  [{ value: "stoma", label: "Stoma" }],
  bladder: [{ value: "foley", label: "Foley" }],
  feeding: [{ value: "rt",    label: "R/T" }]
};

export const GHF_MBI_ITEMS = MBI_ITEMS.map(it =>
  GHF_MBI_EXTRAS[it.key] ? Object.assign({}, it, { extras: GHF_MBI_EXTRAS[it.key] }) : it);

// The note is pasted into the record as one block, so the common and physical notes
// share a card and the headings carry no letters. The keys keep theirs: they are only
// internal handles, and a summary a therapist has already hand-edited is stored under
// one, so renumbering would detach it.
export const GHF_PARTS = [
  // Bound for the ward's handover field: one line, and 250 characters it should fit
  // but is never cut to.
  { key: "G", title: "GREEN BOX", limit: 250, oneLine: true },
  { key: "A", title: "COMMON ASSESSMENT NOTES" },
  { key: "D", title: "PROBLEM" },
  { key: "E", title: "RECOMMENDATION" }
];

// Abbreviated Mental Test — ten items, one mark each.
export const GHF_AMT_ITEMS = linearItems([
  { key: "age",        label: "Age", max: 1 },
  { key: "time",       label: "Time", max: 1 },
  { key: "addr",       label: "Address to recall", max: 1 },
  { key: "year",       label: "Current year", max: 1 },
  { key: "place",      label: "Place", max: 1 },
  { key: "recog",      label: "Recognition of two persons", max: 1 },
  { key: "dob",        label: "Date of birth", max: 1 },
  { key: "festival",   label: "Date of Mid-Autumn Festival", max: 1 },
  { key: "leader",     label: "Name of present Governor or Chinese leader", max: 1 },
  { key: "count_back", label: "Count from 20 to 1 backwards", max: 1 }
]);

// HK-Montreal Cognitive Assessment — seven domains totalling 30.
export const GHF_MOCA_ITEMS = linearItems([
  { key: "visuospatial", label: "Visuospatial / Executive", max: 5 },
  { key: "naming",       label: "Naming", max: 3 },
  { key: "attention",    label: "Attention", max: 6 },
  { key: "language",     label: "Language", max: 3 },
  { key: "abstraction",  label: "Abstraction", max: 2 },
  { key: "recall",       label: "Delayed Recall", max: 5 },
  { key: "orientation",  label: "Orientation", max: 6 }
]);

// Home Discharge Readiness Scale — three factors of two elements, each rated 1-5.
// The elements carry no factor prefix: the card groups them under their factor, and
// the note brackets them after it.
export const GHF_HDRS_ITEMS = linearItems([
  { key: "f1_e1", label: "Patient attitude", max: 5 },
  { key: "f1_e2", label: "Patient sense of competency", max: 5 },
  { key: "f2_e1", label: "Availability of carer", max: 5 },
  { key: "f2_e2", label: "Carer attitude and competency", max: 5 },
  { key: "f3_e1", label: "Specific home safety", max: 5 },
  { key: "f3_e2", label: "Specific home environment", max: 5 }
], 1);

// A factor's rating is the floor of its two elements' mean — the instrument's own
// rule, in one place so the card and the note cannot disagree.
export function hdrsFactorRating(obj, keys) {
  const ns = keys.map(k => parseInt(obj[k], 10));
  return ns.every(Number.isFinite) ? Math.floor((ns[0] + ns[1]) / 2) : null;
}

// The three factors, shaped for scoreBody's `groups`. One declaration drives the
// card's grouping, each factor's live rating, and the note's factor lines.
export const HDRS_FACTORS = [
  { n: 1, short: "Patient", keys: ["f1_e1", "f1_e2"],
    label: "Patient attitude and sense of competency" },
  { n: 2, short: "Carer", keys: ["f2_e1", "f2_e2"],
    label: "Carer attitude and sense of competency" },
  { n: 3, short: "Environment", keys: ["f3_e1", "f3_e2"],
    label: "Home safety and environment" }
].map(f => Object.assign(f, {
  title: "Factor " + f.n + " · " + f.short,
  rating: obj => hdrsFactorRating(obj, f.keys)
}));

// The assistance scale several questions share, declared best-first so a two-chip
// span reads back as "Supervision to Independent".
export const GHF_ASSIST_LEVELS = [
  { value: "independent", label: "Independent" },
  { value: "supervision", label: "Supervision" },
  { value: "mild", label: "Mild assistance" },
  { value: "moderate", label: "Moderate assistance" },
  { value: "maximal", label: "Maximal assistance" },
  { value: "dependent", label: "Dependent" }
];

// The same scale plus the escape hatch the mobility group shares, each rung naming
// what it carries "Not tested" down to. Ambulation is last and passes it nothing.
// mbiOverall keeps the plain list — an overall functional level is always gradeable.
export const assistLevelsCascading = to =>
  GHF_ASSIST_LEVELS.concat([
    { value: "not_tested", label: "Not tested", detail: true,
      detailPlaceholder: "reason", detailJoiner: " due to ", cascadeTo: to },
    // The reason in one tap: pre-operative is what stops these tests nearly always.
    { value: "pre_op", label: "Pre-op",
      reportLabel: "Not tested due to pre-operation", cascadeTo: to }
  ]);

// The same scale worded as the premorbid score lines print it — "62/100 (Moderate
// Assistance Level)". Kept separate from GHF_ASSIST_LEVELS because the four other
// questions using that list read wrong with "Level" on the end.
export const GHF_LEVEL_LABELS = [
  { value: "independent", label: "Independent Level" },
  { value: "supervision", label: "Supervision Level" },
  { value: "mild", label: "Mild Assistance Level" },
  { value: "moderate", label: "Moderate Assistance Level" },
  { value: "maximal", label: "Maximal Assistance Level" },
  { value: "dependent", label: "Dependent Level" }
];

// ── Computed fields ────────────────────────────────────────────────────────
// Derived on every read and never stored, so they cannot drift out of step with the
// answers they are read from. Named by a question's `compute` key and reached through
// this form's `computed` thunk in FORM_TYPES — the engine never imports them, so a new
// form brings its own instead of adding to a shared table.
export const GHF_COMPUTED = {
  // Hong Kong MoCA norms: the cut-offs shift with age and years of education, so
  // the percentile band cannot be read off the raw score alone.
  mocaBand(a) {
    const total = scoreTotal(a, "ghf_moca", GHF_MOCA_ITEMS);
    if (!hasAnyScore(a, "ghf_moca", GHF_MOCA_ITEMS)) return "";
    const row = mocaNormRow(a);
    if (!row) return "";
    if (total <= row.p2)  return "≤2nd percentile: DSM-5 Major NCD";
    if (total <= row.p7)  return "≤7th percentile: DSM-5 mild MCI";
    if (total <= row.p16) return "≤16th percentile: DSM-5 mild NCD";
    return ">16th percentile";
  },

  // The cut-off is the 16th-percentile threshold for this patient's age and
  // education — the same row the band above is read off. Needs no score: the row
  // depends only on age and education, and the line it feeds is anchored on the
  // score question anyway.
  mocaCutoff(a) {
    const row = mocaNormRow(a);
    return row ? row.p16 + "/30" : "";
  },

  // Home Discharge Readiness: each factor is the floor of its two elements averaged,
  // and the three factor scores are summed and banded. Ported from the NS platform,
  // including the rule that any single factor scoring 1 drags the level down one.
  hdrsLevel(a) {
    const r = HDRS_FACTORS.map(f => f.rating(objField(a, "ghf_hdrs")));
    if (r.some(x => x === null)) return "";

    const total = r[0] + r[1] + r[2];
    let level = total <= 5 ? 1 : total <= 7 ? 2 : total <= 9 ? 3
              : total <= 11 ? 4 : total <= 13 ? 5 : 6;
    // A single factor at its floor holds the whole discharge back.
    if (r.some(x => x === 1) && level > 1) level -= 1;

    return "Level " + level + " (" + HDRS_LEVELS[level] + ")";
  },

  // One line per factor, its elements bracketed after it. A factor nobody rated is
  // left out; one only half rated prints the element it has, without a rating.
  hdrsFactors(a) {
    const o = objField(a, "ghf_hdrs");
    const label = {};
    GHF_HDRS_ITEMS.forEach(it => { label[it.key] = it.label; });
    return HDRS_FACTORS.map(f => {
      const rated = f.keys.filter(k => !isBlankAnswer(o[k]));
      if (!rated.length) return null;
      const r = f.rating(o);
      return "Factor " + f.n + " (" + f.short + ")" +
        (r === null ? "" : " — Rating: " + r + "/5") +
        "  [" + rated.map(k => label[k] + ": " + o[k] + "/5").join("  ") + "]";
    }).filter(Boolean).join("\n");
  },

  // The OT comment repeats the ADL figures so the handover line stands alone.
  adlSummary(a) {
    const lines = [];
    const pre = answerOf(a, "ghf_preMbi");
    if (pre) lines.push("Premorbid ADL: MBI " + pre);

    const now = answerOf(a, "ghf_mbi");
    const level = answerOf(a, "ghf_mbiOverall");
    // Exactly one of the score and its escape hatch is ever answered. With no score
    // there is no figure for "MBI" to caption, so the status stands alone.
    if (now) lines.push("Current ADL: MBI " + now + (level ? " (" + level + ")" : ""));
    else {
      const status = answerOf(a, "ghf_mbiStatus");
      if (status) lines.push("Current ADL: " + status);
    }
    return lines.join("\n");
  },

  // One line for the three tests, each either its score or the status standing in
  // for a result that never came.
  cognitiveSummary(a) {
    const parts = [
      ["AMT",  "ghf_amt",  "ghf_amtStatus",  null],
      ["CDT",  "ghf_cdt",  "ghf_cdtStatus",  null],
      ["MoCA", "ghf_moca", "ghf_mocaStatus", "ghf_mocaBand"]
    ].map(([name, id, statusId, bandId]) => {
      const score = answerOf(a, id);
      const text = score || answerOf(a, statusId);
      if (!text) return null;
      const band = score && bandId ? answerOf(a, bandId) : "";
      return name + ": " + text + (band ? " (" + band + ")" : "");
    }).filter(Boolean);
    return parts.length ? "Cognitive function: " + parts.join("; ") : "";
  }
};

export const HDRS_LEVELS = {
  1: "Very Low", 2: "Low", 3: "Moderate Low",
  4: "Moderate High", 5: "High", 6: "Very High"
};

export const MOCA_NORMS = {
  "65-69": {
    "0-3":   { p16: 17, p7: 14, p2: 9 },
    "4-6":   { p16: 19, p7: 18, p2: 13 },
    "7-9":   { p16: 21, p7: 19, p2: 16 },
    "10-12": { p16: 22, p7: 20, p2: 17 },
    ">12":   { p16: 25, p7: 23, p2: 21 }
  },
  "70-79": {
    "0-3":   { p16: 15, p7: 14, p2: 11 },
    "4-6":   { p16: 18, p7: 15, p2: 10 },
    "7-9":   { p16: 20, p7: 18, p2: 15 },
    "10-12": { p16: 22, p7: 19, p2: 18 },
    ">12":   { p16: 22, p7: 20, p2: 16 }
  },
  // The 80-and-over norms are published against two broad education bands only.
  "80plus": {
    "0-6": { p16: 13, p7: 13, p2: 10 },
    ">6":  { p16: 17, p7: 15, p2: 13 }
  }
};

// The age × education row of the HK-MoCA norms, or null when either is unrecorded.
export function mocaNormRow(a) {
  const byAge = MOCA_NORMS[a.ghf_mocaAge];
  return (byAge && byAge[mocaEducationBucket(a.ghf_mocaAge, a.ghf_mocaEdu)]) || null;
}

export function mocaEducationBucket(ageCluster, years) {
  const y = Number(years);
  if (years === "" || years == null || !Number.isFinite(y) || y < 0) return null;
  if (ageCluster === "80plus") return y <= 6 ? "0-6" : ">6";
  if (y <= 3)  return "0-3";
  if (y <= 6)  return "4-6";
  if (y <= 9)  return "7-9";
  if (y <= 12) return "10-12";
  return ">12";
}

// Section order here is the order the note prints and the order the tabs run in —
// one array drives both.
export const GHF_SECTIONS = [
  {
    id: "vitals",
    label: "Vitals",
    title: "Vital Signs",
    part: "A",
    questions: [
      { id: "ghf_vitals", type: "composite", label: "Vital signs", hideLabel: true,
        parts: [
          { id: "bp", label: "BP", placeholder: "120/80", suffix: " mmHg" },
          { id: "pulse", label: "Pulse", placeholder: "78", suffix: "/min" },
          { id: "spo2", label: "SpO2", placeholder: "98", suffix: "%" }
        ],
        joinWith: " ; ",
        // Oxygen reads as a qualifier on the saturation rather than a reading of its
        // own, so it joins SpO2 with a comma while the rest stay semicolon-separated.
        // Both references carry their own ", " and vanish with it when unanswered.
        report: "Vital signs: {answer}{q:ghf_o2}{q:ghf_o2Flow}; {q:ghf_temp}" },

      // Room air or a flow rate, never both: choosing Room air hides the flow field,
      // and the stale-value rule then clears it from the record. Tapping the chip a
      // second time deselects it and brings the field back.
      { id: "ghf_o2", type: "single", label: "Oxygen",
        options: [{ value: "room", label: "Room air" }],
        prefix: ", ", hideInReport: true },

      // The unit is the app's, not the typist's, so every record words it identically.
      { id: "ghf_o2Flow", type: "text", label: "O2 flow (L/min)", placeholder: "e.g. 1",
        prefix: ", ", suffix: "L O2",
        showIf: { questionId: "ghf_o2", notEquals: "room" },
        hideInReport: true },

      { id: "ghf_temp", type: "single", label: "Temperature",
        options: [{ value: "afebrile", label: "Afebrile" }, { value: "febrile", label: "Febrile" }],
        hideInReport: true }
    ]
  },

  // Question order here is the order the paper form prints: who the history came
  // from, mobility, then the two premorbid scores.
  {
    id: "premorbid",
    label: "Premorbid",
    title: "Premorbid Function",
    part: "A",
    reportTitle: "PREMORBID FUNCTION",
    questions: [
      // Sits flush under the section heading, so no `blankBefore` here. The
      // relationship is the chip's own detail box: `detailOnly` prints what was
      // typed in place of the label, giving "from son" rather than "from caregiver".
      { id: "ghf_premorbidSource", type: "single", label: "Information collected from",
        options: [
          { value: "patient", label: "Patient", reportLabel: "patient" },
          { value: "caregiver", label: "Caregiver", reportLabel: "caregiver",
            detail: true, detailOnly: true, detailPlaceholder: "e.g. son / daughter" },
          // Reports on its own template: it is a statement about the assessment, not
          // an answer to "collected from whom", so the question's wording cannot hold.
          { value: "unable",
            label: "Unable to contact caregiver for information collection",
            report: "{answer}" }
        ],
        report: "(Information collected from {answer}, {q:ghf_carerPhone})" },

      { id: "ghf_carerPhone", type: "text", label: "Telephone",
        placeholder: "e.g. 9123 4567", prefix: "tel: ",
        showIf: { questionId: "ghf_premorbidSource", equals: "caregiver" },
        hideInReport: true },

      // Everything from here down is contingent on the history having been
      // obtainable at all — a question added to this run needs the same showIf.
      { id: "ghf_indoorWalk", type: "single", label: "Indoor mobility",
        showIf: { questionId: "ghf_premorbidSource", notEquals: "unable" },
        options: ["Independent", "Supervision", "Assisted", "Dependent"],
        // Indoor and outdoor share one line, so the other three questions feed
        // into this template and report nothing of their own.
        report: "Indoor mobility: {answer} ({q:ghf_indoorAid})  " +
                "Outdoor mobility: {q:ghf_outdoorWalk} ({q:ghf_outdoorAid})" },

      { id: "ghf_indoorAid", type: "single", label: "Indoor walking aid",
        showIf: { questionId: "ghf_premorbidSource", notEquals: "unable" },
        options: ["Unaided", "Stick", "Quadripod", "Frame", "Rollator", "Trolley",
          "Furniture", "Chairbound", "Bedbound",
          { value: "Other", label: "Other", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…" }],
        hideInReport: true },

      { id: "ghf_outdoorWalk", type: "single", label: "Outdoor mobility",
        showIf: { questionId: "ghf_premorbidSource", notEquals: "unable" },
        options: ["Independent", "Supervision", "Assisted", "Dependent"],
        hideInReport: true },

      { id: "ghf_outdoorAid", type: "single", label: "Outdoor walking aid",
        showIf: { questionId: "ghf_premorbidSource", notEquals: "unable" },
        options: ["Unaided", "Stick", "Quadripod", "Frame", "Rollator", "Trolley",
          "Powered wheelchair", "Wheelchair",
          { value: "Other", label: "Other", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…" }],
        hideInReport: true },

      // The premorbid baseline. The admission score is a separate pair of
      // questions in the Functional Assessment section.
      { id: "ghf_preMbi", type: "score", label: "Modified Barthel Index (premorbid)",
        showIf: { questionId: "ghf_premorbidSource", notEquals: "unable" },
        items: GHF_MBI_ITEMS, blankBefore: true, quickFill: true,
        breakdown: { perLine: 5, sep: "   " },
        report: "Modified Barthel Index (MBI): {answer} ({q:ghf_preMbiLevel})" },

      { id: "ghf_preMbiLevel", type: "range", label: "Premorbid MBI level",
        showIf: { questionId: "ghf_premorbidSource", notEquals: "unable" },
        options: GHF_LEVEL_LABELS,
        hideInReport: true },

      { id: "ghf_preLawton", type: "score", label: "Chinese Lawton IADL (premorbid)",
        showIf: { questionId: "ghf_premorbidSource", notEquals: "unable" },
        items: LAWTON_ITEMS, blankBefore: true, quickFill: true,
        breakdown: { perLine: 5, sep: "   " },
        report: "Chinese Lawton Instrumental Activities of Daily Living Scale " +
                "(4-point Scale): {answer} ({q:ghf_preLawtonLevel})" },

      { id: "ghf_preLawtonLevel", type: "range", label: "Premorbid Lawton IADL level",
        showIf: { questionId: "ghf_premorbidSource", notEquals: "unable" },
        options: GHF_LEVEL_LABELS,
        hideInReport: true }
    ]
  },

  {
    id: "social",
    label: "Social/Home",
    title: "Living Situation",
    part: "A",
    reportTitle: "SOCIAL HISTORY AND HOME ENVIRONMENT",
    questions: [
      { id: "ghf_limitedInfo", type: "multi", label: "Information source", hideLabel: true,
        options: [{ value: "limited", label: "Limited information from patient" }],
        report: "Limited information from patient." },

      { id: "ghf_livesWith", type: "multi", label: "Lives with",
        showIf: { questionId: "ghf_limitedInfo", notEquals: "limited" },
        options: [
          { value: "live_with", label: "Live with", detail: true,
            detailPlaceholder: "spouse / child / domestic helper", detailJoiner: " " },
          { value: "alone", label: "Live alone" },
          { value: "oahr", label: "OAHR" },
          { value: "hostel", label: "Hostel" },
          { value: "day_alone", label: "Daytime alone" },
          { value: "night_alone", label: "Night-time alone" }
        ],
        report: "{answer}, {q:ghf_mainCarer}" },

      { id: "ghf_mainCarer", type: "text", label: "Main carer",
        placeholder: "Who provides day-to-day care…", prefix: "Main carer: ",
        showIf: { questionId: "ghf_limitedInfo", notEquals: "limited" },
        hideInReport: true },

      { type: "heading", label: "Home Environment" },

      { id: "ghf_homeAccess", type: "single", label: "Home access",
        showIf: { questionId: "ghf_limitedInfo", notEquals: "limited" },
        options: [
          { value: "direct_lift", label: "Direct lift-landing" },
          { value: "non_direct_lift", label: "Non-direct lift-landing", detail: true,
            detailPlaceholder: "flights of steps", detailJoiner: " (", detailSuffix: " FOS)" },
          { value: "no_lift", label: "No lift", detail: true,
            detailPlaceholder: "flights of steps", detailJoiner: " (", detailSuffix: " FOS)" }
        ],
        report: "Home access: {answer}" },

      { id: "ghf_bathing", type: "multi", label: "Bathing facility",
        showIf: { questionId: "ghf_limitedInfo", notEquals: "limited" },
        options: [
          { value: "bathtub", label: "Bathtub" },
          { value: "shower_cubicle", label: "Shower cubicle" },
          { value: "hot_water", label: "Hot water system" }
        ],
        // The facilities and how the patient uses them read as one line, so the
        // method below feeds this template and reports nothing of its own.
        report: "Bathing: {answer}. {q:ghf_bathMethod}." },

      { id: "ghf_bathMethod", type: "single", label: "Bath by",
        showIf: { questionId: "ghf_limitedInfo", notEquals: "limited" },
        options: [
          { value: "stand", label: "Stand", reportLabel: "Standing shower" },
          { value: "squat", label: "Squat", reportLabel: "Squatting shower" },
          // Its sub-chip is worded into the sentence rather than bracketed after it.
          { value: "sit_on", label: "Sit on", reportLabel: "Sitting shower",
            subJoiner: " on ", subSuffix: "",
            sub: [
              { value: "Shower chair", label: "Shower chair", reportLabel: "shower chair" },
              { value: "Bath board",   label: "Bath board",   reportLabel: "bath board" },
              { value: "Shower stool", label: "Shower stool", reportLabel: "shower stool" },
              { value: "Commode",      label: "Commode",      reportLabel: "commode" }
            ] },
          { value: "bedbath", label: "Bedbath" }
        ],
        hideInReport: true },

      { type: "heading", label: "Devices and Services" },

      { id: "ghf_assistiveDevices", type: "multi", label: "Assistive device available",
        exclusive: "nil",
        showIf: { questionId: "ghf_limitedInfo", notEquals: "limited" },
        options: [
          { value: "nil", label: "Nil" },
          { value: "safety_alarm", label: "Safety alarm" },
          { value: "wheelchair", label: "Wheelchair", subOnly: true,
            sub: [
              { value: "Standard", label: "Standard", reportLabel: "Standard wheelchair" },
              { value: "Transit",  label: "Transit",  reportLabel: "Transit wheelchair" },
              { value: "Powered",  label: "Powered",  reportLabel: "Powered wheelchair" }
            ] },
          { value: "commode", label: "Commode" },
          { value: "shower_chair", label: "Shower chair" },
          { value: "bathboard", label: "Bathboard" },
          { value: "raised_seat", label: "Raised toilet seat" },
          { value: "reacher", label: "Long handle reacher" },
          { value: "handrail", label: "Handrail", detail: true,
            detailPlaceholder: "shower and / or toilet area", detailJoiner: " at " },
          { value: "walking_aid", label: "Walking aid",
            sub: ["Stick", "Quadripod", "Frame", "Rollator"] },
          { value: "other", label: "Other", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…" }
        ],
        report: "Assistive device: {answer}" },

      { id: "ghf_socialService", type: "multi", label: "Social service",
        exclusive: "nil",
        showIf: { questionId: "ghf_limitedInfo", notEquals: "limited" },
        options: [
          { value: "nil", label: "Nil" },
          { value: "home_help", label: "Home help service",
            sub: ["Meal on wheels", "Cleansing", "Bathing", "Escorting", "Personal care"] },
          { value: "day_care", label: "Day care centre", detail: true,
            detailPlaceholder: "name / frequency", detailJoiner: " (", detailSuffix: ")" },
          { value: "elderly_centre", label: "Elderly centre", detail: true,
            detailPlaceholder: "name / frequency", detailJoiner: " (", detailSuffix: ")" },
          { value: "respite", label: "Respite services", detail: true,
            detailPlaceholder: "name / frequency", detailJoiner: " (", detailSuffix: ")" },
          { value: "other", label: "Other", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…" }
        ],
        report: "Social service: {answer}" },

      { id: "ghf_financial", type: "multi", label: "Financial",
        showIf: { questionId: "ghf_limitedInfo", notEquals: "limited" },
        options: [
          { value: "family", label: "Family support / saving" },
          { value: "cssa", label: "Comprehensive Social Security Assistance" },
          { value: "disability", label: "Disability Allowance" },
          { value: "oaa", label: "Old Age Allowance" },
          { value: "oala", label: "Old Age Living Allowance" },
          { value: "other", label: "Other", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…" }
        ],
        report: "Financial: {answer}" }
    ]
  },

  {
    id: "mental",
    label: "Mental/Cog",
    title: "Mental Function",
    part: "A",
    reportTitle: "MENTAL AND COGNITIVE FUNCTION:",
    questions: [
      // The state and what the patient can follow read as one sentence, so the
      // command below feeds this template and reports nothing of its own.
      { id: "ghf_mentalState", type: "single", label: "Mental state",
        options: ["Alert", "Confused", "Drowsy", "Stupor"],
        report: "{answer}. {q:ghf_followCmd}" },

      { id: "ghf_followCmd", type: "single", label: "Follow command",
        options: [
          { value: "1step", label: "1 step",  reportLabel: "Follow 1 step command" },
          { value: "2step", label: "2 steps", reportLabel: "Follow 2 steps command" },
          { value: "3step", label: "3 steps", reportLabel: "Follow 3 steps command" },
          { value: "none",  label: "Not follow command" }
        ],
        hideInReport: true },

      { id: "ghf_orientation", type: "multi", label: "Reality orientation — oriented to",
        exclusive: "unable", joinLast: " and ",
        options: [
          { value: "time", label: "Time", reportLabel: "time" },
          { value: "place", label: "Place", reportLabel: "place" },
          { value: "person", label: "Person", reportLabel: "person" },
          // Alone by definition, and it cannot be read into the frame below.
          { value: "unable", label: "Unable to assess",
            report: "Unable to assess orientation" }
        ],
        report: "Oriented to {answer}" },

      { id: "ghf_speech", type: "multi", label: "Speech",
        options: [
          { value: "normal", label: "Normal" },
          { value: "limited", label: "Limited" },
          { value: "no_verbal", label: "No verbal response" },
          // What was typed stands in for the label: "Speech: whispers", not
          // "Speech: Other: whispers".
          { value: "other", label: "Other", detail: true,
            detailOnly: true, detailPlaceholder: "Specify…" }
        ],
        report: "Speech: {answer}" },

      { type: "heading", label: "Cognitive Assessment" },

      // Titles the whole cognitive block in the note.
      { id: "ghf_cogTiming", type: "single", label: "Cognitive assessment",
        blankBefore: true,
        options: [
          { value: "pre", label: "Pre-operation" },
          { value: "post", label: "Post-operation", detail: true,
            detailPlaceholder: "day", detailJoiner: " Day " }
        ],
        report: "Cognitive Assessment ({answer}):" },

      // Every test is present by default: its inputs show and its result prints
      // unless a status below says otherwise. Each status is then the whole line,
      // standing in for a result that never came.
      { id: "ghf_amtStatus", type: "single", label: "Abbreviated Mental Test (AMT)",
        options: [
          { value: "na", label: "Not applicable" },
          { value: "failed", label: "Failed to assess due to", detail: true,
            detailPlaceholder: "reason (e.g. poor GCS)", detailJoiner: " " },
          { value: "declined", label: "Declined" }
        ],
        report: "Abbreviated Mental Test (AMT): {answer}" },

      { id: "ghf_amt", type: "score", label: "Abbreviated Mental Test (AMT)",
        hideLabel: true,
        showIf: { questionId: "ghf_amtStatus",
          notAnyOf: ["na", "failed", "declined"] },
        items: GHF_AMT_ITEMS, quickFill: true,
        breakdown: { perLine: 10, sep: "; " },
        report: "Abbreviated Mental Test (AMT): {answer} (cut off <6 indicated " +
                "further evaluations for possibility of cognitive impairment)" },

      { id: "ghf_cdtStatus", type: "single", label: "Clock Drawing Test (CDT)",
        blankBefore: true,
        options: [
          { value: "na", label: "Not applicable" },
          { value: "failed", label: "Failed to assess due to", detail: true,
            detailPlaceholder: "reason (e.g. poor GCS)", detailJoiner: " " },
          { value: "declined", label: "Declined" }
        ],
        report: "Clock Drawing Test (CDT): {answer}" },

      { id: "ghf_cdt", type: "number", label: "Clock Drawing Test (CDT)",
        hideLabel: true, blankBefore: true, quickFill: true,
        max: 10, suffix: "/10", placeholder: "score",
        hint: "Cut-off 3/4. Lower score indicated higher cognitive function.",
        showIf: { questionId: "ghf_cdtStatus",
          notAnyOf: ["na", "failed", "declined"] },
        report: "Clock Drawing Test (CDT): {answer} (cut off 3/4; Lower score " +
                "indicated higher cognitive function)" },

      { type: "heading", label: "HK-Montreal Cognitive Assessment" },

      { id: "ghf_mocaStatus", type: "single",
        label: "HK-Montreal Cognitive Assessment (MoCA)", blankBefore: true,
        options: [
          { value: "na", label: "Not applicable" },
          { value: "failed", label: "Failed to assess due to", detail: true,
            detailPlaceholder: "reason (e.g. poor vision)", detailJoiner: " " },
          { value: "declined", label: "Declined" }
        ],
        report: "HK-Montreal Cognitive Assessment (MoCA): {answer}" },

      { id: "ghf_moca", type: "score", label: "HK-MoCA", hideLabel: true,
        blankBefore: true,
        showIf: { questionId: "ghf_mocaStatus",
          notAnyOf: ["na", "failed", "declined"] },
        items: GHF_MOCA_ITEMS, quickFill: true,
        breakdown: { perLine: 5, sep: "   " },
        report: "HK-Montreal Cognitive Assessment (MoCA): {answer} ({q:ghf_mocaEdu}) " +
                "({q:ghf_mocaCutoff}, {q:ghf_mocaBand})" },

      { id: "ghf_mocaAge", type: "single", label: "Age group",
        hint: "Needed to read the MoCA percentile off the local norms.",
        showIf: { questionId: "ghf_mocaStatus",
          notAnyOf: ["na", "failed", "declined"] },
        options: [
          { value: "65-69", label: "65–69" },
          { value: "70-79", label: "70–79" },
          { value: "80plus", label: "80 and over" }
        ],
        hideInReport: true },

      { id: "ghf_mocaEdu", type: "number", label: "Years of education", max: 30,
        placeholder: "years", prefix: "Education: ", suffix: " years",
        showIf: { questionId: "ghf_mocaStatus",
          notAnyOf: ["na", "failed", "declined"] },
        hideInReport: true },

      { id: "ghf_mocaCutoff", type: "computed", label: "MoCA cut-off",
        compute: "mocaCutoff", prefix: "cut-off: ",
        showIf: { questionId: "ghf_mocaStatus",
          notAnyOf: ["na", "failed", "declined"] },
        hideInReport: true },

      { id: "ghf_mocaBand", type: "computed", label: "MoCA percentile",
        compute: "mocaBand",
        showIf: { questionId: "ghf_mocaStatus",
          notAnyOf: ["na", "failed", "declined"] },
        hideInReport: true }
    ]
  },

  {
    id: "physical",
    label: "Physical",
    title: "Physical Examination",
    part: "A",
    reportTitle: "PHYSICAL EXAMINATION",
    questions: [
      // The template stays one line so tidyLine's ";" pruning can drop an
      // unrecorded severity; wrapSemicolons breaks it up afterwards.
      { id: "ghf_painSite", type: "single", label: "Pain", wrapSemicolons: true,
        options: [
          { value: "fracture", label: "At fracture site", reportLabel: "fracture site" },
          // Nil is the whole line; the frame below does not apply to it.
          { value: "nil", label: "Nil", report: "Pain: Nil" },
          { value: "other", label: "Other site", reportLabel: "other site", detail: true,
            detailOnly: true, detailPlaceholder: "Specify site…" },
          { value: "not_tested", label: "Not tested", report: "Pain: Not tested" }
        ],
        report: "Pain at {answer}: Resting: {q:ghf_painRest}; " +
                "Movement: {q:ghf_painMove}; Weight Bearing: {q:ghf_painWB}" },

      { id: "ghf_painRest", type: "single", label: "Pain at rest",
        options: ["Nil", "Mild", "Moderate", "Severe"],
        showIf: { questionId: "ghf_painSite", notAnyOf: ["nil", "not_tested"] },
        hideInReport: true },

      { id: "ghf_painMove", type: "single", label: "Pain on movement",
        options: ["Nil", "Mild", "Moderate", "Severe",
          { value: "Not tested", label: "Not tested", cascadeTo: ["ghf_painWB"] }],
        showIf: { questionId: "ghf_painSite", notAnyOf: ["nil", "not_tested"] },
        hideInReport: true },

      { id: "ghf_painWB", type: "single", label: "Pain on weight bearing",
        options: ["Nil", "Mild", "Moderate", "Severe", "Not tested"],
        showIf: { questionId: "ghf_painSite", notAnyOf: ["nil", "not_tested"] },
        hideInReport: true },

      { id: "ghf_swelling", type: "single", label: "Swelling",
        options: [
          { value: "yes", label: "Yes", detail: true, detailPlaceholder: "site",
            detailJoiner: " (Location: ", detailSuffix: ")" },
          { value: "no", label: "No" }
        ],
        report: "Swelling: {answer}" },

      { id: "ghf_power", type: "composite", label: "MMT — limb power",
        layout: "grid-2x2",
        rowHeaders: ["Upper", "Lower"],
        colHeaders: ["Right", "Left"],
        parts: [
          { id: "rul", placeholder: "5" }, { id: "lul", placeholder: "5" },
          { id: "rll", placeholder: "5" }, { id: "lll", placeholder: "5" }
        ],
        report: "MMT: Upper limb (R|L): {rul} | {lul} ; Lower limb (R|L): {rll} | {lll}" },

      { type: "heading", label: "Balance, Transfer and Ambulation" },

      { id: "ghf_balanceSit", type: "range", label: "Sitting balance", exclusive: ["not_tested", "pre_op"],
        collapseWhenAllEqual: ["not_tested", "pre_op"],
        options: [
          { value: "good", label: "Good" },
          { value: "fair", label: "Fair" },
          { value: "poor", label: "Poor" },
          { value: "not_tested", label: "Not tested", detail: true,
            detailPlaceholder: "reason", detailJoiner: " due to ",
            cascadeTo: ["ghf_balanceStand", "ghf_transferLieSit",
                        "ghf_transferSitStand", "ghf_ambulation"] },
          { value: "pre_op", label: "Pre-op",
            reportLabel: "Not tested due to pre-operation",
            cascadeTo: ["ghf_balanceStand", "ghf_transferLieSit",
                        "ghf_transferSitStand", "ghf_ambulation"] }
        ],
        report: "Balance: Sitting: {answer}; Standing: {q:ghf_balanceStand}" },

      { id: "ghf_balanceStand", type: "range", label: "Standing balance", exclusive: ["not_tested", "pre_op"],
        options: [
          { value: "good", label: "Good" },
          { value: "fair", label: "Fair" },
          { value: "poor", label: "Poor" },
          { value: "not_tested", label: "Not tested", detail: true,
            detailPlaceholder: "reason", detailJoiner: " due to ",
            cascadeTo: ["ghf_transferLieSit", "ghf_transferSitStand",
                        "ghf_ambulation"] },
          { value: "pre_op", label: "Pre-op",
            reportLabel: "Not tested due to pre-operation",
            cascadeTo: ["ghf_transferLieSit", "ghf_transferSitStand",
                        "ghf_ambulation"] }
        ],
        hideInReport: true },

      { id: "ghf_transferLieSit", type: "range", label: "Transfer — lie to sit",
        exclusive: ["not_tested", "pre_op"], collapseWhenAllEqual: ["not_tested", "pre_op"],
        options: assistLevelsCascading(["ghf_transferSitStand", "ghf_ambulation"]),
        report: "Transfer: Lie to Sit: {answer}; Sit to Stand: {q:ghf_transferSitStand}" },

      { id: "ghf_transferSitStand", type: "range", label: "Transfer — sit to stand",
        exclusive: ["not_tested", "pre_op"],
        options: assistLevelsCascading(["ghf_ambulation"]),
        hideInReport: true },

      { id: "ghf_ambulation", type: "range", label: "Ambulation",
        exclusive: ["not_tested", "pre_op"],
        options: assistLevelsCascading([]),
        report: "Ambulation: {answer} ({q:ghf_ambulationAid})" },

      { id: "ghf_ambulationAid", type: "single", label: "Ambulation aid",
        options: ["Unaided", "Stick", "Quadripod", "Frame", "Rollator", "Wheelchair"],
        showIf: { questionId: "ghf_ambulation",
          notAnyOf: ["not_tested", "pre_op"] },
        hideInReport: true },

      { type: "heading", label: "Senses" },

      { id: "ghf_vision", type: "single", label: "Vision",
        options: [
          { value: "nad", label: "NAD" },
          { value: "impaired", label: "Impaired", detail: true,
            detailPlaceholder: "describe deficit", detailJoiner: ": " }
        ],
        report: "Vision: {answer}" },

      { id: "ghf_hearing", type: "single", label: "Hearing",
        options: [
          { value: "nad", label: "NAD" },
          { value: "impaired", label: "Impaired", sub: ["Left", "Right", "Bilateral"] },
          { value: "deaf", label: "Deaf" }
        ],
        report: "Hearing: {answer}" },

      { id: "ghf_complications", type: "multi", label: "Complications", exclusive: "na",
        options: [
          { value: "na", label: "N/A" },
          { value: "delirium", label: "Delirium" },
          { value: "pressure_sore", label: "Pressure sore", detail: true,
            detailPlaceholder: "site", detailJoiner: " (Site: ", detailSuffix: ")" },
          { value: "dvt", label: "DVT" }
        ],
        report: "Complications: {answer}" },

      { id: "ghf_remarks", type: "textarea", label: "Remarks",
        placeholder: "Anything else of note…",
        report: "Remarks: {answer}" }
    ]
  },

  {
    id: "functional",
    label: "MBI / IADL",
    title: "Functional Assessment",
    part: "A",
    reportTitle: "FUNCTIONAL ASSESSMENT",
    questions: [
      { id: "ghf_funcPod", type: "number", label: "Post-operation day", max: 999,
        prefix: "Post-operation Day ", placeholder: "day",
        report: "{answer}" },

      // A score grid cannot carry an option, so the escape hatch sits above it and
      // gates it, the way each cognitive test's status does.
      { id: "ghf_mbiStatus", type: "single", label: "Modified Barthel Index",
        options: [
          { value: "pre_op", label: "Pre-op",
            reportLabel: "Not tested due to pre-operation" },
          { value: "not_tested", label: "Not tested", detail: true,
            detailPlaceholder: "reason", detailJoiner: " due to " }
        ],
        report: "Modified Barthel Index (MBI): {answer}" },

      // The same item lists the ortho_day form scores, so the wheelchair rule and
      // the /100 denominator behave identically in both.
      { id: "ghf_mbi", type: "score", label: "Modified Barthel Index", hideLabel: true,
        showIf: { questionId: "ghf_mbiStatus",
          notAnyOf: ["not_tested", "pre_op"] },
        items: GHF_MBI_ITEMS, notAssessed: true, quickFill: true,
        breakdown: { perLine: 5, sep: "   " },
        report: "Modified Barthel Index (MBI): {answer}" },

      // Sits under the sub-scores, so it follows the grid's gate: with no score there
      // is nothing to comment on.
      { id: "ghf_mbiComment", type: "text", label: "Comment",
        showIf: { questionId: "ghf_mbiStatus",
          notAnyOf: ["not_tested", "pre_op"] },
        placeholder: "e.g. fair activity tolerance",
        report: "Comment: {answer}" },

      { id: "ghf_mbiOverall", type: "range", label: "Overall functional level",
        showIf: { questionId: "ghf_mbiStatus",
          notAnyOf: ["not_tested", "pre_op"] },
        options: GHF_ASSIST_LEVELS,
        report: "Overall functional level: {answer}" },

      // Exactly one of the status and the grid ever prints, so the gap before the
      // IADL appears once however it was recorded.
      { id: "ghf_lawtonStatus", type: "single", label: "Chinese Lawton IADL",
        blankBefore: true,
        options: [
          { value: "pre_op", label: "Pre-op",
            reportLabel: "Not tested due to pre-operation" },
          { value: "not_tested", label: "Not tested", detail: true,
            detailPlaceholder: "reason", detailJoiner: " due to " }
        ],
        report: "Chinese Lawton IADL: {answer}" },

      { id: "ghf_lawton", type: "score", label: "Chinese Lawton IADL", hideLabel: true,
        showIf: { questionId: "ghf_lawtonStatus",
          notAnyOf: ["not_tested", "pre_op"] },
        items: LAWTON_ITEMS, blankBefore: true, quickFill: true,
        breakdown: { perLine: 5, sep: "   " },
        report: "Chinese Lawton IADL: {answer}" }
    ]
  },

  {
    id: "fall",
    label: "Falls",
    title: "Fall Assessment",
    part: "A",
    reportTitle: "FALL ASSESSMENT",
    questions: [
      // Each line is owned by the question that opens it; the rest are folded in as
      // cross-references and hidden, so tidyLine drops "; Frequency:" and the empty
      // "()" when the gate above them is No.
      { id: "ghf_fallRisk", type: "yesno", label: "Fall risk",
        report: "Fall Risk: {answer} ({q:ghf_fallRiskLevel}); " +
                "Risk factors: {q:ghf_fallRiskFactors}" },

      { id: "ghf_fallRiskLevel", type: "single", label: "Risk level",
        showIf: { questionId: "ghf_fallRisk", equals: "yes" },
        options: [
          { value: "low",  label: "Low risk" },
          { value: "high", label: "High risk" }
        ],
        hideInReport: true },

      { id: "ghf_fallRiskFactors", type: "multi", label: "Risk factors",
        showIf: { questionId: "ghf_fallRisk", equals: "yes" },
        options: ["Dizziness", "LL weakness", "Cognitive problem", "Gait disturbance",
          "History of fall", "Poor safety awareness",
          { value: "Other", label: "Other", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…" }],
        hideInReport: true },

      { id: "ghf_fallAny", type: "yesno", label: "History of fall in recent year",
        report: "History of fall in recent year: {answer}; " +
                "Frequency: {q:ghf_fallCount}" },

      // Bracketed into the line above, so the caption travels in the template and
      // the value stays bare.
      { id: "ghf_fallCount", type: "number", label: "Frequency", max: 99,
        placeholder: "times",
        showIf: { questionId: "ghf_fallAny", equals: "yes" },
        hideInReport: true },

      { id: "ghf_fallDetails", type: "textarea", label: "Fall details",
        placeholder: "Where and how the fall happened…",
        showIf: { questionId: "ghf_fallAny", equals: "yes" },
        report: "Fall Details: {answer}" }
    ]
  },

  {
    id: "hdrs",
    label: "HDRS",
    title: "Home Discharge Readiness Scale (HDRS)",
    part: "A",
    reportTitle: "HOME DISCHARGE READINESS SCALE (HDRS)",
    questions: [
      { id: "ghf_hdrs", type: "score", label: "HDRS elements", hideLabel: true,
        // The sum of the six is not the result — each factor is the floor of its
        // pair's mean, and the level is banded from the three.
        hideTotal: true,
        items: GHF_HDRS_ITEMS, groups: HDRS_FACTORS,
        hideInReport: true },

      // The card already shows each factor's rating in its block header, so these
      // lines exist only for the note.
      { id: "ghf_hdrsFactors", type: "computed", label: "Factor ratings",
        compute: "hdrsFactors", reportOnly: true,
        report: "{answer}" },

      { id: "ghf_hdrsLevel", type: "computed", label: "Level of readiness",
        compute: "hdrsLevel",
        report: "Level of Readiness: {answer}" }
    ]
  },

  {
    id: "otcomment",
    label: "OT Comment",
    title: "OT Comment",
    part: "A",
    reportTitle: "OT COMMENT",
    // The ward's handover field is one line of 250 characters, so the same block is
    // offered flattened as a part of its own.
    flatPart: { key: "G", join: "; " },
    questions: [
      { id: "ghf_otComment", type: "textarea", label: "OT comment", hideLabel: true,
        placeholder: "Handover note…",
        report: "{answer}" },

      // Both blocks read figures recorded elsewhere, so the handover line stands on
      // its own without the therapist retyping them. Each keeps a free-text box for
      // whatever the figures do not say.
      { type: "heading", label: "ADL" },

      { id: "ghf_adlAuto", type: "computed", label: "Auto",
        compute: "adlSummary",
        report: "{answer}" },

      { id: "ghf_adlNote", type: "text", label: "Additional information",
        hideLabel: true, placeholder: "Anything to add about ADL…",
        flatJoin: ". ", report: "{answer}" },

      { type: "heading", label: "Cognitive" },

      { id: "ghf_cogAuto", type: "computed", label: "Auto",
        compute: "cognitiveSummary",
        report: "{answer}" },

      { id: "ghf_cogNote", type: "text", label: "Additional information",
        hideLabel: true, placeholder: "Anything to add about cognition…",
        flatJoin: ". ", report: "{answer}" }
    ]
  },

  {
    id: "problem",
    label: "Problem",
    title: "Problem Identification",
    part: "D",
    questions: [
      // Each factor is asked and answered on its own, so the note can say a factor
      // was considered and found clear rather than staying silent about it. NAD is
      // exclusive within its factor: nothing abnormal cannot coexist with a problem.
      { id: "ghf_problemPatient", type: "multi", label: "Patient Factor",
        exclusive: "NAD",
        options: ["NAD", "Impaired ADL function", "Impaired cognition",
          "Impaired physical stability", "Impaired safety awareness",
          { value: "Other", label: "Other", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…" }],
        report: "Patient Factor: {answer}" },

      { id: "ghf_problemEnv", type: "multi", label: "Environmental Factor",
        exclusive: "NAD",
        options: ["NAD", "Limited accessibility", "Risky home environment",
          { value: "Other", label: "Other", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…" }],
        report: "Environmental Factor: {answer}" },

      { id: "ghf_problemSocial", type: "multi", label: "Social Factor",
        exclusive: "NAD",
        options: ["NAD", "Live alone / Daytime / Nighttime alone",
          "Lack of competent caregiver",
          { value: "Other", label: "Other", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…" }],
        report: "Social Factor: {answer}" }
    ]
  },

  {
    id: "recommendation",
    label: "Recommendation",
    title: "Treatment and Recommendation",
    part: "E",
    questions: [
      // Every pick is something carried out, so the note says so — except Others,
      // where what was typed already reads as finished or not.
      { id: "ghf_treatmentDone", type: "multi", label: "Treatment",
        itemSuffix: " done",
        options: [
          "Pre-operation assessment", "Cognitive Assessment",
          "Cognitive/Orientation training",
          "ADL Assessment and Training", "IADL Assessment and Training",
          // Worded into the sentence rather than bracketed after it, and its two
          // alternatives joined the way the team writes them.
          { value: "patient_education", label: "Patient education",
            subJoiner: " on ", subSuffix: "", subJoin: "/",
            sub: ["Fall Prevention and Home safety", "Hip precaution recommendation"] },
          "Limb function maintenance/positioning", "Pressure injury prevention",
          "Tailor-made pressure stockings", "Carer interview/education/training",
          "Home Assessment and Modification", "Aids Prescription", "Home visit",
          { value: "other_done", label: "Others", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…", itemSuffix: "" }
        ],
        report: "Treatment:\n{answer}" },

      { id: "ghf_treatmentPlan", type: "multi", label: "Treatment plan",
        blankBefore: true,
        options: [
          "Continue ADL training", "Maintenance training",
          { value: "other_plan", label: "Others", detail: true, detailOnly: true,
            detailPlaceholder: "Specify…" }
        ],
        report: "Treatment plan:\n{answer}" },

      { id: "ghf_recommendation", type: "multi", label: "Recommendation",
        blankBefore: true,
        options: [
          "Continue Hip Rehabilitation Program",
          // A patient goes to one destination, so the note names the one chosen
          // rather than printing all three.
          { value: "suggest", label: "Suggest",
            subJoiner: " ", subSuffix: "", subJoin: "/",
            sub: ["Direct discharge home", "Direct discharge OAH",
              "Convalescent Hospital (KH/BH)"] }
        ],
        report: "Recommendation:\n{answer}" }
    ]
  }
];
