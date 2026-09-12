// Ortho Day Rehab FU — the one `coded` form: a hand-written renderer and summary
// builder rather than a schema the engine walks.
//
// It is deliberately frozen. The team relies on it, so extensions derive new constants
// from these (GHF_MBI_ITEMS from MBI_ITEMS) rather than changing what it reads. Leave
// it alone unless the change is explicitly for it; write new forms as schema forms.
//
// It reproduces a paper template, kept in the repo as `ortho day template.txt`.

import { render } from "../render.js";
import {
  chipOption, chipsFromMap, collapsibleCard, dateInput, el, fieldBlock, fieldRow,
  formCard, naChip, numInput, textInput
} from "../dom.js";
import { detailKey } from "../schema/engine.js";
import {
  LAWTON_ITEMS, MBI_ITEMS, hasAnyScore, scoreCard, scoreEntries, scoreMax,
  scoreTotal
} from "../score.js";
import {
  State, setField, setSingle, toggleChip, toggleChipExclusive
} from "../state.js";
import {
  boxes, fmtEventDate, fmtPeriod, isMonthPrecision, monthsBetween, pickLabels
} from "../util.js";

// ── Section tabs ───────────────────────────────────────────────────────────
export const OD_SECTIONS = [
  { id: "background", label: "Background",  summaryLabel: "A. COMMON ASSESSMENT NOTES" },
  { id: "social",     label: "Social/Home", summaryLabel: "SOCIAL HISTORY AND HOME ENVIRONMENT" },
  { id: "falls",      label: "Fall Hx",     summaryLabel: "FALL HISTORY" },
  { id: "physical",   label: "Physical",    summaryLabel: "B. PHYSICAL ASSESSMENT NOTES" },
  { id: "risk",       label: "Fall Risk",   summaryLabel: "FALL RISK ASSESSMENT" },
  { id: "scores",     label: "MBI / IADL",  summaryLabel: "FUNCTIONAL SCORES" },
  { id: "plan",       label: "Problem/Plan" }
];

// ── Label maps (declaration order = summary output order) ──────────────────
export const ATTEND_LABELS = {
  bone_health: "Bone Health Medication FU",
  post_op:     "Post Operation FU"
};

export const SIDE_LABELS = { right: "Right", left: "Left", bilateral: "Bilateral" };

export const FRAC_SITE_LABELS = {
  nof:        "NOF",
  tof:        "TOF",
  subtroch:   "Subtrochanteric",
  greater_troch: "Greater trochanter",
  pubic_rami: "Pubic rami",
  spine:      "Spine",
  other:      "Others"
};

export const EVENT_LABELS = {
  hip_op:         "Post hip operation",
  collapsed_spine: "Collapsed spine",
  injury:         "Post injury"
};

export const OCCUPATION_LABELS = {
  retired:        "Retired",
  self_maintainer: "Self maintainer",
  housewife:      "Housewife",
  home_dependent: "Home dependent",
  oah:            "OAH resident",
  worker:         "Worker"
};

export const ADL_LABELS  = { independent: "Independent", assisted: "Assisted", dependent: "Dependent" };

export const IADL_LABELS = {
  independent: "Independent",
  partial:     "Partial dependent",
  dependent:   "Dependent"
};

// Mutually exclusive living states. "Daytime alone" is not one of them — it is an
// add-on to living with others, recorded separately in od_daytimeAlone.
export const LIVING_LABELS = {
  with_others: "Lives with others",
  alone:       "Lives alone",
  oahr:        "OAHR"
};

export const LIFT_LABELS = { direct: "Direct lift landing", non_direct: "Non-direct lift landing" };

export const BATHING_LABELS = {
  standard_toilet: "Standard toilet",
  squat_toilet:    "Squat toilet",
  bathtub:         "Bathtub",
  shower_cubicle:  "Shower cubicle"
};

// Handrail presence is recorded per area, not per facility.
export const BATHING_ZONE = {
  standard_toilet: "toilet",
  squat_toilet:    "toilet",
  bathtub:         "bathing",
  shower_cubicle:  "bathing"
};

export const DEVICE_LABELS = {
  safety_alarm:      "Safety alarm",
  wheelchair_std:    "Wheelchair (standard)",
  wheelchair_transit: "Wheelchair (transit)",
  commode:           "Commode",
  shower_chair:      "Shower chair",
  bathboard:         "Bathboard",
  raised_toilet_seat: "Raised toilet seat",
  reacher:           "Long handle reacher",
  nil:               "Nil"
};

// Shared by both walking-aid rows; each row picks and orders its own subset.
export const AID_LABELS = {
  unaided:    "Unaided",
  furniture:  "Furniture",
  stick:      "Stick",
  quad:       "Quadripod",
  frame:      "Frame",
  rollator:   "Rollator",
  trolley:    "Trolley",
  wheelchair: "Wheelchair",
  chairbound: "Chairbound"
};

export const AID_INDOOR  = ["unaided", "furniture", "stick", "quad", "frame", "rollator", "chairbound"];

export const AID_OUTDOOR = ["unaided", "stick", "quad", "frame", "rollator", "trolley", "wheelchair"];

export const SOCIAL_SERVICE_LABELS = {
  home_help: "Home help service",
  day_care:  "Day care centre",
  other:     "Other",
  nil:       "Nil"
};

export const HOME_HELP_LABELS = {
  mow:       "MOW",
  cleansing: "Cleansing",
  bathing:   "Bathing",
  escorting: "Escorting"
};

export const FALL_SINCE_LABELS = { discharge: "since discharge", year: "in the recent 1 year" };

export const FALL_REASON_LABELS = {
  dizziness: "Dizziness",
  ll_weakness: "LL weakness",
  tripped:   "Tripped",
  slipped:   "Slipped",
  env_hazard: "Environmental hazards",
  risky:     "Risky behaviour",
  unknown:   "Unknown",
  other:     "Others"
};

export const SENSORY_LABELS = {
  visual:  "Visual impaired",
  hearing: "Hearing impaired",
  nil:     "Nil visual and hearing impairment"
};

export const ORIENT_STATE_LABELS = { oriented: "Oriented", disoriented: "Disoriented" };

export const ORIENT_LABELS = { time: "Time", place: "Place", person: "Person" };

export const MOOD_LABELS = {
  cheerful:  "Cheerful",
  stable:    "Stable",
  anxious:   "Anxious",
  depressed: "Depressed",
  irritable: "Irritable",
  agitated:  "Agitated",
  other:     "Other"
};

