// Small helpers with no opinion about this app: dates, the shape of a stored field,
// and the string tidying the note relies on. Nothing here imports anything, which is
// what makes it safe for everything else to import.

// ── Small helpers ──────────────────────────────────────────────────────────
export function uid() { return "a_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7); }

export function today() { return new Date().toISOString().slice(0, 10); }

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

// "10 Sept 2026" — how the case list writes a date, where there is room for a month
// that cannot be misread as a day. The form topbar keeps the compact fmtDate.
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "June",
                      "July", "Aug", "Sept", "Oct", "Nov", "Dec"];

export function fmtDateLong(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${parseInt(d)} ${MONTHS_SHORT[parseInt(m) - 1]} ${y}`;
}

// Operation / injury dates may be month-precision ("2026-03") when the exact day
// is unknown, so precision is derived from the stored string, never from a flag.
export function isMonthPrecision(v) { return !!v && v.length === 7; }

export function fmtEventDate(v) {
  if (!v) return "";
  const [y, m, d] = v.split("-");
  return isMonthPrecision(v)
    ? `${parseInt(m)}/${y}`
    : `${parseInt(d)}/${parseInt(m)}/${y}`;
}

// Whole months from a (possibly month-precision) event date to the assessment date.
// Returns null when it cannot be computed or the event date is in the future.
export function monthsBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return null;
  let months = (ty - fy) * 12 + (tm - fm);
  // Only an exact event date has a day to compare against.
  if (!isMonthPrecision(fromIso) && td < fd) months -= 1;
  return months < 0 ? null : months;
}

export function fmtPeriod(months) {
  if (months === null || months === undefined) return "";
  if (months < 1) return "< 1 month";
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(y + (y === 1 ? " year" : " years"));
  if (m) parts.push(m + (m === 1 ? " month" : " months"));
  return parts.join(" ");
}

// Object-typed fields may hold "" on older saved records — always read through this.
export function objField(a, key) {
  const v = a[key];
  return (v && typeof v === "object") ? v : {};
}

// Multi-select values rendered in label-map order, never click order.
export function pickLabels(arr, labelMap) {
  return Object.keys(labelMap).filter(k => (arr || []).includes(k)).map(k => labelMap[k]);
}

// Mirror the paper form's tick boxes: every option is listed, ticked or not.
// `selected` is the multi-select array, or [value] for a single-select field.
export function boxes(selected, labelMap, only) {
  return (only || Object.keys(labelMap))
    .map(k => ((selected || []).includes(k) ? "[x] " : "[ ] ") + labelMap[k]);
}

export function isBlankAnswer(v) {
  if (v == null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).every(k => isBlankAnswer(v[k]));
  return false;
}

// "time, place and person" — a list read as a sentence closes on a word, not a comma.
export function joinList(parts, sep, last) {
  if (!last || parts.length < 2) return parts.join(sep);
  return parts.slice(0, -1).join(sep) + last + parts[parts.length - 1];
}

// A line built from several ";"-separated readings scans better broken up, with the
// continuations lined up under the first reading rather than under the caption.
// Applied after tidyLine, which trims every line and would eat both the indent and
// the separator that ends each one.
// A group skipped for one reason says so once — "Sitting, Standing: Not test due to
// X" — rather than repeating the reading on each. Only when every reading is
// identical, so a reason edited on one of them breaks the group apart again.
export function collapseSharedValue(line) {
  const parts = line.split("; ");
  if (parts.length < 2) return line;
  const cut = parts[0].indexOf(": ");
  if (cut < 0) return line;
  const caption = parts[0].slice(0, cut + 2);
  const split = p => {
    const i = p.indexOf(": ");
    return i < 0 ? null : [p.slice(0, i), p.slice(i + 2)];
  };
  const pairs = [split(parts[0].slice(cut + 2))].concat(parts.slice(1).map(split));
  if (pairs.some(p => !p) || !pairs.every(p => p[1] === pairs[0][1])) return line;
  return caption + pairs.map(p => p[0]).join(", ") + ": " + pairs[0][1];
}

export function wrapSemicolons(line) {
  const parts = line.split("; ");
  if (parts.length < 2) return [line];
  const caption = parts[0].indexOf(": ");
  const pad = " ".repeat(caption >= 0 ? caption + 2 : 0);
  return parts.map((p, i) => (i ? pad : "") + p + (i < parts.length - 1 ? ";" : ""));
}

// A template writes for the fullest case, but any placeholder may come back empty.
// Clear away what an unanswered question leaves behind — an empty "( )", a stranded
// "; ;" — so a half-filled form still produces a clean line.
export function tidyLine(line) {
  // A bracketed aside is only worth keeping if something landed inside it. Drop the
  // separators an absent value leaves behind, so "(daughter, )" reads "(daughter)"
  // and "(, )" disappears along with the space in front of it.
  const cleaned = line.replace(/[ \t]*\(([^()]*)\)/g, (whole, inner) => {
    const kept = inner.split(",").map(s => s.trim()).filter(Boolean);
    return kept.length ? " (" + kept.join(", ") + ")" : "";
  });

  // A lone fragment is the whole line, and a line may legitimately be nothing but a
  // caption — "Treatment:" heads its own list. Only inside a joined list does a
  // fragment ending in a colon mean a value that never arrived. Two separators do
  // this job: a semicolon, and the wide gap that sets side-by-side columns apart.
  const prune = (text, sep, joiner) => {
    const parts = text.split(sep).map(s => s.trim());
    return (parts.length > 1 ? parts.filter(s => s && !/:$/.test(s)) : parts).join(joiner);
  };

  return prune(prune(cleaned, /[ \t]{2,}/, "  "), ";", "; ").trim()
    // A template written for the fullest case can be left ending on the separator
    // that preceded its last, empty placeholder. The space in the second rule is what
    // tells an orphan apart from a line legitimately ending in a full stop.
    .replace(/[ \t]*[,;]$/, "")
    .replace(/[ \t]+\.$/, "");
}
