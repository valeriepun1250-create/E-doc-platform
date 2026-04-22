# Edoc — Offline Assessment Form Platform

A self-hosted, Google-Forms-style app for clinical assessment forms across three
specialties (**Medical**, **NS**, **Ortho**). Admins build or import forms;
visitors fill them in and get a ready-to-paste text report on their clipboard.

## Stack
- Node.js + Express
- SQLite (`better-sqlite3`) — stored in `edoc.db` next to `server.js`
- Vanilla HTML / CSS / JS frontend (no build step)
- User response "history" kept in the browser's **localStorage**

## Run

```bash
npm install
# optional: set your own admin password
export ADMIN_PASSWORD=choose-something-strong
npm start
```

Open <http://localhost:3000>.

- **Forms** tab — filter by specialty and use any form.
- **History** tab — every Save & Copy lands here, editable or deletable.
- **Admin** tab — log in with `ADMIN_PASSWORD` (default `admin123`). From here
  you can create, edit, delete, or **Import .json** forms.

## Creating forms from JSON

See [FORM_JSON_GUIDE.md](FORM_JSON_GUIDE.md). A worked sample lives in
[`examples/sample-form.json`](examples/sample-form.json).

## How the report is built

On **Save & Copy**, Edoc walks the form section-by-section:

```
<Form title>
Specialty: <Medical|NS|Ortho>
Date: <now>

== <Section title> ==
<reportTemplate with {answer} substituted>        ← if the question has one
<Label>: <answer>                                  ← otherwise

...
```

`checkbox` answers are joined with commas; `rating` renders as `n/max`;
unanswered fields show as `—`.
