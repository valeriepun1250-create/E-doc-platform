// Boots the real entry point and walks every view for every form type.
//
// The other harnesses import the pieces they need, so they would keep passing even if
// the module graph the browser actually loads were broken — a missing export or a
// cycle that leaves a binding uninitialised shows up only when something imports the
// whole thing and runs it. That is what this does. It is the closest Node gets to
// opening the app, and it is the check that fails first if a split goes wrong.
const path = require("path");
const { pathToFileURL } = require("url");
const { install, ok, report, findAll, env } = require("./lib/harness");

(async () => {
install();
globalThis.location = { search: "" };
// Importing main.js *is* the boot: it renders the home page as a side effect.
await import(pathToFileURL(path.join(__dirname, "..", "src", "main.js")).href);
const app = await import(pathToFileURL(path.join(__dirname, "..", "src", "index.js")).href);

const nodes = n => findAll(n, () => true).length;
const text = n => n.nodeType === 3 ? n.text : (n.kids || []).map(text).join("");

// Just enough of an answer for the summary to have something to print. Schema forms
// are filled by walking their own questions, so this keeps working as they change;
// ortho_day has no schema to walk, so it names two fields.
const fill = (a, ft) => {
  if (ft.kind === "schema") {
    app.schemaQuestions(ft.sections()).forEach(q => {
      if (q.type === "textarea" || q.type === "text") a[q.id] = "boot check";
    });
  } else {
    a.od_problems = ["deconditioning"];
    a.od_attendReason = Object.keys(app.ATTEND_LABELS)[0];
  }
};

console.log("1. The entry point boots");
ok("home rendered on import", app.State.view === "home");
ok("it drew something", nodes(app.renderHome()) > 20);

console.log("\n2. Every view, for every form type");
app.FORM_TYPES.forEach(ft => {
  const a = app.blankAssessment("G9/12 LCM", "2026-03-04", ft.id);
  app.State.assessments = { [a.id]: a };
  app.State.currentId = a.id;
  app.State.section = 0;

  app.State.view = "form";
  let drew = 0;
  try { drew = nodes(app.renderForm()); } catch (e) { drew = -1; var err = e; }
  ok(ft.id + ": form renders", drew > 20, drew === -1 ? String(err && err.stack) : drew);

  // Blank first: an untouched case is meant to say so rather than print empty boxes.
  app.State.view = "summary";
  let blank = 0;
  try { blank = nodes(app.renderSummary()); } catch (e) { blank = -1; var berr = e; }
  ok(ft.id + ": blank summary renders the empty state",
     blank > 0 && /Nothing recorded yet/.test(text(app.renderSummary())),
     blank === -1 ? String(berr && berr.stack) : blank);

  // Then with answers, so the part boxes and their Copy / Edit / Revert actually build.
  fill(a, ft);
  let sum = 0;
  try { sum = nodes(app.renderSummary()); } catch (e) { sum = -1; var serr = e; }
  ok(ft.id + ": filled summary renders its parts",
     sum > 20 && !/Nothing recorded yet/.test(text(app.renderSummary())),
     sum === -1 ? String(serr && serr.stack) : sum);

  // A form with section tabs must survive being walked, not just opened on tab 0:
  // a question that only appears behind a later tab is otherwise never constructed.
  const sections = ft.sections ? ft.sections() : [];
  let tabs = 0, bad = null;
  sections.forEach((s, i) => {
    app.State.view = "form";
    app.State.section = i;
    try { app.renderForm(); tabs++; } catch (e) { bad = bad || (s.id + ": " + e.message); }
  });
  ok(ft.id + ": all " + sections.length + " sections render", !bad && tabs === sections.length, bad);
});

console.log("\n3. Navigating between views");
{
  const a = app.blankAssessment("G9/12 LCM", "2026-03-04", "ghf_initial");
  app.State.assessments = { [a.id]: a };
  app.goForm(a.id);
  ok("goForm opens the case", app.State.view === "form" && app.State.currentId === a.id);
  app.goSummary();
  ok("goSummary switches", app.State.view === "summary");
  app.goHome();
  ok("goHome returns", app.State.view === "home");
  ok("no alert was raised on the way", !env.alerts.length, env.alerts.join(" | "));
}

report();
})();
