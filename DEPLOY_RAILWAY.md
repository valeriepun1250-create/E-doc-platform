# Deploying Edoc to Railway

## 1. Push to GitHub

Already done locally (see commit log). Then:

1. Go to <https://github.com/new>.
2. Repository name: `edoc-assessment` (or anything you like). Keep it **Private** unless you want it public.
3. **Do NOT** check "Add README", ".gitignore" or "license" — we already have them.
4. Click **Create repository**.
5. Copy the SSH or HTTPS URL GitHub shows you, then run:

```bash
cd /Users/valeriepun/Edoc
git remote add origin <PASTE_URL_HERE>
git branch -M main
git push -u origin main
```

## 2. Deploy on Railway

1. Go to <https://railway.com/new> and sign in with GitHub.
2. Click **Deploy from GitHub repo** → pick `edoc-assessment`.
3. Railway autodetects Node, installs deps, and runs `node server.js`. It exposes `process.env.PORT` automatically.

### Add environment variables
In the project's **Variables** tab, add:

| Key | Value |
|---|---|
| `ADMIN_PASSWORD` | a strong password of your choice |
| `DB_PATH` | `/data/edoc.db` |

### Add a persistent volume (so the SQLite file survives redeploys)
In the service's **Settings → Volumes**:

- Mount path: `/data`
- Size: 1 GB is plenty.

Redeploy after attaching the volume.

### Generate a public URL
Service **Settings → Networking → Generate Domain**. You'll get something like
`edoc-assessment-production.up.railway.app`.

## 3. Verify

- Visit your Railway URL — the **Forms** tab should load.
- Click **Admin** → log in with `ADMIN_PASSWORD`.
- Add or import a form. Trigger a redeploy from Railway and confirm your form is still there
  (that proves the volume is working).

## 4. Updating

```bash
# make changes locally
git add -A
git commit -m "your change"
git push
```
Railway auto-deploys on every push to `main`.

## Troubleshooting

- **App boots but crashes on first DB write** → volume not mounted at `/data`. Check the
  service's Volumes tab.
- **`SQLITE_CANTOPEN`** → wrong `DB_PATH`. Make sure it matches the volume mount path
  exactly (`/data/edoc.db` if you mounted at `/data`).
- **Login always fails** → `ADMIN_PASSWORD` not set or has stray whitespace. Re-save in
  the Variables tab and Railway will redeploy.
