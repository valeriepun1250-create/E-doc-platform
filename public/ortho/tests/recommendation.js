const { load, ok, block, report, textOf, findAll, hasClass, byClass, byTag,
        chipNamed, env } = require("./lib/harness");

(async () => {
const app = await load();
// Pulled into locals so the checks below read as they did when they were
// evaluated inside a vm context, and say what they test rather than where it lives.
const {
        GHF_PARTS, GHF_SECTIONS, State, buildSchemaSummary,
        buildSummary, formatSchemaAnswer, normOption, qOptions,
        render, schemaChips, schemaQuestions, seedSchemaFields
} = app;
const parts = (function (extra) {
  const a = { formType: "ghf_initial" };
  seedSchemaFields(a, GHF_SECTIONS);
  Object.assign(a, extra);
  return buildSchemaSummary(a, GHF_SECTIONS, GHF_PARTS);
});
const E = extra => parts(extra).E || "";
const tap = (qid, value, extra) => (function (qid, value, extra) {
  const a = { id: "t", formType: "ghf_initial" };
  seedSchemaFields(a, GHF_SECTIONS);
  Object.assign(a, extra || {});
  State.assessments = { t: a }; State.currentId = "t";
  const q = schemaQuestions(GHF_SECTIONS).find(x => x.id === qid);
  const w = schemaChips(a, q);
  const walk = n => n.nodeType === 3 ? n.text : (n.kids || []).map(walk).join("");
  const find = n => {
    if (n.nodeType === 1 && (n.className || "").split(" ").includes("chip")
        && walk(n) === value) return n;
    for (const k of n.kids || []) { const h = find(k); if (h) return h; }
    return null;
  };
  const chip = find(w);
  if (chip) chip.handlers.click.forEach(fn => fn());
  return a;
})(qid, value, extra);

console.log("1. All three lists");
{
  const got = E({
    ghf_treatmentDone: ["Cognitive Assessment", "Cognitive/Orientation training",
      "patient_education", "Aids Prescription", "other_done"],
    ghf_treatmentDone__s_patient_education: ["Fall Prevention and Home safety"],
    ghf_treatmentDone__d_other_done: "splint issued",
    ghf_treatmentPlan: ["Continue ADL training"],
    ghf_recommendation: ["Continue Hip Rehabilitation Program", "suggest"],
    ghf_recommendation__s_suggest: ["Direct discharge home"]
  });
  const want = `Treatment:
Cognitive Assessment done, Cognitive/Orientation training done, Patient education on Fall Prevention and Home safety done, Aids Prescription done, splint issued

Treatment plan:
Continue ADL training

Recommendation:
Continue Hip Rehabilitation Program, Suggest Direct discharge home`;
  console.log(got);
  ok("matches exactly", got === want, JSON.stringify(got));
}

console.log("\n2. Declared order, not tap order");
const after = (text, caption) => {
  const L = text.split("\n");
  const i = L.indexOf(caption);
  return i < 0 ? "" : L[i + 1];
};
ok("treatment reorders", after(E({ ghf_treatmentDone:
   ["Home visit", "Aids Prescription", "Cognitive Assessment"] }), "Treatment:") ===
   "Cognitive Assessment done, Aids Prescription done, Home visit done",
   E({ ghf_treatmentDone: ["Home visit", "Aids Prescription", "Cognitive Assessment"] }));
ok("recommendation reorders", after(E({ ghf_recommendation:
   ["suggest", "Continue Hip Rehabilitation Program"] }), "Recommendation:") ===
   "Continue Hip Rehabilitation Program, Suggest");

console.log("\n3-4. Patient education");
{
  const pe = subs => after(E({ ghf_treatmentDone: ["patient_education"],
    ghf_treatmentDone__s_patient_education: subs }), "Treatment:");
  ok("one sub-chip, with \"on\" and \"done\"", pe(["Fall Prevention and Home safety"]) ===
     "Patient education on Fall Prevention and Home safety done",
     pe(["Fall Prevention and Home safety"]));
  ok("both, slash-joined, done after them",
     pe(["Fall Prevention and Home safety", "Hip precaution recommendation"]) ===
     "Patient education on Fall Prevention and Home safety/Hip precaution recommendation done",
     pe(["Fall Prevention and Home safety", "Hip precaution recommendation"]));
  ok("none picked → bare label plus done", pe([]) === "Patient education done", pe([]));
}

console.log("\n5. Suggest");
{
  const sg = subs => after(E({ ghf_recommendation: ["suggest"],
    ghf_recommendation__s_suggest: subs }), "Recommendation:");
  ok("one destination", sg(["Direct discharge home"]) === "Suggest Direct discharge home",
     sg(["Direct discharge home"]));
  ok("two, slash-joined", sg(["Direct discharge home", "Direct discharge OAH"]) ===
     "Suggest Direct discharge home/Direct discharge OAH",
     sg(["Direct discharge home", "Direct discharge OAH"]));
  ok("the convalescent option is there",
     sg(["Convalescent Hospital (KH/BH)"]) === "Suggest Convalescent Hospital (KH/BH)",
     sg(["Convalescent Hospital (KH/BH)"]));
  ok("none picked → bare label", sg([]) === "Suggest");
}

console.log("\n6. Others");
{
  ok("prints its text alone", after(E({ ghf_treatmentPlan: ["other_plan"],
     ghf_treatmentPlan__d_other_plan: "weekly review" }), "Treatment plan:") ===
     "weekly review");
  ok("bare label when empty", after(E({ ghf_treatmentPlan: ["other_plan"] }),
     "Treatment plan:") === "Others");
  const un = tap("ghf_treatmentPlan", "Others",
    { ghf_treatmentPlan: ["other_plan"], ghf_treatmentPlan__d_other_plan: "weekly review" });
  ok("unpicking clears the chip and its text",
     JSON.stringify(un.ghf_treatmentPlan) === "[]" && !un.ghf_treatmentPlan__d_other_plan,
     JSON.stringify([un.ghf_treatmentPlan, un.ghf_treatmentPlan__d_other_plan]));
  // Recommendation used to be the one list without a free-text chip, and this check
  // said so. The team asked for one, so it now pins the same behaviour as the other
  // two rather than the absence.
  ok("Recommendation prints its typed text alone",
     after(E({ ghf_recommendation: ["other_rec"],
       ghf_recommendation__d_other_rec: "Refer to community OT" }), "Recommendation:") ===
     "Refer to community OT");
  ok("bare label when empty", after(E({ ghf_recommendation: ["other_rec"] }),
     "Recommendation:") === "Others");
  ok("and it sorts last, however it was tapped",
     after(E({ ghf_recommendation: ["other_rec", "Continue Hip Rehabilitation Program"],
       ghf_recommendation__d_other_rec: "Refer to community OT" }), "Recommendation:") ===
     "Continue Hip Rehabilitation Program, Refer to community OT");
  const unRec = tap("ghf_recommendation", "Others",
    { ghf_recommendation: ["other_rec"], ghf_recommendation__d_other_rec: "Refer to community OT" });
  ok("unpicking clears the chip and its text",
     JSON.stringify(unRec.ghf_recommendation) === "[]" && !unRec.ghf_recommendation__d_other_rec,
     JSON.stringify([unRec.ghf_recommendation, unRec.ghf_recommendation__d_other_rec]));
}

console.log("\n7. Unanswered lists");
ok("only the answered caption prints",
   E({ ghf_treatmentPlan: ["Maintenance training"] }) ===
   "Treatment plan:\nMaintenance training",
   JSON.stringify(E({ ghf_treatmentPlan: ["Maintenance training"] })));
ok("none answered → part E empty", E({}) === "", JSON.stringify(E({})));

console.log("\n8. The retired options are unreachable");
{
  const stale = parts({
    ghf_treatmentDone: ["Pre-op assessment done", "Post-op assessment done",
      "ADL assessment done", "Cognitive assessment done",
      "Fall prevention education provided"],
    ghf_treatmentPlan: ["Further assessment if stable", "Basic ADL training",
      "Basic ADL maintenance", "Cognitive / orientation training", "aids"],
    ghf_treatmentPlan__d_aids: "frame",
    ghf_recommendation: ["Functionally fit for home", "home_carer",
      "Convalescent rehabilitation", "otopd", "Community OT service (COT)",
      "Social service arrangement: POAH / HHS / DCC", "For medical stabilisation"],
    ghf_recommendation__d_otopd: "ADL"
  });
  ["Pre-op assessment done", "Basic ADL training", "Functionally fit for home",
   "Social service arrangement", "Community OT service", "For medical stabilisation",
   "Convalescent rehabilitation", "frame", "ADL"].forEach(t =>
    ok("no \"" + t + "\"", !(stale.E || "").includes(t), JSON.stringify(stale.E)));
  ok("part E is empty, not raw strings", stale.E === "", JSON.stringify(stale.E));
}

console.log("\n9. subJoin is used only where it is needed");
{
  const withJoin = (function () {
    const out = [];
    schemaQuestions(GHF_SECTIONS).forEach(q =>
      (q.options || []).map(normOption).forEach(o => {
        if (o.subJoin) out.push(q.id + "." + o.value);
      }));
    return out.join();
  })();
  ok("exactly the two options",
     withJoin === "ghf_treatmentDone.patient_education,ghf_recommendation.suggest",
     withJoin);
  // Every other sub-chip list still joins with ", ".
  ok("Social History wheelchair still comma-joins", (function () {
    const a = { formType: "ghf_initial" }; seedSchemaFields(a, GHF_SECTIONS);
    const q = schemaQuestions(GHF_SECTIONS).find(x =>
      (x.options || []).map(normOption).some(o => (o.sub || []).length && !o.subJoin));
    return !!q;
  })());
}

console.log("\n10. The suffix lands only where it belongs");
{
  const treat = v => after(E({ ghf_treatmentDone: [v] }), "Treatment:");
  ["Cognitive Assessment", "Cognitive/Orientation training", "ADL Assessment and Training",
   "IADL Assessment and Training", "Limb function maintenance/positioning",
   "Pressure injury prevention", "Tailor-made pressure stockings",
   "Carer interview/education/training", "Home Assessment and Modification",
   "Aids Prescription", "Home visit"].forEach(v =>
    ok("\"" + v + " done\"", treat(v) === v + " done", treat(v)));

  ok("Others prints its text alone, no done", after(E({ ghf_treatmentDone: ["other_done"],
     ghf_treatmentDone__d_other_done: "splint issued" }), "Treatment:") ===
     "splint issued");
  ok("and bare Others too", after(E({ ghf_treatmentDone: ["other_done"] }), "Treatment:")
     === "Others");

  ok("Treatment plan takes no suffix",
     after(E({ ghf_treatmentPlan: ["Continue ADL training", "Maintenance training"] }),
       "Treatment plan:") === "Continue ADL training, Maintenance training",
     after(E({ ghf_treatmentPlan: ["Continue ADL training"] }), "Treatment plan:"));
  ok("nor its Others", after(E({ ghf_treatmentPlan: ["other_plan"],
     ghf_treatmentPlan__d_other_plan: "weekly review" }), "Treatment plan:") ===
     "weekly review");
  ok("Recommendation takes no suffix",
     after(E({ ghf_recommendation: ["Continue Hip Rehabilitation Program"] }),
       "Recommendation:") === "Continue Hip Rehabilitation Program");
}

console.log("\n11. One blank line between the lists, in every combination");
{
  const t = { ghf_treatmentDone: ["Home visit"] };
  const p = { ghf_treatmentPlan: ["Maintenance training"] };
  const r = { ghf_recommendation: ["Continue Hip Rehabilitation Program"] };
  const gap = (text, caption) => {
    const L = text.split("\n");
    const i = L.indexOf(caption);
    return i < 0 ? null : (i === 0 ? "start" : L[i - 1] === "" && L[i - 2] !== "");
  };
  ok("all three", (() => { const x = E(Object.assign({}, t, p, r));
    return gap(x, "Treatment:") === "start" && gap(x, "Treatment plan:") === true &&
           gap(x, "Recommendation:") === true; })(), E(Object.assign({}, t, p, r)));
  ok("treatment + recommendation", (() => { const x = E(Object.assign({}, t, r));
    return gap(x, "Treatment:") === "start" && gap(x, "Recommendation:") === true; })(),
    JSON.stringify(E(Object.assign({}, t, r))));
  ok("plan + recommendation", (() => { const x = E(Object.assign({}, p, r));
    return gap(x, "Treatment plan:") === "start" && gap(x, "Recommendation:") === true; })(),
    JSON.stringify(E(Object.assign({}, p, r))));
  ok("recommendation alone opens with no blank",
     E(r) === "Recommendation:\nContinue Hip Rehabilitation Program", JSON.stringify(E(r)));
  ok("plan alone opens with no blank",
     E(p) === "Treatment plan:\nMaintenance training", JSON.stringify(E(p)));
  ok("no double blank anywhere", !/\n\n\n/.test(E(Object.assign({}, t, p, r))));
}

console.log("\n12. itemSuffix is declared only where intended");
{
  const decl = (function () {
    const out = [];
    [GHF_SECTIONS].forEach(secs => schemaQuestions(secs).forEach(q => {
      if (q.itemSuffix !== undefined) out.push(q.id);
      (q.options || []).map(normOption).forEach(o => {
        if (o.itemSuffix !== undefined) out.push(q.id + "." + o.value);
      });
    }));
    return out.join();
  })();
  ok("exactly the question and its Others",
     decl === "ghf_treatmentDone,ghf_treatmentDone.other_done", decl);
  // Ortho Day Rehab drives its own summary, but shares formatSchemaAnswer's engine.
  const od = (function () {
    const a = { formType: "ortho_day", od_problems: ["deconditioning"] };
    return Object.values(buildSummary(a)).join("\n");
  })();
  ok("Ortho Day Rehab picks up no suffix", !/ done/.test(od), od.slice(0, 160));
}

console.log("\n13. Pre-operation assessment");
{
  ok("prints with done", after(E({ ghf_treatmentDone: ["Pre-operation assessment"] }),
     "Treatment:") === "Pre-operation assessment done");
  ok("leads the line even when tapped last",
     after(E({ ghf_treatmentDone: ["Home visit", "Pre-operation assessment"] }),
       "Treatment:") === "Pre-operation assessment done, Home visit done",
     after(E({ ghf_treatmentDone: ["Home visit", "Pre-operation assessment"] }), "Treatment:"));
}

console.log("\n14. No list anywhere can print \"Other:\" again");
{
  const offenders = (function () {
    const out = [];
    const scan = (secs, tag) => schemaQuestions(secs).forEach(q =>
      (q.options || []).map(normOption).forEach(o => {
        if (o.detail && !o.detailOnly && /^Others?$/.test(o.label)) {
          out.push(tag + "." + q.id + "." + o.value);
        }
      }));
    scan(GHF_SECTIONS, "ghf");
    return out.join();
  })();
  ok("no Other chip keeps its label", offenders === "", offenders);

  // Nothing in any produced note either, from a record that fills every one of them.
  const filled = {};
  (function () {
    const out = {};
    schemaQuestions(GHF_SECTIONS).forEach(q =>
      (q.options || []).map(normOption).forEach(o => {
        if (o.detail && /^Others?$/.test(o.label)) {
          out[q.id] = (out[q.id] || []).concat([o.value]);
          out[q.id + "__d_" + o.value] = "typed text here";
        }
      }));
    return JSON.stringify(out);
  })().length && Object.assign(filled, JSON.parse((function () {
    const out = {};
    schemaQuestions(GHF_SECTIONS).forEach(q =>
      (q.options || []).map(normOption).forEach(o => {
        if (o.detail && /^Others?$/.test(o.label)) {
          out[q.id] = (out[q.id] || []).concat([o.value]);
          out[q.id + "__d_" + o.value] = "typed text here";
        }
      }));
    return JSON.stringify(out);
  })()));
  const all = Object.values(parts(filled)).join("\n");
  ok("and none appears in the note", !/Others?: /.test(all),
     (all.split("\n").find(l => /Others?: /.test(l)) || ""));
  ok("the typed text does appear", all.includes("typed text here"));
}

console.log("\n15. The Social History pair");
{
  const soc = extra => {
    const A = parts(extra).A.split("\n");
    return A.find(l => /typed text here|Meal on wheels|Old Age Allowance/.test(l)) || "";
  };
  // The two lists are ghf_socialService and ghf_financial.
  const svc = { ghf_socialService: ["home_help", "other"],
    ghf_socialService__s_home_help: ["Bathing"],
    ghf_socialService__d_other: "typed text here" };
  ok("social service prints the text alone, keeping its other picks",
     soc(svc) === "Social service: Home help service (Bathing), typed text here", soc(svc));
  const fin = { ghf_financial: ["oaa", "other"], ghf_financial__d_other: "typed text here" };
  ok("financial does too",
     soc(fin) === "Financial: Old Age Allowance, typed text here", soc(fin));
  ok("falls back to the bare label", (function () {
    const q = schemaQuestions(GHF_SECTIONS).find(x =>
      (x.options || []).map(normOption).some(o => o.value === "other" && o.detailOnly));
    const a = { formType: "ghf_initial" }; seedSchemaFields(a, GHF_SECTIONS);
    a[q.id] = ["other"];
    return formatSchemaAnswer(a, q) === "Other";
  })());
}

console.log("\n16. The block opens with Treatment, and survives being pasted");
{
  // "Treatment:" is a bare word and a colon, which is the shape of a URI scheme. Apps
  // pasted into read it as a link: they lowercased the scheme and percent-encoded the
  // rest, so the note arrived as "treatment:%0ACognitive%20…". The part was headed
  // "<Recommendation>" for a while to break that shape, but the cure belongs in
  // copyButton — the clipboard now carries an HTML flavour beside the plain text, on
  // every path, and form-ui.js pins that. So the team's own wording is back.
  const raw = parts({ ghf_treatmentDone: ["Home visit"],
                      ghf_recommendation: ["Continue Hip Rehabilitation Program"] }).E;
  ok("the block opens with the team's own first line",
     raw.startsWith("Treatment:\n"), JSON.stringify(raw.slice(0, 24)));
  ok("and carries no header of its own",
     !GHF_PARTS.find(p => p.key === "E").header);

  // Part A's header is a title the team asked for in its own right, not a guard against
  // any of this, so it stays whatever the clipboard does.
  ok("while part A keeps the title it was given",
     GHF_PARTS.find(p => p.key === "A").header === "<Initial Assessment Note>");

  // An untouched record must still produce nothing.
  ok("an empty part stays empty", !parts({}).E, JSON.stringify(parts({}).E));
}

report();
})();