export const ROM_LABELS = {
  full:       "Full",
  functional: "Functional range",
  limited:    "Limited",
  contracture: "Contracture"
};

export const BALANCE_LABELS = { satisfactory: "Satisfactory", fair: "Fair", poor: "Poor" };

export const FRAT_STATUS_LABELS = { low: "Low Risk", medium: "Medium Risk", high: "High Risk" };

export const AUTO_HIGH_LABELS = {
  func_change: "Recent change in functional status and / or medication affecting safe mobility",
  dizziness:   "Dizziness / postural hypotension",
  nil:         "Nil"
};

// Fall Risk Factor Checklist — one collapsible card per heading.
// Answers stored per heading in the array field "od_risk_" + key.
export const RISK_CHECKLIST = [
  { key: "vision", label: "Vision", items: [
    { key: "objects",  label: "Difficulty seeing objects" },
    { key: "signs",    label: "Difficulty seeing signs" },
    { key: "wayfind",  label: "Difficulty finding way around" }
  ] },
  { key: "mobility", label: "Mobility", items: [
    { key: "unsafe",   label: "Unknown or appears unsafe" },
    { key: "impulsive", label: "Impulsive" },
    { key: "forgets_aid", label: "Forgets gait aid" }
  ] },
  { key: "transfers", label: "Transfers", items: [
    { key: "unsafe",   label: "Unknown or appears unsafe" }
  ] },
  { key: "behaviour", label: "Behaviours", items: [
    { key: "agitation", label: "Agitation" },
    { key: "confusion", label: "Confusion" },
    { key: "disorientation", label: "Disorientation" },
    { key: "non_compliant", label: "Difficulty following instructions or non-compliant" }
  ] },
  { key: "adl", label: "ADL", items: [
    { key: "risk_taking", label: "Risk-taking behaviours" },
    { key: "unsafe_equip", label: "Observed unsafe use of equipment" }
  ] },
  { key: "footwear", label: "Footwear", items: [
    { key: "unsafe",   label: "Unsafe footwear", detailKey: "od_riskFootwearDetail", detailPlaceholder: "Specify…" },
    { key: "clothing", label: "Inappropriate clothing" }
  ] },
  { key: "environment", label: "Environment", items: [
    { key: "orientation", label: "Difficulties with orientation to environment" }
  ] },
  { key: "nutrition", label: "Nutrition", items: [
    { key: "underweight", label: "Underweight" },
    { key: "low_appetite", label: "Low appetite" }
  ] },
  { key: "continence", label: "Continence", items: [
    { key: "urgency",  label: "Reported or known urgency" },
    { key: "nocturia", label: "Nocturia" },
    { key: "accidents", label: "Accidents" }
  ] }
];

// The generated note is delivered as four separately copyable parts. The titles
// are headings on screen only — they are never part of the copied text.
export const SUMMARY_PARTS = [
  { key: "A", title: "A. COMMON ASSESSMENT NOTES" },
  { key: "B", title: "B. PHYSICAL ASSESSMENT NOTES" },
  { key: "C", title: "C. PROBLEM" },
  { key: "D", title: "D. RECOMMENDATION" }
];

export const PROBLEM_LABELS = {
  pain:            "Fracture site pain",
  health:          "Impaired health status / multiple medical problems",
  cognition:       "Impaired cognition / physical ability",
  adl_risk:        "Impaired / risky behaviour in ADL function",
  social:          "Inadequate social support",
  safety:          "Poor safety awareness",
  env_hazard:      "Environmental hazards",
  deconditioning:  "Deconditioning",
  other:           "Others",
  nil:             "Nil significant fall risk identified"
};

export const RECOMMEND_LABELS = {
  fall_education: "Fall education talk provided. Continue Fragility Fracture Day Rehabilitation Service",
  not_indicated:  "Not indicated for Fragility Fracture Day Rehabilitation Training program",
  suggested:      "Suggest for Fragility Fracture Day Rehabilitation Training program"
};

export const RESPONSE_LABELS = { agreed: "Agreed", refused: "Refused" };

export function seedOrthoDayFields(a) {
  Object.assign(a, {
    // A — common assessment notes
    od_attendReason: "",
    od_fracSide: "",
    od_fracSite: [],
    od_fracSiteOther: "",
    od_spineLevel: "",
    od_eventType: "",
    od_eventDate: "",
    od_occupation: "",
    od_premorbidAdl: "",
    od_premorbidIadl: "",
    od_cameAlone: "",
    od_cameWith: "",

    // Social history and home environment
    od_living: "",
    od_daytimeAlone: "",
    od_livesWithDetail: "",
    od_mainCarer: "",
    od_homeLift: "",
    od_homeFos: "",
    od_bathing: [],
    od_handrailToilet: "",
    od_handrailBathing: "",
    od_devices: [],
    od_aidIndoor: "",
    od_aidOutdoor: "",
    od_socialService: [],
    od_homeHelp: [],
    od_dayCareFreq: "",
    od_socialServiceOther: "",

    // Fall history
    od_fallSince: "",
    od_fallAny: "",
    od_fallCount: "",
    od_fallEpisodeCount: 1,

    // B — physical assessment
    od_bpSys: "", od_bpDia: "", od_pulse: "", od_temp: "",
    od_sensory: [],
    od_orientState: "",
    od_orient: [],
    od_commandSteps: "",
    od_mood: "",
    od_moodOther: "",
    od_cdt: "",
    od_cdtNa: "",
    od_cdtNaReason: "",
    od_painSite: [],
    od_painOther: "",
    od_nprs: "",
    od_rom: "",
    od_romDetail: "",
    od_mmtUlR: "", od_mmtUlL: "", od_mmtLlR: "", od_mmtLlL: "",
    od_balSit: "",
    od_balStand: "",

    // Fall risk assessment
    od_fearFall: "",
    od_fes: "",
    od_fesNa: "",
    od_fesNaReason: "",
    od_frat: "",
    // Fall risk status is derived from od_frat and od_autoHigh — see fallRiskStatus().
    od_autoHigh: [],
    od_riskFootwearDetail: "",
    od_riskNil: "",

    // Functional scores
    od_mbi: {},
    od_lawton: {},

    // C / D — problem and recommendation
    od_problems: [],
    od_problemsOther: "",
    od_deconditionMbi: "",
    od_recommend: [],
    od_recommendResponse: "",
    od_recommendRefusedReason: ""
  });

  for (let n = 1; n <= 3; n++) {
    a["od_fall" + n + "_place"] = "";
    a["od_fall" + n + "_detail"] = "";
    a["od_fall" + n + "_reason"] = [];
    a["od_fall" + n + "_reasonOther"] = "";
  }
  RISK_CHECKLIST.forEach(g => { a["od_risk_" + g.key] = []; });
}

