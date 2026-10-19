const { load, ok, block, report, textOf, findAll, hasClass, byClass, byTag,
        chipNamed, env, appSource } = require("./lib/harness");

(async () => {
const app = await load();
// Pulled into locals so the checks below read as they did when they were
// evaluated inside a vm context, and say what they test rather than where it lives.
const {
        FORM_TYPES, State, fmtDate, fmtDateLong,
        render, renderHome, today
} = app;
const textOf = n => n.nodeType === 3 ? n.text
  : typeof n.textContent === "string" ? n.textContent
  : (n.kids || []).map(textOf).join("");
const findAll = (n, pred, out = []) => {
  if (n.nodeType === 1 && pred(n)) out.push(n);
  (n.kids || []).forEach(k => findAll(k, pred, out));
  return out;
};
const byClass = (n, c) => findAll(n, x => (x.className || "").split(" ").includes(c));
const byTag = (n, t) => findAll(n, x => x.tag === t);
const home = seed => {
  // Seeded through a round trip, so a test cannot hand the app a live reference to
  // its own fixture and then assert on what the app did to it.
  State.assessments = JSON.parse(JSON.stringify(seed || {}));
  State.currentId = null;
  State.view = "home";
  return renderHome();
};

console.log("1. Three cards, in order");
{
  const h = home();
  const cards = byClass(h, "home-card");
  ok("three of them", cards.length === 3, String(cards.length));
  ok("eyebrow and title", textOf(byClass(h, "home-eyebrow")[0]) === "Queen Elizabeth Hospital" &&
     textOf(byClass(h, "home-title")[0]) === "Ortho OT Assessment");
  const titles = byClass(h, "home-card-title").map(textOf);
  ok("Create New Case, then History",
     JSON.stringify(titles) === '["Create New Case","History"]', JSON.stringify(titles));
  ok("Edoc hub link remains available", /Main Home/.test(textOf(h)));
}

console.log("2. The form dropdown");
{
  const sel = byTag(home(), "select")[0];
  const opts = sel.kids.map(o => ({ v: o.attrs.value, t: textOf(o) }));
  const want = [{ v: "", t: "Select assessment form" }].concat(
    FORM_TYPES.map(ft =>
      ({ v: ft.id, t: "[" + ft.category + "] " + ft.name })));
  ok("placeholder plus one per form type, in declared order",
     JSON.stringify(opts) === JSON.stringify(want), JSON.stringify(opts));
  ok("both are tagged Ortho", want.slice(1).every(o => o.t.startsWith("[Ortho] ")));
}

console.log("3. Create");
{
  const h = home();
  const btn = findAll(h, n => n.tag === "button" && textOf(n) === "Create")[0];
  // The caption asks for three things, so the example has to show three.
  ok("the ward example shows bed and initials",
     findAll(h, n => n.tag === "input" && n.attrs.type === "text")[0]
       .attrs.placeholder === "e.g. G9/12 LCM",
     findAll(h, n => n.tag === "input" && n.attrs.type === "text")[0].attrs.placeholder);
  ok("dimmed before a form is chosen", btn.classList.contains("btn-disabled"));
  btn.handlers.click.forEach(fn => fn());
  ok("clicking it creates nothing",
     Object.keys(State.assessments).length === 0);

  const sel = byTag(h, "select")[0];
  const ward = findAll(h, n => n.tag === "input" && n.attrs.type === "text")[0];
  const date = findAll(h, n => n.tag === "input" && n.attrs.type === "date")[0];
  sel.value = "ghf_initial";
  sel.handlers.change.forEach(fn => fn());
  ok("no longer dimmed", !btn.classList.contains("btn-disabled"));
  ward.value = "E8/12";
  date.value = "2026-09-10";
  btn.handlers.click.forEach(fn => fn());
  const made = Object.values(State.assessments);
  ok("one case, with what was entered", made.length === 1 &&
     made[0].label === "E8/12" && made[0].date === "2026-09-10" &&
     made[0].formType === "ghf_initial", JSON.stringify(made[0] && {
       label: made[0].label, date: made[0].date, formType: made[0].formType }));
  ok("and it opens the form", State.view === "form");
}

console.log("4. The Today link");
{
  const h = home();
  const date = findAll(h, n => n.tag === "input" && n.attrs.type === "date")[0];
  const link = findAll(h, n => n.tag === "button" && textOf(n) === "Today")[0];
  ok("date starts at today", date.value === today());
  date.value = "2020-01-01";
  link.handlers.click.forEach(fn => fn());
  ok("and the link puts it back", date.value === today(), date.value);
}

console.log("5-6. History rows");
{
  const seed = {
    a1: { id: "a1", label: "E8/12", date: "2026-09-10", formType: "ghf_initial",
          updatedAt: "2026-09-10T00:00:00Z" },
    a2: { id: "a2", label: "C3/07", date: "2026-08-29", formType: "ortho_day",
          updatedAt: "2026-08-29T00:00:00Z" },
    gone: { id: "gone", label: "old", date: "2026-09-11", formType: "retired_form",
            updatedAt: "2026-09-11T00:00:00Z" }
  };
  const h = home(seed);
  const rows = byClass(h, "history-row");
  ok("two rows — the retired form type is filtered out", rows.length === 2,
     String(rows.length));
  ok("newest first", textOf(byClass(rows[0], "history-label")[0]) === "E8/12");
  ok("category pill", byClass(rows[0], "history-cat").map(textOf).join() === "Ortho");
  ok("long date", textOf(byClass(rows[0], "history-date")[0]) === "10 Sept 2026",
     textOf(byClass(rows[0], "history-date")[0]));
  ok("form name pill", textOf(byClass(rows[0], "history-form")[0]) ===
     "Geriatric Hip Fracture Initial");
  ok("no progress bar or stale warning",
     !byClass(h, "progress-bar").length && !byClass(h, "warn-banner").length);

  findAll(rows[1], n => n.tag === "button" && textOf(n) === "Open")[0]
    .handlers.click.forEach(fn => fn());
  ok("Open switches to that case", State.view === "form" &&
     State.currentId === "a2");

  const h2 = home(seed);
  findAll(byClass(h2, "history-row")[0], n => n.tag === "button" && textOf(n) === "Delete")[0]
    .handlers.click.forEach(fn => fn());
  ok("Delete removes it", !State.assessments.a1 &&
     !!State.assessments.a2);

  ok("empty store shows one muted line",
     textOf(byClass(home(), "history-empty")[0]) === "No cases yet — create one above.");
}

console.log("7. Dates");
{
  const f = fmtDateLong, g = fmtDate;
  ok('fmtDateLong → "10 Sept 2026"', f("2026-09-10") === "10 Sept 2026", f("2026-09-10"));
  ok('fmtDate unchanged → "10/9/2026"', g("2026-09-10") === "10/9/2026", g("2026-09-10"));
  ok("every month renders", [1,2,3,4,5,6,7,8,9,10,11,12].every(m =>
     /^1 \w+ 2026$/.test(f("2026-" + String(m).padStart(2, "0") + "-01"))),
     [1,6,9,12].map(m => f("2026-" + String(m).padStart(2, "0") + "-01")).join(" | "));
  ok("blank stays blank", f("") === "" && g("") === "");
}

console.log("8. Nothing dangling");
{
  const js = appSource();
  ["State.modal", "renderNewAssessmentModal", "renderAssessmentCard",
   "assessmentProgress", "daysSince", "EXPIRY_WARN"].forEach(n =>
    ok("no " + n, !js.includes(n)));
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "styles.css"), "utf8");
  ["home-hero", "home-new-btn", "form-type-card", "form-grid", "progress-bar",
   "warn-banner", "empty-state", "modal-overlay"].forEach(n =>
    ok("no ." + n + " rule", !css.includes(n)));
}

report();
})();
