// Edoc Assessment Form Platform
// Offline-friendly Express + SQLite server.
//
// Admin password: set via ADMIN_PASSWORD env var, defaults to "admin123".
// DB file: ./edoc.db (created automatically on first run).

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const { DatabaseSync } = require('node:sqlite'); // Node >= 22 built-in

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const PORT = process.env.PORT || 3000;
// On Railway/Fly/etc., set DB_PATH to a path on a mounted volume (e.g. /data/edoc.db)
// so the SQLite file survives redeploys. Locally it falls back to ./edoc.db.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'edoc.db');

// Ensure the parent directory exists (matters when DB_PATH points at a volume mount).
const fs = require('fs');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`
  CREATE TABLE IF NOT EXISTS forms (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    specialty   TEXT    NOT NULL CHECK (specialty IN ('Medical','NS','Ortho')),
    title       TEXT    NOT NULL,
    description TEXT,
    schema_json TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Simple in-memory session store for admin auth -----------------
const sessions = new Set();
function issueToken() {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.add(t);
  return t;
}
function isAdmin(req) {
  const t = req.cookies && req.cookies.edoc_admin;
  return !!(t && sessions.has(t));
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// --- App -----------------------------------------------------------
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth ----------------------------------------------------------
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = issueToken();
  res.cookie('edoc_admin', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const t = req.cookies && req.cookies.edoc_admin;
  if (t) sessions.delete(t);
  res.clearCookie('edoc_admin');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ admin: isAdmin(req) });
});

// --- Forms: list / get (public) ------------------------------------
app.get('/api/forms', (req, res) => {
  const { specialty } = req.query;
  let rows;
  if (specialty) {
    rows = db.prepare(
      'SELECT id, specialty, title, description, updated_at FROM forms WHERE specialty = ? ORDER BY title'
    ).all(specialty);
  } else {
    rows = db.prepare(
      'SELECT id, specialty, title, description, updated_at FROM forms ORDER BY specialty, title'
    ).all();
  }
  res.json(rows);
});

app.get('/api/forms/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  row.schema = JSON.parse(row.schema_json);
  delete row.schema_json;
  res.json(row);
});

// --- Forms: create / update / delete (admin) -----------------------
function validateSchema(schema) {
  if (!schema || typeof schema !== 'object') throw new Error('schema must be object');
  if (!Array.isArray(schema.sections)) throw new Error('schema.sections must be an array');
  const allowed = new Set([
    'short_text', 'long_text', 'number', 'date', 'yes_no',
    'multiple_choice', 'checkbox', 'rating', 'sub_score', 'composite', 'heading'
  ]);
  for (const s of schema.sections) {
    if (!s.title) throw new Error('each section needs a title');
    if (!Array.isArray(s.questions)) throw new Error('each section needs questions[]');
    for (const q of s.questions) {
      if (!q.id) throw new Error('each question needs an id');
      if (!q.label) throw new Error(`question ${q.id} needs a label`);
      if (!allowed.has(q.type)) throw new Error(`question ${q.id} has invalid type "${q.type}"`);
      if ((q.type === 'multiple_choice' || q.type === 'checkbox') &&
          (!Array.isArray(q.options) || q.options.length === 0)) {
        throw new Error(`question ${q.id} needs options[]`);
      }
      if ((q.type === 'multiple_choice' || q.type === 'checkbox') && Array.isArray(q.options)) {
        for (const o of q.options) {
          if (typeof o === 'object' && o !== null) {
            if (!o.value) throw new Error(`question ${q.id}: option object needs "value"`);
            if (o.subOptions && !Array.isArray(o.subOptions)) {
              throw new Error(`question ${q.id}: option "${o.value}" subOptions must be an array`);
            }
          }
        }
      }
      if (q.type === 'composite') {
        if (!Array.isArray(q.parts) || q.parts.length === 0) {
          throw new Error(`composite ${q.id} needs parts[]`);
        }
        for (const p of q.parts) {
          if (!p.id) throw new Error(`composite ${q.id}: each part needs an id`);
        }
      }
      if (q.showIf) {
        if (typeof q.showIf !== 'object' || !q.showIf.questionId) {
          throw new Error(`question ${q.id} showIf needs a questionId`);
        }
      }
      if (q.type === 'rating') {
        if (typeof q.min !== 'number' || typeof q.max !== 'number' || q.min >= q.max) {
          throw new Error(`question ${q.id} needs numeric min < max`);
        }
      }
      if (q.type === 'sub_score') {
        if (!Array.isArray(q.items) || q.items.length === 0) {
          throw new Error(`question ${q.id} needs items[]`);
        }
        const mode = q.mode || 'max';
        if (!['max', 'options'].includes(mode)) {
          throw new Error(`question ${q.id} mode must be "max" or "options"`);
        }
        for (const it of q.items) {
          if (!it.id || !it.label) throw new Error(`sub_score ${q.id}: each item needs id + label`);
          if (mode === 'max' && typeof it.max !== 'number') {
            throw new Error(`sub_score ${q.id} item ${it.id} needs numeric max`);
          }
          if (mode === 'options' &&
              (!Array.isArray(it.options) || it.options.some(v => typeof v !== 'number'))) {
            throw new Error(`sub_score ${q.id} item ${it.id} needs numeric options[]`);
          }
        }
      }
    }
  }
}

app.post('/api/forms', requireAdmin, (req, res) => {
  try {
    const { specialty, title, description, schema } = req.body || {};
    if (!['Medical', 'NS', 'Ortho'].includes(specialty)) throw new Error('invalid specialty');
    if (!title) throw new Error('title required');
    validateSchema(schema);
    const info = db.prepare(
      'INSERT INTO forms (specialty, title, description, schema_json) VALUES (?,?,?,?)'
    ).run(specialty, title, description || '', JSON.stringify(schema));
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/forms/:id', requireAdmin, (req, res) => {
  try {
    const { specialty, title, description, schema } = req.body || {};
    if (!['Medical', 'NS', 'Ortho'].includes(specialty)) throw new Error('invalid specialty');
    if (!title) throw new Error('title required');
    validateSchema(schema);
    const info = db.prepare(
      `UPDATE forms SET specialty = ?, title = ?, description = ?, schema_json = ?,
       updated_at = datetime('now') WHERE id = ?`
    ).run(specialty, title, description || '', JSON.stringify(schema), req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/forms/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM forms WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// --- Import (admin) ------------------------------------------------
app.post('/api/forms/import', requireAdmin, (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.form) throw new Error('Expected { form: {...} }');
    const { specialty, title, description, schema } = payload.form;
    if (!['Medical', 'NS', 'Ortho'].includes(specialty)) throw new Error('invalid specialty');
    if (!title) throw new Error('title required');
    validateSchema(schema);
    const info = db.prepare(
      'INSERT INTO forms (specialty, title, description, schema_json) VALUES (?,?,?,?)'
    ).run(specialty, title, description || '', JSON.stringify(schema));
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Edoc running on port ${PORT}`);
  console.log(`DB file: ${DB_PATH}`);
  console.log(`Admin password: ${ADMIN_PASSWORD === 'admin123' ? '(default: admin123)' : '(from env)'}`);
});