// ── Ortho Day Rehab form ───────────────────────────────────────────────────
export function renderOrthoDayForm(a, content) {
  const sid = OD_SECTIONS[State.section].id;
  if      (sid === "background") renderOdBackground(a, content);
  else if (sid === "social")     renderOdSocial(a, content);
  else if (sid === "falls")      renderOdFalls(a, content);
  else if (sid === "physical")   renderOdPhysical(a, content);
  else if (sid === "risk")       renderOdRisk(a, content);
  else if (sid === "scores")     renderOdScores(a, content);
  else if (sid === "plan")       renderOdPlan(a, content);
}

export function renderOdBackground(a, content) {
  content.appendChild(formCard("Assessment",
    fieldBlock("Assessment date", dateInput("date", { rerender: true }))
  ));

  content.appendChild(formCard("Attended today for",
    chipsFromMap("od_attendReason", ATTEND_LABELS)
  ));

  content.appendChild(formCard("Fracture site",
    fieldBlock("Side", chipsFromMap("od_fracSide", SIDE_LABELS)),
    fieldBlock("Site", chipsFromMap("od_fracSite", FRAC_SITE_LABELS, true)),
    (a.od_fracSite || []).includes("spine")
      ? fieldBlock("Level of spine", textInput("od_spineLevel", "e.g. T12, L1")) : null,
    (a.od_fracSite || []).includes("other")
      ? fieldBlock("Others", textInput("od_fracSiteOther", "Specify site…")) : null
  ));

  // The day of operation is often unknown, so the date may be month-precision.
  // Which picker is shown is UI state — the stored string cannot express "exact
  // precision wanted, day not chosen yet", so it must not drive the toggle. The
  // string remains the source of truth for formatting and the period arithmetic.
  const monthOnly = !!State.odEventMonthOnly;
  const period = fmtPeriod(monthsBetween(a.od_eventDate, a.date));

  const precisionChip = (wantMonth, label) => {
    const chip = el("span", { class: "chip" + (wantMonth === monthOnly ? " selected" : "") }, label);
    chip.addEventListener("click", () => {
      if (wantMonth === monthOnly) return;
      State.odEventMonthOnly = wantMonth;
      // Narrowing to month-only just drops the day; widening keeps what we have
      // and leaves the picker for the user to complete.
      if (wantMonth) setField("od_eventDate", (a.od_eventDate || "").slice(0, 7));
      render();
    });
    return chip;
  };

  content.appendChild(formCard("Operation / event",
    chipsFromMap("od_eventType", EVENT_LABELS),
    fieldBlock("Date precision",
      el("div", { class: "chips" },
        precisionChip(false, "Exact date"),
        precisionChip(true, "Month only"))),
    fieldBlock("Date of operation / injury",
      dateInput("od_eventDate", { month: monthOnly, rerender: true }),
      // Widening to an exact date leaves the picker empty because only the month
      // was ever recorded — say so, rather than looking like a lost value.
      (!monthOnly && isMonthPrecision(a.od_eventDate))
        ? el("div", { class: "field-hint" },
            "Recorded as " + fmtEventDate(a.od_eventDate) + " — pick a full date to add the day.")
        : null),
    period ? el("div", { class: "field-hint" }, "Period: " + period) : null
  ));

  content.appendChild(formCard("Occupation",
    chipsFromMap("od_occupation", OCCUPATION_LABELS)
  ));

  content.appendChild(formCard("Premorbid function",
    fieldRow(
      fieldBlock("ADL",  chipsFromMap("od_premorbidAdl", ADL_LABELS)),
      fieldBlock("IADL", chipsFromMap("od_premorbidIadl", IADL_LABELS)))
  ));

  content.appendChild(formCard("Attendance",
    el("div", { class: "chips" }, chipOption("od_cameAlone", "yes", "Came alone")),
    a.od_cameAlone === "yes"
      ? null
      : fieldBlock("Came with", textInput("od_cameWith", "e.g. daughter, domestic helper…"))
  ));
}

export function renderOdSocial(a, content) {
  // "Daytime alone" only applies to someone living with others, so leaving that
  // state must clear it rather than leave a stale value to print in the summary.
  const livingChip = (value, label) => {
    const chip = el("span", {
      class: "chip" + (a.od_living === value ? " selected" : "")
    }, label);
    chip.addEventListener("click", () => {
      // setSingle toggles off when re-clicking, so test the resulting state.
      const willBe = a.od_living === value ? "" : value;
      if (willBe !== "with_others") setField("od_daytimeAlone", "");
      setSingle("od_living", value);
    });
    return chip;
  };

  content.appendChild(formCard("Living situation",
    el("div", { class: "chips" },
      ...Object.keys(LIVING_LABELS).map(k => livingChip(k, LIVING_LABELS[k]))),
    a.od_living === "with_others"
      ? fieldBlock("Lives with", textInput("od_livesWithDetail", "e.g. spouse, son…")) : null,
    a.od_living === "with_others"
      ? fieldBlock("Daytime", el("div", { class: "chips" },
          chipOption("od_daytimeAlone", "yes", "Daytime alone"))) : null,
    fieldBlock("Main carer", textInput("od_mainCarer", "e.g. daughter / domestic helper / nil"))
  ));

  content.appendChild(formCard("Home environment",
    chipsFromMap("od_homeLift", LIFT_LABELS),
    a.od_homeLift === "non_direct"
      ? fieldBlock("Flights of stairs",
          el("div", { class: "tolerated-row" },
            numInput("od_homeFos", "n"), el("span", { class: "unit" }, "FOS"))) : null
  ));

  // Offer a handrail chip only for an area that actually has a facility selected.
  const hasZone = zone => (a.od_bathing || []).some(k => BATHING_ZONE[k] === zone);
  // Drop a handrail answer whose area no longer has any facility, so it cannot
  // reappear pre-selected if that facility is added back later.
  if (!hasZone("toilet")  && a.od_handrailToilet)  setField("od_handrailToilet", "");
  if (!hasZone("bathing") && a.od_handrailBathing) setField("od_handrailBathing", "");
  const handrailChips = [
    hasZone("toilet")  ? chipOption("od_handrailToilet", "yes", "Toilet area") : null,
    hasZone("bathing") ? chipOption("od_handrailBathing", "yes", "Bathing area") : null
  ].filter(Boolean);

  content.appendChild(formCard("Bathing facility",
    chipsFromMap("od_bathing", BATHING_LABELS, true),
    handrailChips.length
      ? fieldBlock("Handrail present at", el("div", { class: "chips" }, ...handrailChips)) : null
  ));

  content.appendChild(formCard("Assistive device available",
    chipsFromMap("od_devices", DEVICE_LABELS, true, null, "nil")
  ));

  content.appendChild(formCard("Walking aids",
    fieldRow(
      fieldBlock("Indoor",  chipsFromMap("od_aidIndoor", AID_LABELS, false, AID_INDOOR)),
      fieldBlock("Outdoor", chipsFromMap("od_aidOutdoor", AID_LABELS, false, AID_OUTDOOR)))
  ));

  content.appendChild(formCard("Social service",
    chipsFromMap("od_socialService", SOCIAL_SERVICE_LABELS, true, null, "nil"),
    (a.od_socialService || []).includes("home_help")
      ? fieldBlock("Home help service", chipsFromMap("od_homeHelp", HOME_HELP_LABELS, true)) : null,
    (a.od_socialService || []).includes("day_care")
      ? fieldBlock("Day care frequency", textInput("od_dayCareFreq", "e.g. Mon to Fri")) : null,
    (a.od_socialService || []).includes("other")
      ? fieldBlock("Other", textInput("od_socialServiceOther", "Specify…")) : null
  ));
}

