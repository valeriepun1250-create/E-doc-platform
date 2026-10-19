// Shared rig for the harnesses. Each one used to carry its own copy of the DOM stub;
// they are one file now so that a gap filled for one test is filled for all of them.
//
// The app is an ES module, which a Node `vm` context cannot load, so it arrives
// through a dynamic import instead. That is a real import of the real module graph —
// the tests see exactly the surface the browser does.
const fs = require("fs"), path = require("path");
const { pathToFileURL } = require("url");

// A DOM node with just enough behaviour for the app to build a tree and for a test to
// walk it: children under `kids`, listeners under `handlers`, so a test can find a
// chip by its text and click it for real.
function node(tag) {
  return {
    tag, nodeType: 1, className: "", value: "", files: null, innerHTML: "",
    kids: [], handlers: {}, attrs: {}, style: {},
    setAttribute(k, v) { this.attrs[k] = v; if (k === "value") this.value = v; },
    appendChild(c) { this.kids.push(c); return c; },
    removeChild(c) { this.kids = this.kids.filter(k => k !== c); return c; },
    click() { (this.handlers.click || []).forEach(fn => fn()); this.clicked = true; },
    select() { env.selected = this; },
    setSelectionRange(a, b) { this.range = [a, b]; },
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    classList: {
      list: [],
      toggle(c, on) {
        const i = this.list.indexOf(c);
        if (on && i < 0) this.list.push(c);
        if (!on && i >= 0) this.list.splice(i, 1);
      },
      add(c) { this.toggle(c, true); },
      remove(c) { this.toggle(c, false); },
      contains(c) { return this.list.includes(c); }
    }
  };
}

// A Selection and the Ranges in it. The copy fallback selects a range over a
// contenteditable element — which is what makes it carry an HTML flavour and not only
// plain text — so the rig has to model a selection rather than a textarea's own.
function selection() {
  return {
    ranges: [],
    get rangeCount() { return this.ranges.length; },
    getRangeAt(i) { return this.ranges[i]; },
    removeAllRanges() { this.ranges = []; },
    addRange(r) { this.ranges.push(r); }
  };
}
const range = () => ({ node: null, selectNodeContents(n) { this.node = n; } });

// Everything the app reaches for on the global object. Handed back so a test can read
// what was alerted, or what a download would have contained.
const env = { store: {}, alerts: [], confirms: true, downloaded: null, body: null,
  // What the clipboard was asked to carry, and what was selected when execCommand ran —
  // the two things that tell a real copy from one that grabbed the page instead.
  clipboard: null, execCommands: [], selected: null, domSelection: null };

