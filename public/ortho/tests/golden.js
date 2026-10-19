// A byte-for-byte snapshot of the complete note for both form types, from records
// filled as fully as each form allows. The other harnesses pin the blocks the team
// specified; this one covers everything else, so a refactor that quietly changes any
// line anywhere is caught.
//
//   node tests/golden.js            compare against tests/golden.txt
//   node tests/golden.js --write    regenerate it (review the diff before committing)
const fs = require("fs"), path = require("path");
const { load } = require("./lib/harness");
const SNAP = path.join(__dirname, "golden.txt");

// ── The schema form: walk it and answer every question ──────────────────────
// Deterministic by construction — a multi takes every non-exclusive option, a single
// takes the first, a score is filled to each item's ceiling. showIf still applies, so
// what survives is whatever the engine would really have kept.
function buildSchema(app, formId, skipStatus) {
  const ft = app.FORM_TYPES.find(f => f.id === formId);
  const sections = ft.sections();
  const a = { id: "g", label: "G9/12 LCM", formType: formId, date: "2026-03-04" };
  app.seedSchemaFields(a, sections);

  const answer = q => {
    const opts = app.qOptions(q);
    const excl = app.exclusiveValues(q);
    const pick = opts.filter(o => !excl.includes(o.value));
    switch (q.type) {
      case "text":     return q.id.replace(/^ghf_/, "") + " text";
      case "textarea": return q.id.replace(/^ghf_/, "") + " note";
      case "date":     return "2026-02-01";
      case "number":   return Math.min(2, q.max === undefined ? 2 : q.max);
      case "yesno":    return "yes";
      case "single":   return pick.length ? pick[0].value : "";
      case "multi":    return pick.map(o => o.value);
      // At most two adjacent picks, so take the first pair.
      case "range":    return pick.slice(0, 2).map(o => o.value);
      case "composite": {
        const o = {};
        (q.parts || []).forEach((p, i) => { o[p.id || p.key || i] = String(i + 1); });
        return o;
      }
      case "score": {
        const o = {};
        (q.items || []).forEach(it => {
          o[it.key] = it.scale ? it.scale[it.scale.length - 1] : it.max;
        });
        return o;
      }
      default: return null;
    }
  };

  app.schemaQuestions(sections).forEach(q => {
    if (!app.isAnswerable(q)) return;
    // The gates — a "not tested" escape hatch, or a Pre-op timing choice — hide the
    // instrument behind them, so one pass leaves them blank to reach the scores and
    // one answers them to reach the status wording. Between the two, both sides of
    // every such branch are in the snapshot. A timing question left out of this would
    // quietly take the scores with it and the snapshot would get weaker, not fail.
    if (skipStatus && /Status$|Timing$/.test(q.id)) return;
    const v = answer(q);
    if (v === null) return;
    a[q.id] = v;
    // Chips with a text box or a second level carry their extras under derived keys.
    const sel = Array.isArray(v) ? v : [v];
    app.qOptions(q).filter(o => sel.includes(o.value)).forEach(o => {
      if (o.detail) a[app.detailKey(q, o.value)] = o.value + " detail";
      if (o.sub) a[app.subKey(q, o.value)] = [app.normOption(o.sub[0]).value];
    });
  });

  // Hidden answers are erased on every render, so sweep before reading the note.
  app.clearHiddenSchemaAnswers(a, sections);
  const parts = app.buildSchemaSummary(a, sections, ft.parts());
  return ft.parts().map(p => p.title + "\n" + "=".repeat(p.title.length) +
    "\n" + (parts[p.key] || "(empty)")).join("\n\n");
}