export function renderOdFalls(a, content) {
  content.appendChild(formCard("Fall / near-fall incident",
    fieldBlock("Period", chipsFromMap("od_fallSince", FALL_SINCE_LABELS)),
    fieldBlock("Any incident?",
      el("div", { class: "chips" },
        chipOption("od_fallAny", "yes", "Yes"),
        chipOption("od_fallAny", "no", "No"))),
    a.od_fallAny === "yes"
      ? fieldBlock("Number of falls",
          el("div", { class: "tolerated-row" },
            numInput("od_fallCount", "n"), el("span", { class: "unit" }, "times"))) : null
  ));

  if (a.od_fallAny !== "yes") return;

  const shown = Math.min(Math.max(parseInt(a.od_fallEpisodeCount, 10) || 1, 1), 3);

  for (let n = 1; n <= shown; n++) {
    content.appendChild(episodeCard(a, n));
  }

  if (shown < 3) {
    content.appendChild(
      el("div", { style: "text-align:center;padding:4px 0 8px" },
        el("button", {
          class: "btn btn-secondary btn-sm",
          onclick: () => { setField("od_fallEpisodeCount", shown + 1); render(); }
        }, "+ Add episode")
      )
    );
  }
}

export function episodeCard(a, n) {
  const placeKey  = "od_fall" + n + "_place";
  const detailKey = "od_fall" + n + "_detail";
  const reasonKey = "od_fall" + n + "_reason";

  const removeBtn = n > 1
    ? el("button", {
        class: "btn btn-secondary btn-sm", style: "margin-top:8px",
        onclick: () => {
          setField(placeKey, ""); setField(detailKey, "");
          setField(reasonKey, []); setField("od_fall" + n + "_reasonOther", "");
          setField("od_fallEpisodeCount", n - 1);
          render();
        }
      }, "Remove episode " + n)
    : null;

  return formCard("Episode " + n,
    fieldBlock("Location",
      el("div", { class: "chips" },
        chipOption(placeKey, "indoor", "Indoor"),
        chipOption(placeKey, "outdoor", "Outdoor"))),
    a[placeKey]
      ? fieldBlock("Where", textInput(detailKey, a[placeKey] === "indoor"
          ? "e.g. bathroom, bedside" : "e.g. street, park")) : null,
    fieldBlock("Reason", chipsFromMap(reasonKey, FALL_REASON_LABELS, true)),
    (a[reasonKey] || []).includes("other")
      ? fieldBlock("Others", textInput("od_fall" + n + "_reasonOther", "Specify…")) : null,
    removeBtn
  );
}