function install(opts = {}) {
  env.store = {};
  env.alerts = [];
  env.confirms = true;
  env.downloaded = null;
  env.clipboard = null;
  env.execCommands = [];
  env.selected = null;
  env.domSelection = selection();
  env.body = node("body");

  const root = node("div");
  globalThis.localStorage = {
    getItem: k => (k in env.store ? env.store[k] : null),
    setItem: (k, v) => { env.store[k] = v; },
    removeItem: k => { delete env.store[k]; }
  };
  globalThis.document = {
    body: env.body,
    createElement: t => node(t),
    createTextNode: t => ({ nodeType: 3, text: t, kids: [] }),
    // render() clears this and appends to it. Giving it a real node means the app's
    // own render runs during a test instead of being stubbed out, so a handler that
    // calls render() is exercised rather than skipped.
    getElementById: () => root,
    createRange: () => range(),
    execCommand(cmd) {
      // Records what the selection held at the moment of the copy, which is the whole
      // point: a fallback that has not selected its own element copies the page instead.
      // `html` is what a real clipboard would take the HTML flavour from.
      const sel = env.domSelection;
      const r = sel && sel.rangeCount ? sel.getRangeAt(sel.rangeCount - 1) : null;
      env.execCommands.push({ cmd, selected: r && r.node,
        html: r && r.node ? r.node.innerHTML : null });
      return env.execCommandResult !== false;
    },
    getSelection: () => env.domSelection
  };
  globalThis.window = { scrollTo: () => {} };
  // Node has had its own `navigator` global since v21, defined as a getter with no
  // setter — so a plain assignment fails silently and leaves the real one in place,
  // which meant a stub clipboard leaked from one test into the next.
  const nav = {};
  Object.defineProperty(globalThis, "navigator",
    { value: nav, configurable: true, writable: true });
  globalThis.alert = m => { env.alerts.push(String(m)); };
  globalThis.confirm = () => env.confirms;
  globalThis.Blob = function (parts, o) { this.text = parts.join(""); this.type = (o || {}).type; };
  globalThis.ClipboardItem = function (items) { this.items = items; };
  if (opts.clipboard !== null) {
    nav.clipboard = opts.clipboard || {
      write: items => { env.clipboard = items[0]; return Promise.resolve(); },
      writeText: t => { env.clipboard = { plain: t }; return Promise.resolve(); }
    };
  }
  globalThis.URL = {
    createObjectURL: b => { env.downloaded = b.text; return "blob:x"; },
    revokeObjectURL: () => {}
  };
  // Export defers its revoke by a tick; running timers inline lets a test assert on
  // the result without waiting.
  globalThis.setTimeout = opts.syncTimers ? (fn => { fn(); return 0; }) : setTimeout;
  globalThis.clearTimeout = opts.syncTimers ? (() => {}) : clearTimeout;
  return env;
}

async function load(opts) {
  install(opts);
  return import(pathToFileURL(path.join(__dirname, "..", "..", "src", "index.js")).href);
}

// ── Reading the app's own source ────────────────────────────────────────────
// Every file the app is built from, concatenated. A check that scans for a retired
// identifier asks this rather than naming app.js, so it keeps working as code moves
// into src/ instead of quietly passing against a file that no longer holds the code.
function appSource() {
  const root = path.join(__dirname, "..", "..");
  const out = [];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) out.push(fs.readFileSync(p, "utf8"));
  });
  const appJs = path.join(root, "app.js");   // only while the split is in progress
  if (fs.existsSync(appJs)) out.push(fs.readFileSync(appJs, "utf8"));
  walk(path.join(root, "src"));
  if (!out.length) throw new Error("no app source found");
  return out.join("\n");
}

// ── Assertions ──────────────────────────────────────────────────────────────
let fail = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? "  ok   " : "  FAIL ") + name);
  if (!cond) { fail++; if (extra !== undefined) console.log("        " + extra); }
};
// A specified format is pinned whole: on a miss, print both sides rather than a bare
// false, because the difference is usually one space.
const block = (name, got, want) => {
  const good = got === want;
  console.log((good ? "  ok   " : "  FAIL ") + name);
  if (!good) { fail++; console.log("--- got ---\n" + got + "\n--- want ---\n" + want); }
};
const report = () => {
  console.log(fail ? "\n" + fail + " FAILURE(S)" : "\nALL CHECKS PASS");
  process.exitCode = fail ? 1 : 0;
};

// ── Walking the rendered tree ───────────────────────────────────────────────
const textOf = n => n.nodeType === 3 ? n.text
  : typeof n.textContent === "string" ? n.textContent
  : (n.kids || []).map(textOf).join("");
const findAll = (n, pred, out = []) => {
  if (n.nodeType === 1 && pred(n)) out.push(n);
  (n.kids || []).forEach(k => findAll(k, pred, out));
  return out;
};
const hasClass = (n, c) => (n.className || "").split(" ").includes(c);
const byClass = (n, c) => findAll(n, x => hasClass(x, c));
const byTag = (n, t) => findAll(n, x => x.tag === t);
const chipNamed = (n, label) =>
  findAll(n, x => hasClass(x, "chip") && textOf(x) === label)[0] || null;

module.exports = { node, install, load, env, appSource, ok, block, report,
                   textOf, findAll, hasClass, byClass, byTag, chipNamed };
