# Vehicles Dashboard — Google Sheets API edition

This replaces the Apps Script `doGet`/`getDashboardData`/`updateRemark` dashboard
with a small, fast, GitHub-hosted app:

- **Frontend**: `public/index.html` — same dashboard UI/UX you already had.
- **Backend**: 3 tiny serverless functions in `api/` that call the **Google Sheets API**
  directly with a service account — no Apps Script involved for reading or writing
  the dashboard.
- **Login**: a simple password gate (`api/login.js`) protects the dashboard, since the
  sheet contains customer PII (phone, license number, name).

Your existing Apps Script `doPost` webhook (used by your bots to append
ENQUIRY_BOT / VEHICLE_INVOICE_BOT / etc. data) is **unrelated to this** and can keep
running exactly as-is — only the *dashboard's* read/write moved off Apps Script.

Deploys to **Vercel** (free tier is plenty for this), with the code living in
your GitHub repo and auto-deploying on every push.

---

## 1. Google Cloud setup (one-time, ~5 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a
   project (or reuse one).
2. **APIs & Services → Library** → search "Google Sheets API" → **Enable**.
3. **APIs & Services → Credentials → Create Credentials → Service account**.
   - Give it any name, e.g. `vehicles-dashboard`.
   - No special roles needed at the project level — skip that step.
4. Open the new service account → **Keys** tab → **Add Key → Create new key → JSON**.
   A `.json` file downloads. Keep it private, never commit it to GitHub.
5. Open your Google Sheet → **Share** → paste the service account's email
   (looks like `vehicles-dashboard@your-project.iam.gserviceaccount.com`, found
   in the JSON file as `client_email`) → give it **Editor** access (needed
   since the dashboard now writes REMARK back via this same account) → Share.

That's it on the Google side — no OAuth consent screen, no user login flow.

---

## 2. Get the values you'll need

From the downloaded JSON key file:
- `client_email` → this is `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → this is `GOOGLE_PRIVATE_KEY` (keep it exactly as-is, including
  the `\n` sequences and the `-----BEGIN/END PRIVATE KEY-----` lines)

From each Sheet's URL, e.g. `https://docs.google.com/spreadsheets/d/1AbC.../edit`:
- The part between `/d/` and `/edit` → that's the sheet's ID

This dashboard supports **two sheets** (HERO and PREMIA), switchable with the
buttons at the top of the page. Both must be shared with the same service
account email (step 5 above) — do that for **both** spreadsheets. You'll set:
- `GOOGLE_SHEET_ID_HERO` → the HERO spreadsheet's ID
- `GOOGLE_SHEET_ID_PREMIA` → the PREMIA spreadsheet's ID

(If you only ever used `GOOGLE_SHEET_ID` from an earlier version of this
project, it still works as the ID for HERO — you just also need to add
`GOOGLE_SHEET_ID_PREMIA` for the new sheet.)

Pick:
- `DASHBOARD_PASSWORD` → whatever password your team will use to open the dashboard
- `AUTH_SECRET` → a random string for signing login sessions. Generate one with:
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

---

## 3. Push this project to GitHub

```bash
cd hero-dashboard
git init
git add .
git commit -m "Vehicles dashboard on Sheets API"
git branch -M main
git remote add origin https://github.com/<your-username>/hero-dashboard.git
git push -u origin main
```

(`.gitignore` already excludes `node_modules`, `.env`, and `.vercel` — your
service account key never gets committed as long as you only put its values
into environment variables, not into any file in this repo.)

---

## 4. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com), sign in with GitHub, click **Add New → Project**,
   and import the `hero-dashboard` repo. Vercel auto-detects the `api/` folder as
   serverless functions and `public/` as static hosting — no build config needed.
2. Before the first deploy (or right after, then redeploy), go to
   **Project → Settings → Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | from step 2 |
   | `GOOGLE_PRIVATE_KEY` | from step 2 (paste the whole multi-line value) |
   | `GOOGLE_SHEET_ID_HERO` | HERO spreadsheet ID, from step 2 |
   | `GOOGLE_SHEET_ID_PREMIA` | PREMIA spreadsheet ID, from step 2 |
   | `SHEET_TAB_NAME` | `VEHICLES_BOT` (or leave unset — that's the default) |
   | `DASHBOARD_PASSWORD` | your chosen password |
   | `AUTH_SECRET` | your generated random string |

   Note: one password currently guards both sheets. If HERO and PREMIA need
   different access lists later, that's a further step up (per-user login) —
   ask if you want that built.

3. Click **Deploy**. You'll get a URL like `https://hero-dashboard.vercel.app`.
4. Open it, enter the password, and the dashboard loads.

From now on, any `git push` to `main` auto-redeploys.

### Local testing (optional)

```bash
npm install -g vercel
npm install
cp .env.example .env   # fill in real values
vercel dev
```
Then open `http://localhost:3000`.

---

## How it's faster than the old Apps Script version

- **No Apps Script cold-start / execution overhead.** Apps Script web apps have
  noticeable per-request startup latency; these are lightweight Vercel functions.
- **Direct Sheets API `values.get` call** on just the one tab, instead of Apps
  Script iterating `getDataRange()` server-side.
- **Same compact-array wire format** you already had (not repeating column
  names on every row), so the payload size for 20k+ rows is unchanged/small.
- **A short server-side cache** (45s) on `/api/data` means repeated loads within
  that window are near-instant instead of re-hitting the Sheets API.
- Static frontend is served from Vercel's CDN, so the page itself loads fast
  worldwide.

## Notes & limits

- **Row-hint save-back**: same logic as your old `updateRemark` — tries the
  cached row number first, re-verifies the VIN, and falls back to a full VIN-column
  scan if the sheet was reordered/edited in between.
- **Cache is per warm serverless instance**, not shared globally — in the rare
  case two people edit at almost the same moment, one might briefly see a
  45-second-old view until they refresh. Click **Refresh** any time to bypass
  the cache immediately.
- **Password protection is intentionally simple** (single shared password,
  12-hour session token, no per-user accounts). If you later want individual
  logins or an audit trail of who edited what, that's a bigger step up (e.g.
  Google OAuth) — happy to help with that when you're ready.
- If you ever want to fully retire the old Apps Script webhook too (the one
  handling ENQUIRY_BOT/VEHICLES_BOT/etc. `append`), that's a separate, larger
  migration since bots would need to call the Sheets API (or this same
  backend) instead — let me know if you want that built too.