export function renderOdPhysical(a, content) {
  content.appendChild(formCard("Vital signs",
    fieldRow(
      fieldBlock("Blood pressure",
        el("div", { class: "tolerated-row" },
          numInput("od_bpSys", "sys"), el("span", { class: "sep" }, "/"),
          numInput("od_bpDia", "dia"), el("span", { class: "unit" }, "mmHg"))),
      fieldBlock("Pulse",
        el("div", { class: "tolerated-row" },
          numInput("od_pulse", "bpm"), el("span", { class: "unit" }, "/ min"))),
      fieldBlock("Temperature",
        el("div", { class: "chips" },
          chipOption("od_temp", "afebrile", "Afebrile"),
          chipOption("od_temp", "febrile", "Febrile"))))
  ));

  content.appendChild(formCard("Sensory",
    chipsFromMap("od_sensory", SENSORY_LABELS, true, null, "nil")
  ));

  const cdtNaChip = naChip("od_cdtNa", "od_cdt");

  // Dropping the polarity must drop the domains too, or "Disoriented to time"
  // would silently become "Oriented to time".
  const orientStateChip = (value, label) => {
    const chip = el("span", {
      class: "chip" + (a.od_orientState === value ? " selected" : "")
    }, label);
    chip.addEventListener("click", () => {
      if (a.od_orientState === value) setField("od_orient", []);
      setSingle("od_orientState", value);
    });
    return chip;
  };

  // Switching away from Other leaves its text unused — clear it so it cannot
  // reappear if Other is picked again later.
  const moodChip = (value, label) => {
    const chip = el("span", {
      class: "chip" + (a.od_mood === value ? " selected" : "")
    }, label);
    chip.addEventListener("click", () => {
      if (value !== "other") setField("od_moodOther", "");
      setSingle("od_mood", value);
    });
    return chip;
  };

  content.appendChild(formCard("Mental",
    fieldBlock("Reality orientation",
      el("div", { class: "chips" },
        ...Object.keys(ORIENT_STATE_LABELS).map(k => orientStateChip(k, ORIENT_STATE_LABELS[k]))),
      // A domain means nothing without a polarity, so ask for the state first.
      a.od_orientState
        ? el("div", { style: "margin-top:6px" },
            chipsFromMap("od_orient", ORIENT_LABELS, true))
        : null),
    fieldRow(
      fieldBlock("Follows command",
        el("div", { class: "tolerated-row" },
          numInput("od_commandSteps", "n"), el("span", { class: "unit" }, "step(s)"))),
      fieldBlock("Clock Drawing Test",
        a.od_cdtNa === "yes"
          ? el("div", { class: "chips" }, cdtNaChip)
          : el("div", { class: "tolerated-row" },
              numInput("od_cdt", "score", 10), el("span", { class: "unit" }, "/ 10"), cdtNaChip),
        a.od_cdtNa === "yes"
          ? el("div", { style: "margin-top:6px" },
              textInput("od_cdtNaReason", "Reason, e.g. unable to understand"))
          : null)),
    fieldBlock("Mood",
      el("div", { class: "chips" },
        ...Object.keys(MOOD_LABELS).map(k => moodChip(k, MOOD_LABELS[k]))),
      a.od_mood === "other"
        ? el("div", { style: "margin-top:6px" },
            textInput("od_moodOther", "Specify mood…"))
        : null)
  ));

  content.appendChild(formCard("Physical examination",
    fieldBlock("Pain site",
      el("div", { class: "chips" },
        chipOption("od_painSite", "fracture", "Fracture site", true),
        chipOption("od_painSite", "other", "Other site", true))),
    (a.od_painSite || []).includes("other")
      ? fieldBlock("Other site", textInput("od_painOther", "Specify…")) : null,
    (a.od_painSite || []).length
      ? fieldBlock("NPRS",
          el("div", { class: "tolerated-row" },
            numInput("od_nprs", "score", 10), el("span", { class: "unit" }, "/ 10"))) : null,
    fieldBlock("ROM", chipsFromMap("od_rom", ROM_LABELS)),
    (a.od_rom === "limited" || a.od_rom === "contracture")
      ? fieldBlock(a.od_rom === "contracture" ? "Contracture over" : "Limitation detail",
          textInput("od_romDetail", "Specify…")) : null,
    fieldRow(
      fieldBlock("MMT — Upper limb",
        el("div", { class: "tolerated-row" },
          el("span", { class: "unit" }, "R"), textInput("od_mmtUlR", "grade", "narrow"),
          el("span", { class: "unit" }, "L"), textInput("od_mmtUlL", "grade", "narrow"))),
      fieldBlock("MMT — Lower limb",
        el("div", { class: "tolerated-row" },
          el("span", { class: "unit" }, "R"), textInput("od_mmtLlR", "grade", "narrow"),
          el("span", { class: "unit" }, "L"), textInput("od_mmtLlL", "grade", "narrow"))))
  ));

  content.appendChild(formCard("Balance",
    fieldRow(
      fieldBlock("Sitting balance",  chipsFromMap("od_balSit", BALANCE_LABELS)),
      fieldBlock("Standing balance", chipsFromMap("od_balStand", BALANCE_LABELS)))
  ));
}

// Fall risk status is calculated, never chosen.
// FRAT bands (Peninsula Health FRAT): 5–11 Low, 12–15 Medium, 16–20 High.
// Any Automatic High Risk Status answer other than Nil forces High regardless.
// FRAT bands, plus the override that matters clinically: any automatic-high-risk
// factor makes the patient high risk whatever the score says, and "Nil" never does.
// Shared by both forms, so the rule cannot drift between them.
export function fratBand(autoHigh, fratScore) {
  if ((autoHigh || []).some(v => v !== "nil")) return "high";
  const n = parseInt(fratScore, 10);
  if (!n) return "";
  if (n <= 11) return "low";
  if (n <= 15) return "medium";
  return "high";
}

export function fallRiskStatus(a) { return fratBand(a.od_autoHigh, a.od_frat); }

export function fallRiskLabel(a) {
  const band = fallRiskStatus(a);
  return band ? FRAT_STATUS_LABELS[band] : "";
}

export function renderOdRisk(a, content) {
  content.appendChild(formCard("Fear of fall",
    fieldRow(
      fieldBlock("Fear of fall",
        el("div", { class: "chips" },
          chipOption("od_fearFall", "yes", "Yes"),
          chipOption("od_fearFall", "no", "No"))),
      fieldBlock("Fall Efficacy Scale",
        a.od_fesNa === "yes"
          ? el("div", { class: "chips" }, naChip("od_fesNa", "od_fes"))
          : el("div", { class: "tolerated-row" },
              numInput("od_fes", "score", 100), el("span", { class: "unit" }, "/ 100"),
              naChip("od_fesNa", "od_fes")),
        a.od_fesNa === "yes"
          ? el("div", { style: "margin-top:6px" },
              textInput("od_fesNaReason", "Reason, e.g. unable to understand"))
          : null))
  ));

  // One node either way, so typing into the score updates it in place and the
  // input keeps focus.
  const noStatus = "Enter a FRAT score, or tick an automatic high risk factor below";
  const statusLine = el("div", { class: "field-hint" }, fallRiskLabel(a) || noStatus);
  const fratInp = numInput("od_frat", "score", 20);
  fratInp.addEventListener("input", () => {
    statusLine.textContent =
      fallRiskLabel(Object.assign({}, a, { od_frat: fratInp.value })) || noStatus;
  });

  content.appendChild(formCard("FRAT",
    fieldBlock("Score",
      el("div", { class: "tolerated-row" }, fratInp, el("span", { class: "unit" }, "/ 20"))),
    // Calculated from the score and from Automatic high risk status below, so it
    // is shown rather than chosen.
    fieldBlock("Fall risk status (calculated)", statusLine)
  ));

  content.appendChild(formCard("Automatic high risk status",
    chipsFromMap("od_autoHigh", AUTO_HIGH_LABELS, true, null, "nil")
  ));

  content.appendChild(el("div", { class: "section-label" }, "Fall Risk Factor Checklist"));

  // The checklist and "Nil" contradict each other, but the checklist answers are
  // spread across nine arrays, so the exclusion is handled here rather than by
  // toggleChipExclusive (which works within a single array).
  const clearChecklist = () => {
    RISK_CHECKLIST.forEach(g => {
      setField("od_risk_" + g.key, []);
      g.items.forEach(it => { if (it.detailKey) setField(it.detailKey, ""); });
    });
  };

  const checklistChip = (arrKey, it) => {
    const chip = el("span", {
      class: "chip" + ((a[arrKey] || []).includes(it.key) ? " selected" : "")
    }, it.label);
    chip.addEventListener("click", () => {
      if (!(a[arrKey] || []).includes(it.key)) setField("od_riskNil", "");
      toggleChip(arrKey, it.key);
    });
    return chip;
  };

  RISK_CHECKLIST.forEach(group => {
    const arrKey = "od_risk_" + group.key;
    const selected = a[arrKey] || [];
    content.appendChild(collapsibleCard(arrKey, group.label, selected.length, () => {
      const nodes = [el("div", { class: "chips" },
        ...group.items.map(it => checklistChip(arrKey, it)))];
      group.items.forEach(it => {
        if (it.detailKey && selected.includes(it.key)) {
          nodes.push(fieldBlock(it.label, textInput(it.detailKey, it.detailPlaceholder)));
        }
      });
      return nodes;
    }));
  });

  const nilChip = el("span", {
    class: "chip" + (a.od_riskNil === "yes" ? " selected" : "")
  }, "Nil — no fall risk factor identified");
  nilChip.addEventListener("click", () => {
    if (a.od_riskNil !== "yes") clearChecklist();
    setSingle("od_riskNil", "yes");
  });

  content.appendChild(formCard("No risk factors",
    el("div", { class: "chips" }, nilChip)
  ));
}