// ── The coded form: an explicit record, since ortho_day has no schema to walk ──
// Option values come from the app's own label maps rather than being copied here, so
// a renamed key shows up as a changed note instead of a silently dead field.
function buildOrthoDay(app) {
  const a = app.blankAssessment("G9/12 LCM", "2026-03-04", "ortho_day");
  a.id = "g"; a.createdAt = a.updatedAt = "2026-03-04T00:00:00.000Z";

  const first = m => Object.keys(m)[0];
  const all   = m => Object.keys(m);

  Object.assign(a, {
    od_attendReason: first(app.ATTEND_LABELS),
    od_fracSide: "left",
    od_fracSite: all(app.FRAC_SITE_LABELS).filter(k => k !== "spine" && k !== "other"),
    od_eventType: first(app.EVENT_LABELS),
    od_eventDate: "2026-01-15",
    od_occupation: first(app.OCCUPATION_LABELS),
    od_premorbidAdl: "independent",
    od_premorbidIadl: first(app.IADL_LABELS),
    od_cameAlone: "no",
    od_cameWith: "daughter",

    od_living: first(app.LIVING_LABELS),
    od_daytimeAlone: "yes",
    od_livesWithDetail: "spouse",
    od_mainCarer: "daughter",
    od_homeLift: "direct",
    od_homeFos: "2",
    od_bathing: all(app.BATHING_LABELS).slice(0, 2),
    od_handrailToilet: "yes",
    od_handrailBathing: "no",
    od_devices: all(app.DEVICE_LABELS).slice(0, 3),
    od_aidIndoor: "stick",
    od_aidOutdoor: "frame",
    od_socialService: all(app.SOCIAL_SERVICE_LABELS).slice(0, 2),
    od_homeHelp: all(app.HOME_HELP_LABELS).slice(0, 2),
    od_dayCareFreq: "3",

    od_fallSince: "year",
    od_fallAny: "yes",
    od_fallCount: "2",
    od_fallEpisodeCount: 2,
    od_fall1_place: "indoor",
    od_fall1_detail: "bathroom, on a wet floor",
    od_fall1_reason: all(app.FALL_REASON_LABELS).slice(0, 2),
    od_fall2_place: "outdoor",
    od_fall2_detail: "street, uneven kerb",
    od_fall2_reason: all(app.FALL_REASON_LABELS).slice(0, 1),

    od_bpSys: "130", od_bpDia: "80", od_pulse: "72", od_temp: "afebrile",
    od_sensory: all(app.SENSORY_LABELS).slice(0, 2),
    od_orientState: "oriented",
    od_orient: all(app.ORIENT_LABELS),
    od_commandSteps: "2",
    od_mood: first(app.MOOD_LABELS),
    od_cdt: "8",
    od_painSite: ["hip"],
    od_nprs: "4",
    od_rom: first(app.ROM_LABELS),
    od_romDetail: "limited hip flexion",
    od_mmtUlR: "5", od_mmtUlL: "5", od_mmtLlR: "4", od_mmtLlL: "4",
    od_balSit: "satisfactory",
    od_balStand: "fair",

    od_fearFall: "yes",
    od_fes: "60",
    od_frat: "12",
    od_autoHigh: all(app.AUTO_HIGH_LABELS).slice(0, 1),

    od_mbi: { bowels:10, bladder:10, grooming:5, toileting:10, feeding:10,
              dressing:10, bathing:5, transfer:15, mobility:15, stairs:10 },
    od_lawton: { phone:3, transport:3, shopping:3, meal:3, housework:3,
                 handyman:3, laundry:3, medication:3, money:3 },

    od_problems: all(app.PROBLEM_LABELS).slice(0, 3),
    od_recommend: all(app.RECOMMEND_LABELS).slice(0, 3),
    od_recommendResponse: "agreed"
  });
  app.RISK_CHECKLIST.forEach(g => {
    a["od_risk_" + g.key] = (g.items || []).slice(0, 1).map(it => it.value || it);
  });

  const parts = app.buildSummary(a);
  return app.SUMMARY_PARTS.map(p => p.title + "\n" + "=".repeat(p.title.length) +
    "\n" + (parts[p.key] || "(empty)")).join("\n\n");
}

const banner = t => "\n\n" + "#".repeat(72) + "\n# " + t + "\n" + "#".repeat(72) + "\n\n";

(async () => {
  const app = await load();
  const got = (
    banner("Geriatric Hip Fracture Initial — instruments scored") +
      buildSchema(app, "ghf_initial", true) +
    banner("Geriatric Hip Fracture Initial — instruments not tested") +
      buildSchema(app, "ghf_initial", false) +
    banner("Ortho Day Rehab FU") + buildOrthoDay(app)).trim() + "\n";

  if (process.argv.includes("--write")) {
    fs.writeFileSync(SNAP, got);
    console.log("  wrote " + path.relative(path.join(__dirname, ".."), SNAP) +
      " (" + got.split("\n").length + " lines)");
    return;
  }
  if (!fs.existsSync(SNAP)) {
    console.log("  FAIL no golden.txt — run: node tests/golden.js --write");
    process.exitCode = 1;
    return;
  }
  const want = fs.readFileSync(SNAP, "utf8");
  if (got === want) {
    console.log("  ok   both notes match golden.txt byte for byte");
    return;
  }
  const g = got.split("\n"), w = want.split("\n");
  const n = Math.max(g.length, w.length);
  const diff = [];
  for (let i = 0; i < n && diff.length < 40; i++) {
    if (g[i] !== w[i]) diff.push("  line " + (i + 1) +
      "\n    want: " + JSON.stringify(w[i]) + "\n    got:  " + JSON.stringify(g[i]));
  }
  console.log("  FAIL the note changed\n" + diff.join("\n"));
  process.exitCode = 1;
})();
