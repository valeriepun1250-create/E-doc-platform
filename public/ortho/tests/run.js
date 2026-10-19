// Runs every harness beside it. No dependencies, no framework: node tests/run.js
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith(".js") && f !== "run.js")
  .sort();

let failed = 0;
files.forEach(f => {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const bad = r.status !== 0;
  if (bad) failed++;
  console.log((bad ? "FAIL  " : "ok    ") + f);
  // Only a failing harness is worth the screen space; a passing one says so in a word.
  if (bad) console.log(out.split("\n").map(l => "      " + l).join("\n"));
});

console.log(failed
  ? "\n" + failed + " of " + files.length + " harnesses failed"
  : "\n" + files.length + " harnesses pass");
process.exitCode = failed ? 1 : 0;