export function renderOdScores(a, content) {
  const quick = { quickFill: true };
  content.appendChild(scoreCard(a, "Modified Barthel Index", "od_mbi", MBI_ITEMS, quick));
  content.appendChild(scoreCard(a, "Chinese Lawton IADL", "od_lawton", LAWTON_ITEMS, quick));
}

export function renderOdPlan(a, content) {
  // "Nil significant fall risk identified" contradicts any real problem, so it
  // clears the others — and their detail fields, which would otherwise be
  // stranded on the record with no chip to reach them.
  const problemChip = (key, label) => {
    const selected = (a.od_problems || []).includes(key);
    const chip = el("span", { class: "chip" + (selected ? " selected" : "") }, label);
    chip.addEventListener("click", () => {
      if (!selected && key === "nil") {
        setField("od_deconditionMbi", "");
        setField("od_problemsOther", "");
      }
      toggleChipExclusive("od_problems", key, "nil");
    });
    return chip;
  };

  content.appendChild(formCard("C. Problem(s)",
    el("div", { class: "chips" },
      ...Object.keys(PROBLEM_LABELS).map(k => problemChip(k, PROBLEM_LABELS[k]))),
    (a.od_problems || []).includes("deconditioning")
      ? fieldBlock("Compared with latest fracture hip DC MBI",
          el("div", { class: "tolerated-row" },
            numInput("od_deconditionMbi", "score", 100),
            el("span", { class: "unit" }, "/ 100"))) : null,
    (a.od_problems || []).includes("other")
      ? fieldBlock("Others", textInput("od_problemsOther", "Specify…")) : null
  ));

  // A reason only belongs to a refusal — drop it when the answer changes.
  const responseChip = (value, label) => {
    const chip = el("span", {
      class: "chip" + (a.od_recommendResponse === value ? " selected" : "")
    }, label);
    chip.addEventListener("click", () => {
      const willBe = a.od_recommendResponse === value ? "" : value;
      if (willBe !== "refused") setField("od_recommendRefusedReason", "");
      setSingle("od_recommendResponse", value);
    });
    return chip;
  };

  content.appendChild(formCard("D. Recommendation",
    chipsFromMap("od_recommend", RECOMMEND_LABELS, true),
    (a.od_recommend || []).includes("suggested")
      ? fieldBlock("Patient response",
          el("div", { class: "chips" },
            ...Object.keys(RESPONSE_LABELS).map(k => responseChip(k, RESPONSE_LABELS[k]))),
          a.od_recommendResponse === "refused"
            ? el("div", { style: "margin-top:6px" },
                textInput("od_recommendRefusedReason", "Reason for refusal…"))
            : null)
      : null
  ));
}

