// A local web server for development, so the app can be opened without deploying it.
//
//   node serve.js            http://localhost:3456
//   node serve.js --open     the same, and open a browser on it
//   node serve.js 8080       another port, if 3456 is taken
//
// Double-clicking Preview.command in Finder runs the --open form.
//
// This file is only for working on the app. It is not needed to host it: Netlify, an
// intranet server, or anything else that serves static files will do, because there is
// no build step and nothing to run server-side.
//
// It exists because the app cannot be opened by double-clicking index.html. The app is
// built from ES modules, and browsers refuse to load modules from a file:// page — it
// has no origin, so the security rules that govern module loading cannot be satisfied.
// Nothing is wrong when that shows a blank page; it needs a server, not a fix.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const args = process.argv.slice(2);
const openBrowser = args.includes("--open");
const port = Number(args.find(a => /^\d+$/.test(a))) || 3456;
const root = __dirname;
const url = "http://localhost:" + port + "/";

// macOS `open`, Windows `start`, Linux `xdg-open`. Failure is not worth reporting —
// the address is printed either way, so the worst case is one copy and paste.
function openInBrowser() {
  const cmd = process.platform === "darwin" ? "open"
            : process.platform === "win32" ? "explorer"
            : "xdg-open";
  execFile(cmd, [url], () => {});
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
  ".txt":  "text/plain; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const reqPath = decodeURIComponent(req.url.split("?")[0]);
  const rel = reqPath === "/" ? "index.html" : reqPath.replace(/^\/+/, "");
  const file = path.join(root, rel);

  // Never serve anything outside the app folder, whatever the request asks for.
  if (!file.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found: " + rel);
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      // No caching here, or the service worker and the browser will both keep serving
      // yesterday's file and an edit will look like it did nothing.
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});

server.on("error", err => {
  if (err.code !== "EADDRINUSE") throw err;
  // Almost always a second double-click of Preview.command. A stack trace would say
  // nothing useful, so say what is actually going on and open the one already running.
  console.log("\n  A server is already running on port " + port + ".");
  console.log("  " + url + "\n");
  if (openBrowser) openInBrowser();
});

server.listen(port, () => {
  console.log("\n  Ortho OT Assessment");
  console.log("  " + url + "\n");
  console.log("  Ctrl+C to stop, or just close this window.\n");
  if (openBrowser) openInBrowser();
});
