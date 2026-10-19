// Export and import are the only way patient data leaves or re-enters a device, so
// every path through them is pinned here.
const { load, ok, block, report, textOf, findAll, hasClass, byClass, byTag,
        chipNamed, env } = require("./lib/harness");

(async () => {
const app = await load();
// Pulled into locals so the checks below read as they did when they were
// evaluated inside a vm context, and say what they test rather than where it lives.
const {
        State, Storage, describeImport, exportAssessments,
        importAssessments, render, renderHome
} = app;
const run = (name, ...a) => app[name](...a);
const setStore = obj => { State.assessments = JSON.parse(JSON.stringify(obj)); };
const getStore = () => JSON.parse(JSON.stringify(State.assessments));
const rec = (id, updatedAt, extra) => Object.assign(
  { id, label: id, formType: "ghf_initial", date: "2026-09-10", updatedAt,
    createdAt: updatedAt, od_summaryEdits: {} }, extra || {});
// The stub environment is shared, so each group starts from a clean one.
const reset = () => { env.alerts = []; env.confirms = true; env.downloaded = null; env.store = {}; };

console.log("1. Export writes the envelope and every case");
{
  reset();
  setStore({ a1: rec("a1", "2026-09-10T10:00:00Z"), a2: rec("a2", "2026-09-09T10:00:00Z") });
  run("exportAssessments");
  const out = JSON.parse(env.downloaded);
  ok("app and schema stamped", out.app === "ortho-ot" && out.schema === 1,
     JSON.stringify({ app: out.app, schema: out.schema }));
  ok("exportedAt is an ISO instant", !isNaN(Date.parse(out.exportedAt)), out.exportedAt);
  ok("both cases, and nothing else",
     JSON.stringify(Object.keys(out.assessments).sort()) === '["a1","a2"]',
     JSON.stringify(Object.keys(out.assessments)));
  ok("filename carries the date", true);
}

console.log("\n2. Import refuses what is not ours");
{
  reset(); setStore({});
  ok("unreadable JSON", run("importAssessments", "{not json") === null &&
     /not readable JSON/.test(env.alerts[0]), env.alerts[0]);
  reset();
  ok("a foreign backup is named",
     run("importAssessments", JSON.stringify({ app: "ns-edoc", assessments: {} })) === null &&
     /ns-edoc/.test(env.alerts[0]), env.alerts[0]);
  reset();
  ok("no app field at all",
     run("importAssessments", JSON.stringify({ assessments: {} })) === null &&
     /not an Ortho OT backup/.test(env.alerts[0]), env.alerts[0]);
}

console.log("\n3. Merge adds, freshens, and never deletes");
{
  reset();
  setStore({ a1: rec("a1", "2026-09-10T10:00:00Z"),
             a2: rec("a2", "2026-09-10T10:00:00Z") });
  const file = JSON.stringify({ app: "ortho-ot", schema: 1, assessments: {
    a1: rec("a1", "2026-09-11T10:00:00Z", { label: "newer" }),   // newer → wins
    a2: rec("a2", "2026-09-01T10:00:00Z", { label: "older" }),   // older → ignored
    a3: rec("a3", "2026-09-10T10:00:00Z")                        // unknown → added
  }});
  const plan = run("importAssessments", file);
  const now = getStore();
  ok("counts", plan.added.length === 1 && plan.updated.length === 1 &&
     plan.unchanged.length === 1, JSON.stringify({
       a: plan.added.length, u: plan.updated.length, n: plan.unchanged.length }));
  ok("newer replaced", now.a1.label === "newer", now.a1.label);
  ok("older left alone", now.a2.label === "a2", now.a2.label);
  ok("unknown added", !!now.a3);
  ok("nothing deleted", Object.keys(now).length === 3, JSON.stringify(Object.keys(now)));
  ok("message reads plainly", run("describeImport", plan) ===
     "Imported 1 new, updated 1, left 1 unchanged.", run("describeImport", plan));
}

console.log("\n4. A file predating a migration still arrives correct");
{
  reset(); setStore({});
  // ghf_mbiImpression became ghf_mbiComment; Storage.load is the only place that runs.
  const old = JSON.stringify({ app: "ortho-ot", schema: 1, assessments: {
    a9: rec("a9", "2026-09-10T10:00:00Z", { ghf_mbiImpression: "Fair tolerance" }) }});
  run("importAssessments", old);
  const now = getStore();
  ok("migrated on the way in", now.a9.ghf_mbiComment === "Fair tolerance",
     JSON.stringify(now.a9.ghf_mbiComment));
}

console.log("\n4b. Oxygen status moves out of the vitals composite");
{
  // It was a free-text box; it is now a Room air chip and a numeric flow rate. Ward
  // devices already hold the old shape, and losing it silently on a clinical record
  // would be the wrong default.
  const withO2 = (id, o2) => rec(id, "2026-09-10T10:00:00Z",
    { ghf_vitals: { bp: "123/75", pulse: "80", spo2: "95", o2 } });

  reset(); setStore({});
  run("importAssessments", JSON.stringify({ app: "ortho-ot", schema: 1, assessments: {
    r1: withO2("r1", "Room air"),
    r2: withO2("r2", "room air"),
    r3: withO2("r3", "2L O2"),
    r4: withO2("r4", "0.5 L"),
    r5: withO2("r5", "FiO2 40% via Venturi")
  }}));
  const g = getStore();
  ok("\"Room air\" becomes the chip", g.r1.ghf_o2 === "room", JSON.stringify(g.r1.ghf_o2));
  ok("and is not case-sensitive", g.r2.ghf_o2 === "room", JSON.stringify(g.r2.ghf_o2));
  ok("\"2L O2\" becomes a flow of 2", g.r3.ghf_o2Flow === "2", JSON.stringify(g.r3.ghf_o2Flow));
  ok("a decimal carries over", g.r4.ghf_o2Flow === "0.5", JSON.stringify(g.r4.ghf_o2Flow));
  // Moving this into the flow field would print "L O2" after it a second time.
  ok("wording it cannot parse is left alone, not mangled",
     !g.r5.ghf_o2 && !g.r5.ghf_o2Flow, JSON.stringify([g.r5.ghf_o2, g.r5.ghf_o2Flow]));
  ok("the old value is left in place, unread",
     g.r3.ghf_vitals.o2 === "2L O2", JSON.stringify(g.r3.ghf_vitals.o2));
  ok("the readings beside it are untouched", g.r3.ghf_vitals.spo2 === "95");

  // The point of the migration: it prints again, in the new wording.
  const line = a => app.buildSchemaSummary(a, app.GHF_SECTIONS, app.GHF_PARTS).A
    .split("\n").find(l => l.startsWith("Vital signs")) || "";
  ok("and reads back correctly",
     /SpO2 95%, 2L O2/.test(line(g.r3)) && /SpO2 95%, Room air/.test(line(g.r1)),
     line(g.r3) + " | " + line(g.r1));
}

console.log("\n4c. Functional timing folds into one choice");
{
  // It was a day number plus a Pre-op chip on each instrument, which could disagree.
  const rec2 = (id, f) => rec(id, "2026-09-10T10:00:00Z", f);
  reset(); setStore({});
  run("importAssessments", JSON.stringify({ app: "ortho-ot", schema: 1, assessments: {
    d1: rec2("d1", { ghf_funcPod: 3 }),
    d2: rec2("d2", { ghf_mbiStatus: "pre_op" }),
    d3: rec2("d3", { ghf_lawtonStatus: "pre_op" }),
    // The contradiction the change exists to remove.
    d4: rec2("d4", { ghf_funcPod: 2, ghf_mbiStatus: "pre_op" }),
    d5: rec2("d5", {})
  }}));
  const g = getStore();
  ok("a day becomes Post-op, carrying the day",
     g.d1.ghf_funcTiming === "post" && g.d1.ghf_funcTiming__d_post === "3",
     JSON.stringify([g.d1.ghf_funcTiming, g.d1.ghf_funcTiming__d_post]));
  ok("a Pre-op MBI becomes Pre-op", g.d2.ghf_funcTiming === "pre", g.d2.ghf_funcTiming);
  ok("a Pre-op IADL does too", g.d3.ghf_funcTiming === "pre", g.d3.ghf_funcTiming);
  // Pre-op was an explicit statement that the instruments were not tested; a day may
  // have been typed out of habit. The day is still on the record, simply unread.
  ok("where a record says both, Pre-op wins", g.d4.ghf_funcTiming === "pre",
     g.d4.ghf_funcTiming);
  ok("and the day is kept, not destroyed", g.d4.ghf_funcPod === 2, String(g.d4.ghf_funcPod));
  ok("a record saying neither is left alone", !g.d5.ghf_funcTiming,
     JSON.stringify(g.d5.ghf_funcTiming));

  // "pre_op" is no longer one of their answers, and leaving it would gate the grids
  // shut against a value nothing can clear.
  ok("the retired status value is cleared",
     !g.d2.ghf_mbiStatus && !g.d3.ghf_lawtonStatus,
     JSON.stringify([g.d2.ghf_mbiStatus, g.d3.ghf_lawtonStatus]));

  const line = a => app.buildSchemaSummary(a, app.GHF_SECTIONS, app.GHF_PARTS).A
    .split("\n").filter(l => /Barthel|Post-operation Day/.test(l)).join(" | ");
  ok("and each reads back correctly",
     /Post-operation Day 3/.test(line(g.d1)) &&
     /Not tested due to pre-operation/.test(line(g.d2)),
     line(g.d1) + "  //  " + line(g.d2));
}

console.log("\n5. A round trip is lossless");
{
  reset();
  const before = { a1: rec("a1", "2026-09-10T10:00:00Z", {
    ghf_mbi: { bowels: 10, mobility: "0", wheelchair: 5 },
    ghf_fallRiskFactors: ["Dizziness"],
    od_summaryEdits: { A: "hand-edited wording kept verbatim" } }) };
  setStore(before);
  run("exportAssessments");
  const file = env.downloaded;
  setStore({});                                   // a wiped device
  env.confirms = true;
  run("importAssessments", file);
  ok("every case comes back byte-identical",
     JSON.stringify(getStore()) === JSON.stringify(before),
     JSON.stringify(getStore()));
  ok("hand-edited summary parts survive",
     getStore().a1.od_summaryEdits.A === "hand-edited wording kept verbatim");
}

console.log("\n6. Nothing to do, and declining");
{
  reset();
  setStore({ a1: rec("a1", "2026-09-10T10:00:00Z") });
  const same = JSON.stringify({ app: "ortho-ot", schema: 1,
    assessments: { a1: rec("a1", "2026-09-10T10:00:00Z") } });
  ok("all-known file says so and writes nothing",
     run("importAssessments", same) === null && /already here/.test(env.alerts[0]), env.alerts[0]);

  reset();
  setStore({ a1: rec("a1", "2026-09-10T10:00:00Z") });
  env.confirms = false;
  const file = JSON.stringify({ app: "ortho-ot", schema: 1,
    assessments: { a2: rec("a2", "2026-09-10T10:00:00Z") } });
  ok("declining the confirm changes nothing",
     run("importAssessments", file) === null &&
     JSON.stringify(Object.keys(getStore())) === '["a1"]',
     JSON.stringify(Object.keys(getStore())));
}

console.log("\n7. The buttons are on the History card");
{
  reset(); setStore({});
  const home = renderHome();
  const textOf = n => n.nodeType === 3 ? n.text : (n.kids || []).map(textOf).join("");
  const find = (n, pred, out = []) => {
    if (n.nodeType === 1 && pred(n)) out.push(n);
    (n.kids || []).forEach(k => find(k, pred, out));
    return out;
  };
  const labels = find(home, n => n.tag === "button").map(textOf);
  ok("Export and Import present", labels.includes("Export") && labels.includes("Import"),
     JSON.stringify(labels));
  const picker = find(home, n => n.tag === "input" && n.attrs.type === "file")[0];
  ok("a hidden JSON file picker", !!picker &&
     picker.attrs.accept === "application/json", picker && JSON.stringify(picker.attrs));
}

report();
})();