// ── Summary: Ortho Day Rehab ───────────────────────────────────────────────
export function buildOrthoDaySummary(a) {
  // One buffer per part. The part titles live in SUMMARY_PARTS and are rendered as
  // headings, so they are deliberately absent from these buffers.
  const partA = [], partB = [], partC = [], partD = [];
  const push = (target, arr, header) => {
    if (!arr.length) return;
    if (header) target.push(header);
    arr.forEach(l => target.push(l));
    target.push("");
  };

  // ── A. COMMON ASSESSMENT NOTES ──
  const bg = [];
  if (a.od_attendReason) bg.push("Attended today for " + ATTEND_LABELS[a.od_attendReason]);

  const siteParts = pickLabels(a.od_fracSite, FRAC_SITE_LABELS).map(l => {
    if (l === "Others") return a.od_fracSiteOther || "Others";
    if (l === "Spine" && a.od_spineLevel) return "Spine (" + a.od_spineLevel + ")";
    return l;
  });
  if (a.od_fracSide || siteParts.length) {
    bg.push("Fracture site: " +
      [SIDE_LABELS[a.od_fracSide], siteParts.join(", ")].filter(Boolean).join(" "));
  }

  if (a.od_eventType || a.od_eventDate) {
    let s = EVENT_LABELS[a.od_eventType] || "Operation";
    if (a.od_eventDate) s += " (" + fmtEventDate(a.od_eventDate) + ")";
    const period = fmtPeriod(monthsBetween(a.od_eventDate, a.date));
    if (period) s += ": " + period;
    bg.push(s);
  }

  if (a.od_occupation) bg.push("Occupation: " + OCCUPATION_LABELS[a.od_occupation]);

  const premorbid = [];
  if (a.od_premorbidAdl)  premorbid.push("ADL " + ADL_LABELS[a.od_premorbidAdl].toLowerCase());
  if (a.od_premorbidIadl) premorbid.push("IADL " + IADL_LABELS[a.od_premorbidIadl].toLowerCase());
  if (premorbid.length) bg.push("Premorbid function: " + premorbid.join("; "));

  if (a.od_cameAlone === "yes") bg.push("Came alone");
  else if (a.od_cameWith) bg.push("Came with " + a.od_cameWith);

  push(partA, bg);

  // ── SOCIAL HISTORY AND HOME ENVIRONMENT ──
  const soc = [];
  // Living state, daytime supervision and main carer read as one line, as on the
  // paper template: "Lives with daughter; Daytime alone; Main carer: daughter".
  const living = [];
  if (a.od_living) {
    living.push(a.od_living === "with_others"
      ? "Lives with " + (a.od_livesWithDetail || "others")
      : LIVING_LABELS[a.od_living]);
  }
  if (a.od_daytimeAlone === "yes") living.push("Daytime alone");
  if (a.od_mainCarer) living.push("Main carer: " + a.od_mainCarer);
  if (living.length) soc.push(living.join("; "));
  if (a.od_homeLift) {
    let s = "Home environment: " + LIFT_LABELS[a.od_homeLift];
    if (a.od_homeLift === "non_direct" && a.od_homeFos) s += " (" + a.od_homeFos + " FOS)";
    soc.push(s);
  }
  // Each facility carries the handrail state of its own area, so a handrail by the
  // toilet does not imply one by the bath.
  const bathing = Object.keys(BATHING_LABELS)
    .filter(k => (a.od_bathing || []).includes(k))
    .map(k => {
      const railed = BATHING_ZONE[k] === "toilet"
        ? a.od_handrailToilet === "yes"
        : a.od_handrailBathing === "yes";
      return BATHING_LABELS[k] + (railed ? " with handrail" : "");
    });
  if (bathing.length) soc.push("Bathing facility: " + bathing.join(", "));
  const devices = pickLabels(a.od_devices, DEVICE_LABELS);
  if (devices.length) soc.push("Assistive device available: " + devices.join(", "));

  // Fall back to the raw key so an unrecognised value degrades instead of throwing.
  const aidLabel = v => (AID_LABELS[v] || v).toLowerCase();
  const aids = [];
  if (a.od_aidIndoor)  aids.push("indoor " + aidLabel(a.od_aidIndoor));
  if (a.od_aidOutdoor) aids.push("outdoor " + aidLabel(a.od_aidOutdoor));
  if (aids.length) soc.push("Walking aids: " + aids.join("; "));

  const services = pickLabels(a.od_socialService, SOCIAL_SERVICE_LABELS).map(l => {
    if (l === "Home help service") {
      const subs = pickLabels(a.od_homeHelp, HOME_HELP_LABELS);
      return subs.length ? "Home help service (" + subs.join(", ") + ")" : l;
    }
    if (l === "Day care centre" && a.od_dayCareFreq) {
      return "Day care centre (" + a.od_dayCareFreq + ")";
    }
    if (l === "Other") return a.od_socialServiceOther || "Other";
    return l;
  });
  if (services.length) soc.push("Social service: " + services.join(", "));

  push(partA, soc, "SOCIAL HISTORY AND HOME ENVIRONMENT");

  // ── FALL HISTORY ──
  const falls = [];
  if (a.od_fallAny) {
    let s = "Fall / near-fall incident";
    if (a.od_fallSince) s += " " + FALL_SINCE_LABELS[a.od_fallSince];
    s += ": " + (a.od_fallAny === "yes" ? "Yes" : "No");
    if (a.od_fallAny === "yes" && a.od_fallCount) s += " (" + a.od_fallCount + " times)";
    falls.push(s);
  }
  if (a.od_fallAny === "yes") {
    for (let n = 1; n <= 3; n++) {
      const place  = a["od_fall" + n + "_place"];
      const detail = a["od_fall" + n + "_detail"];
      const reasons = pickLabels(a["od_fall" + n + "_reason"], FALL_REASON_LABELS)
        .map(l => l === "Others" ? (a["od_fall" + n + "_reasonOther"] || "Others") : l);
      if (!place && !detail && !reasons.length) continue;
      const bits = [];
      if (place) bits.push(place === "indoor" ? "Indoor" : "Outdoor");
      if (detail) bits.push(bits.length ? "(" + detail + ")" : detail);
      let s = "Episode " + n + ": " + (bits.join(" ") || "—");
      if (reasons.length) s += "; reason: " + reasons.join(", ");
      falls.push(s);
    }
  }
  push(partA, falls, "FALL HISTORY");

  // ── B. PHYSICAL ASSESSMENT NOTES ──
  const phys = [];
  const vitals = [];
  if (a.od_bpSys || a.od_bpDia) vitals.push("BP " + (a.od_bpSys || "—") + "/" + (a.od_bpDia || "—") + " mmHg");
  if (a.od_pulse) vitals.push("pulse " + a.od_pulse + "/min");
  if (a.od_temp)  vitals.push(a.od_temp === "afebrile" ? "afebrile" : "febrile");
  if (vitals.length) phys.push("Vital signs: " + vitals.join("; "));

  // Tick-box fields print every option, as on the paper form — but only once at
  // least one has been answered, so an untouched form emits no empty boxes.
  if ((a.od_sensory || []).length) {
    phys.push(boxes(a.od_sensory, SENSORY_LABELS).join("  "));
  }

  const mental = [];
  const orient = pickLabels(a.od_orient, ORIENT_LABELS);
  // No state means an older record, which only ever recorded the oriented case.
  const orientWord = ORIENT_STATE_LABELS[a.od_orientState] || "Oriented";
  if (orient.length) mental.push(orientWord + " to " + orient.join(", ").toLowerCase());
  else if (a.od_orientState) mental.push(orientWord);
  if (a.od_commandSteps) mental.push("Follows " + a.od_commandSteps + "-step command");
  if (a.od_mood) {
    // Older records held free text here rather than one of the MOOD_LABELS keys.
    const mood = a.od_mood === "other"
      ? (a.od_moodOther || "Other")
      : (MOOD_LABELS[a.od_mood] || a.od_mood);
    mental.push("Mood: " + mood);
  }
  if (a.od_cdtNa === "yes") {
    mental.push("Clock Drawing Test: N/A" +
      (a.od_cdtNaReason ? " (" + a.od_cdtNaReason + ")" : ""));
  } else if (a.od_cdt) {
    mental.push("Clock Drawing Test: " + a.od_cdt + "/10");
  }
  if (mental.length) {
    phys.push("");
    phys.push("Mental:");
    mental.forEach(l => phys.push(l));
  }

  const exam = [];
  const painSites = [];
  if ((a.od_painSite || []).includes("fracture")) painSites.push("fracture site");
  if ((a.od_painSite || []).includes("other") && a.od_painOther) painSites.push(a.od_painOther);
  else if ((a.od_painSite || []).includes("other")) painSites.push("other site");
  if (painSites.length) {
    let s = "Pain: " + painSites.join(", ");
    if (a.od_nprs) s += " (NPRS " + a.od_nprs + "/10)";
    exam.push(s);
  }
  if (a.od_rom) {
    let s = "ROM: " + ROM_LABELS[a.od_rom];
    if (a.od_romDetail) s += (a.od_rom === "contracture" ? " over " : " — ") + a.od_romDetail;
    exam.push(s);
  }
  if (a.od_mmtUlR || a.od_mmtUlL || a.od_mmtLlR || a.od_mmtLlL) {
    exam.push("MMT: Upper limb (R|L) " + (a.od_mmtUlR || "—") + " | " + (a.od_mmtUlL || "—") +
              "; Lower limb (R|L) " + (a.od_mmtLlR || "—") + " | " + (a.od_mmtLlL || "—"));
  }
  if (a.od_balSit)
    exam.push("Sitting balance: " + boxes([a.od_balSit], BALANCE_LABELS).join(" "));
  if (a.od_balStand)
    exam.push("Standing balance: " + boxes([a.od_balStand], BALANCE_LABELS).join(" "));
  if (exam.length) {
    phys.push("");
    phys.push("Physical examination:");
    exam.forEach(l => phys.push(l));
  }

  push(partB, phys);

  // ── FALL RISK ASSESSMENT ──
  const risk = [];
  if (a.od_fearFall) risk.push("Fear of fall: " + (a.od_fearFall === "yes" ? "Yes" : "No"));
  if (a.od_fesNa === "yes") {
    risk.push("Fall Efficacy Scale: N/A" +
      (a.od_fesNaReason ? " (" + a.od_fesNaReason + ")" : ""));
  } else if (a.od_fes) {
    risk.push("Fall Efficacy Scale: " + a.od_fes + "/100");
  }

  const riskLabel = fallRiskLabel(a);
  if (a.od_frat || riskLabel) {
    // Blank line before FRAT, but only when something precedes it.
    if (risk.length) risk.push("");
    risk.push(a.od_frat
      ? "FRAT: " + a.od_frat + "/20" + (riskLabel ? ", Fall Risk Status: " + riskLabel : "")
      : "Fall Risk Status: " + riskLabel);
  }
  // Long labels, so one option per line under a header — as laid out on paper.
  // Follows the FRAT line directly, with no blank line between.
  if ((a.od_autoHigh || []).length) {
    risk.push("Automatic high risk status:");
    boxes(a.od_autoHigh, AUTO_HIGH_LABELS).forEach(l => risk.push(l));
  }

  // Two levels of boxes, as on paper: one per heading plus one per sub-item. A
  // heading is ticked when any of its items is. Single-item groups take no nested
  // box, since the heading box already answers it.
  const anyChecklist = RISK_CHECKLIST.some(g => (a["od_risk_" + g.key] || []).length);
  if (anyChecklist || a.od_riskNil === "yes") {
    risk.push("");
    risk.push("Fall Risk Factor Checklist:");
    RISK_CHECKLIST.forEach(group => {
      const selected = a["od_risk_" + group.key] || [];
      const head = (selected.length ? "[x] " : "[ ] ") + group.label + ": ";
      const label = it => {
        const detail = it.detailKey ? a[it.detailKey] : "";
        return it.label + (detail ? " (" + detail + ")" : "");
      };
      risk.push(head + (group.items.length === 1
        ? label(group.items[0])
        : group.items
            .map(it => (selected.includes(it.key) ? "[x] " : "[ ] ") + label(it))
            .join(" ")));
    });
    risk.push((a.od_riskNil === "yes" ? "[x] " : "[ ] ") + "Nil");
  }

  push(partB, risk, "FALL RISK ASSESSMENT");

  // ── FUNCTIONAL SCORES ──
  const scores = [];
  // Breakdown uses the same visibility filter as the form, so the note can never
  // list a score the form is hiding (e.g. Wheelchair once Mobility is above 0).
  const breakdown = (key, items) => "  " + scoreEntries(a, key, items).join(", ");
  if (hasAnyScore(a, "od_mbi", MBI_ITEMS)) {
    scores.push("Modified Barthel Index: " + scoreTotal(a, "od_mbi", MBI_ITEMS) +
      "/" + scoreMax(MBI_ITEMS));
    scores.push(breakdown("od_mbi", MBI_ITEMS));
  }
  if (hasAnyScore(a, "od_lawton", LAWTON_ITEMS)) {
    scores.push("Chinese Lawton IADL: " + scoreTotal(a, "od_lawton", LAWTON_ITEMS) +
      "/" + scoreMax(LAWTON_ITEMS));
    scores.push(breakdown("od_lawton", LAWTON_ITEMS));
  }
  push(partB, scores, "FUNCTIONAL SCORES");

  // ── C. PROBLEM ──
  const problems = pickLabels(a.od_problems, PROBLEM_LABELS).map(l => {
    if (l === "Others") return "- " + (a.od_problemsOther || "Others");
    if (l === "Deconditioning" && a.od_deconditionMbi) {
      return "- Deconditioning (cf. latest fracture hip DC MBI " + a.od_deconditionMbi + "/100)";
    }
    return "- " + l;
  });
  push(partC, problems);

  // ── D. RECOMMENDATION ──
  const recs = pickLabels(a.od_recommend, RECOMMEND_LABELS).map(l => {
    if (l === RECOMMEND_LABELS.suggested && a.od_recommendResponse) {
      const reason = a.od_recommendResponse === "refused" && a.od_recommendRefusedReason
        ? " — " + a.od_recommendRefusedReason : "";
      return "- " + l + " (" + RESPONSE_LABELS[a.od_recommendResponse] + reason + ")";
    }
    return "- " + l;
  });
  push(partD, recs);

  const t = buf => buf.join("\n").trimEnd();
  return { A: t(partA), B: t(partB), C: t(partC), D: t(partD) };
}

// ══ Schema-driven forms ════════════════════════════════════════════════════
// A schema form is a plain data array of sections, each holding questions that
// describe how they render AND how they read in the note. Adding a form is then
// data, not code. ortho_day predates this and stays hand-written — the two paths
// meet only at the dispatchers in renderForm() and buildSummary().
