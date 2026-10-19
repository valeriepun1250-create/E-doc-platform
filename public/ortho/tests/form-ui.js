// How the form's cards behave, as opposed to what the note says.
//
// The other harnesses read notes back out of a record. This one renders the form and
// drives it: a card that is meant to stay shut until it is wanted, and one that is
// meant to open itself once it holds work, are only observable here.
const { load, install, env, ok, report, findAll, hasClass, textOf } = require("./lib/harness");

(async () => {
const app = await load();

const HDRS = app.GHF_SECTIONS.findIndex(s => s.id === "hdrs");
const RATED = { f1_e1: 4, f1_e2: 3, f2_e1: 5, f2_e2: 4, f3_e1: 3, f3_e2: 4 };

// Renders one section of a form and hands back the pieces a test wants to look at.
const openTab = (formType, sectionIndex, seed) => {
  const a = app.blankAssessment("G9/12 LCM", "2026-03-04", formType);
  if (seed) Object.assign(a, seed);
  app.State.assessments = { [a.id]: a };
  app.State.currentId = a.id;
  app.State.expanded = {};            // as goForm leaves it on every case open
  app.State.section = sectionIndex;
  app.State.view = "form";
  const draw = () => app.renderForm();
  const tree = draw();
  return { a, tree, draw };
};

const cards      = t => findAll(t, n => hasClass(n, "collapsible"));
const plainCards = t => findAll(t, n => hasClass(n, "form-card") && !hasClass(n, "collapsible"));
const headerOf   = t => findAll(t, n => hasClass(n, "collapsible-header"))[0];
const isOpen     = c => hasClass(c, "open");
// The body is built only when open, so the grid is absent from the tree rather than
// merely hidden — which is the point: a shut card costs nothing to render.
const gridNodes  = t => findAll(t, n => (n.className || "").includes("score")).length;

console.log("1. HDRS starts shut on a fresh assessment");
{
  const v = openTab("ghf_initial", HDRS);
  const c = cards(v.tree);
  ok("exactly one collapsible card", c.length === 1, String(c.length));
  ok("and it is shut", c.length === 1 && !isOpen(c[0]));
  ok("the rating grid is not in the tree at all", gridNodes(v.tree) === 0,
     String(gridNodes(v.tree)));
  ok("it is titled in full", /Home Discharge Readiness Scale \(HDRS\)/
     .test(textOf(headerOf(v.tree))));
  ok("with no count, having nothing in it", !/\(\d+\)/.test(textOf(headerOf(v.tree))),
     textOf(headerOf(v.tree)));
}

console.log("\n2. Clicking opens it");
{
  const v = openTab("ghf_initial", HDRS);
  headerOf(v.tree).handlers.click.forEach(fn => fn());
  const after = v.draw();
  ok("now open", isOpen(cards(after)[0]));
  ok("and the grid is there", gridNodes(after) > 0, String(gridNodes(after)));

  // Tapping again puts it back, so the control works both ways.
  headerOf(after).handlers.click.forEach(fn => fn());
  const back = v.draw();
  ok("clicking again shuts it", !isOpen(cards(back)[0]) && gridNodes(back) === 0);
}

console.log("\n3. A rated section opens itself");
{
  // State.expanded is cleared every time a case is opened, so without this a therapist
  // reopening yesterday's case would find a shut, empty-looking box over real ratings.
  const v = openTab("ghf_initial", HDRS, { ghf_hdrs: RATED });
  ok("open without being asked", isOpen(cards(v.tree)[0]));
  ok("the grid is there", gridNodes(v.tree) > 0);
  ok("and the count says how much", /\(6\)/.test(textOf(headerOf(v.tree))),
     textOf(headerOf(v.tree)));

  const partly = openTab("ghf_initial", HDRS, { ghf_hdrs: { f1_e1: 4, f2_e2: 2 } });
  ok("a partly rated one counts what is rated",
     /\(2\)/.test(textOf(headerOf(partly.tree))), textOf(headerOf(partly.tree)));
}

console.log("\n4. A deliberate tap wins over both defaults");
{
  const v = openTab("ghf_initial", HDRS, { ghf_hdrs: RATED });
  headerOf(v.tree).handlers.click.forEach(fn => fn());   // shut it
  const after = v.draw();
  ok("an answered section stays shut once shut", !isOpen(cards(after)[0]));
  ok("and re-rendering does not reopen it", !isOpen(cards(v.draw())[0]));
}

console.log("\n5. The flag is opt-in");
{
  const collapsedIds = app.GHF_SECTIONS.filter(s => s.collapsed).map(s => s.id);
  ok("only HDRS declares it", collapsedIds.join() === "hdrs", collapsedIds.join());

  let bad = null;
  app.GHF_SECTIONS.forEach((s, i) => {
    if (s.collapsed) return;
    const t = openTab("ghf_initial", i).tree;
    if (cards(t).length) bad = bad || s.id;
    if (!plainCards(t).length) bad = bad || (s.id + " (drew nothing)");
  });
  ok("every other section draws plain cards", !bad, bad);
}

console.log("\n6. The reminder says when the card is worth opening");
{
  const WORDING = "Applicable if discharge planning indicated";
  const hintOf = t => {
    const h = findAll(t, n => hasClass(n, "collapsible-hint"))[0];
    return h ? textOf(h) : null;
  };

  // The whole point: a hint in the card body would not be built while the card is
  // shut, which is the only time it is any use. It has to be in the header.
  const shut = openTab("ghf_initial", HDRS);
  ok("readable while collapsed", hintOf(shut.tree) === WORDING, hintOf(shut.tree));
  ok("and the body really is absent", gridNodes(shut.tree) === 0);
  ok("the title is stacked to carry it",
     findAll(shut.tree, n => hasClass(n, "collapsible-title") && hasClass(n, "stacked")).length === 1);

  const open = openTab("ghf_initial", HDRS, { ghf_hdrs: RATED });
  ok("still there once open", hintOf(open.tree) === WORDING, hintOf(open.tree));

  // A specified wording, pinned so it cannot drift.
  ok("worded exactly as the team asked",
     app.GHF_SECTIONS.find(s => s.id === "hdrs").hint === WORDING);
}

console.log("\n7. Cards without a hint keep the markup they had");
{
  // The shared helper has now changed twice, so the plain path is worth pinning.
  let stacked = null, hinted = null;
  app.GHF_SECTIONS.forEach((s, i) => {
    if (s.id === "hdrs") return;
    const t = openTab("ghf_initial", i).tree;
    if (findAll(t, n => hasClass(n, "stacked")).length) stacked = stacked || s.id;
    if (findAll(t, n => hasClass(n, "collapsible-hint")).length) hinted = hinted || s.id;
  });
  ok("no other GHF section stacks its title", !stacked, stacked);
  ok("and none carries a hint", !hinted, hinted);
}

console.log("\n8. Ortho Day Rehab is unaffected");
{
  // It shares collapsibleCard, and the helper gained an argument — so the regression
  // that matters is its checklists quietly defaulting to open.
  const RISK = app.OD_SECTIONS.findIndex(s => s.id === "risk");
  const v = openTab("ortho_day", RISK);
  const c = cards(v.tree);
  ok("its risk checklists are collapsible", c.length > 0, String(c.length));
  ok("and every one still starts shut", c.every(x => !isOpen(x)),
     c.filter(isOpen).length + " were open");

  const seeded = openTab("ortho_day", RISK,
    { ["od_risk_" + app.RISK_CHECKLIST[0].key]: [app.RISK_CHECKLIST[0].items[0].value
        || app.RISK_CHECKLIST[0].items[0]] });
  ok("a ticked one stays shut too — it never asked to open itself",
     cards(seeded.tree).every(x => !isOpen(x)));

  // It passes four arguments, so neither the open-by-default nor the hint reaches it.
  ok("its headers carry no hint",
     !findAll(v.tree, n => hasClass(n, "collapsible-hint")).length);
  ok("and its titles are not stacked",
     !findAll(v.tree, n => hasClass(n, "stacked")).length);
}

console.log("\n9. Copying a note");
{
  const tick = () => new Promise(r => setTimeout(r, 0));
  const NOTE = "Treatment:\nHome visit done\n\nRecommendation:\nContinue <program>";
  const press = async opts => {
    install(opts);
    const btn = app.copyButton(() => NOTE);
    btn.handlers.click.forEach(fn => fn());
    await tick(); await tick();
    return btn;
  };

  // Plain text alone is what let a paste target read "Treatment:" as a URI scheme and
  // percent-encode the note. The HTML flavour is not for formatting — it is what makes
  // the receiving app treat this as text, exactly as a hand-made selection does.
  {
    const btn = await press();
    const item = env.clipboard && env.clipboard.items;
    ok("both flavours go on the clipboard",
       !!item && !!item["text/plain"] && !!item["text/html"],
       JSON.stringify(item && Object.keys(item)));
    ok("plain text is the note, exactly",
       item && item["text/plain"].text === NOTE,
       JSON.stringify(item && item["text/plain"].text));
    ok("the html flavour escapes what it must",
       item && item["text/html"].text.includes("&lt;program&gt;") &&
       !item["text/html"].text.includes("<program>"));
    ok("and keeps the line breaks", item && /<pre/.test(item["text/html"].text));
    ok("the button confirms", btn.textContent === "✓ Copied!", btn.textContent);
  }

  // Older browsers have writeText but not write.
  {
    let got = null;
    await press({ clipboard: { writeText: t => { got = t; return Promise.resolve(); } } });
    ok("falls back to plain text when write is missing", got === NOTE, JSON.stringify(got));
  }

  // What the HTML flavour would be read back as, so the fallback can be held to the
  // same standard as the modern path: the note itself, not an approximation of it.
  const unesc = h => String(h).replace(/^<pre[^>]*>/, "").replace(/<\/pre>$/, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

  // A non-secure origin has no clipboard object at all — which is what an intranet
  // served over plain http:// is, so this is the only path there rather than a rare
  // one. Reading through navigator.clipboard used to throw before the fallback could
  // run, so nothing was copied and nothing was said.
  {
    const btn = await press({ clipboard: null });
    const last = env.execCommands[env.execCommands.length - 1];
    ok("no clipboard API still reaches the fallback", !!last, JSON.stringify(env.execCommands));
    ok("which copies the note, not the page",
       last && unesc(last.html) === NOTE, JSON.stringify(last && last.html));
    // The specific failure that returned the screen's contents instead of the note.
    ok("having selected its own element first",
       last && last.selected && last.selected.attrs.contenteditable === "true",
       JSON.stringify(last && last.selected && last.selected.attrs));
    // A textarea here would put plain text on the clipboard and nothing else — the
    // exact condition that had "Treatment:" pasted as a percent-encoded link.
    ok("and it is markup, so this path carries an html flavour too",
       last && /^<pre/.test(last.html), JSON.stringify(last && last.html));
    ok("and it reports success", btn.textContent === "✓ Copied!", btn.textContent);
  }

  // Copying should leave the page as it found it.
  {
    install({ clipboard: null });
    const mine = { node: { tag: "p" } };
    env.domSelection.addRange(mine);
    const btn = app.copyButton(() => NOTE);
    btn.handlers.click.forEach(fn => fn());
    await tick(); await tick();
    ok("the user's own selection survives the copy",
       env.domSelection.rangeCount === 1 && env.domSelection.getRangeAt(0) === mine,
       env.domSelection.rangeCount);
  }

  // A rejected promise must fall through too, not be swallowed.
  {
    await press({ clipboard: { write: () => Promise.reject(new Error("denied")),
                               writeText: () => Promise.reject(new Error("denied")) } });
    const last = env.execCommands[env.execCommands.length - 1];
    ok("a refused clipboard falls through to the fallback",
       last && unesc(last.html) === NOTE, JSON.stringify(last && last.html));
  }

  // The defect that hid all of this: it said "Copied!" whatever happened, so a wrong
  // paste looked like a successful copy.
  {
    install({ clipboard: null });
    env.execCommandResult = false;
    const btn = app.copyButton(() => NOTE);
    btn.handlers.click.forEach(fn => fn());
    await tick(); await tick();
    ok("a failed copy says so rather than claiming success",
       btn.textContent === "Copy failed", btn.textContent);
    ok("and never says Copied", btn.textContent !== "✓ Copied!");
    delete env.execCommandResult;
  }
}

report();
})();
