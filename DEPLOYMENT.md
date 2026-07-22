# Deploy & Manage — Wedding Live Photo Wall

Quick reference for pushing changes to the live site once your laptop is
already set up (Node.js, Firebase CLI, `firebase login` done — see
`MIGRATION.md` if you're starting fresh on a new machine).

- **Firebase project:** `wedding-photo-wall-3ace4`
- **Working directory for all commands below:** `C:\Users\timmy\Desktop\Coding\wedding-app`

---

## Everyday workflow

1. Edit files:
   - Frontend → `public/index.html`, `public/gallery.html`, `public/wall.html`, `public/css/styles.css`, `public/js/*.js`
   - Backend → `functions/index.js`
2. If you changed CSS or JS, bump the `?v=N` query string in the `<link>`/`<script>` tags of whichever HTML file loads it (e.g. `styles.css?v=4` → `?v=5`). Browsers cache these files for 60 seconds (`firebase.json` header rule), so bumping the version forces a fresh load.
3. Deploy (pick the narrowest command that covers your change — faster and safer than deploying everything):

```powershell
firebase deploy --only hosting              # HTML/CSS/JS changes only
firebase deploy --only functions            # functions/index.js changes only
firebase deploy --only firestore:rules,storage   # firestore.rules / storage.rules changes only
firebase deploy                             # everything (rules + functions + hosting)
```

4. Confirm: the CLI prints `✔ Deploy complete!` and the Hosting URL. Hard-refresh the page you changed (Ctrl+Shift+R) to bypass any stale cache.

---

## Useful commands

| Command | Purpose |
|---|---|
| `firebase deploy` | Deploy everything |
| `firebase deploy --only hosting` | Deploy frontend only |
| `firebase deploy --only functions` | Deploy Cloud Functions only |
| `firebase deploy --only firestore:rules,storage` | Deploy security rules only |
| `firebase functions:log` | Tail/view Cloud Function logs (errors, HEIC conversion issues, etc.) |
| `firebase projects:list` | Confirm you're linked to `wedding-photo-wall-3ace4` |
| `firebase login` | (Re-)authenticate the CLI with your Google account |
| `firebase logout` | Sign the CLI out (e.g. before decommissioning a laptop) |
| `firebase emulators:start` | Run hosting + functions + Firestore + Storage locally, without touching production — see below |

---

## Local testing before you deploy (optional but recommended for functions changes)

```powershell
firebase emulators:start
```

Opens the Hosting emulator (default `http://localhost:5000`) and an Emulator UI (default `http://localhost:4000`) where you can watch Firestore docs and Storage files appear as you test uploads. HEIC conversion and `sharp` both run in the Functions emulator, so the full pipeline can be tested offline. Nothing here touches the live site or live data.

---

## Changing app behavior

| Want to change… | Edit… |
|---|---|
| Couple names / date / copy | `public/*.html` |
| Colours / branding | `:root` CSS variables at the top of `public/css/styles.css` |
| Guest nav button labels | `public/index.html`, `gallery.html`, `blessing.html` |
| Max frames kept on the (auto-scrolling) wall (currently 120) | `WALL_MAX_FRAMES` in `public/js/firebase-init.js` |
| Wall auto-scroll speed (px/sec) | `SCROLL_SPEED_PX_PER_SEC` in `public/js/wall.js` |
| Max upload size (currently 50MB) | `MAX_UPLOAD_BYTES` in `firebase-init.js` **and** the matching limit in `storage.rules` |
| Compression quality/size | `THUMB_*` / `DISPLAY_*` constants in `functions/index.js` |
| Photo retention window (currently 1 week / 168h) | `RETENTION_HOURS` in `functions/index.js` |
| Blessing word/char limits (currently 25 words / 200 chars / 24-char name) | `BLESSING_WORD_LIMIT` etc. in `firebase-init.js` **and** the matching constants in `functions/index.js` |
| Admin delete key | `ADMIN_KEY` in `functions/index.js` — redeploy functions after changing, and update anyone who uses the admin link |

Any change to `functions/index.js` requires `firebase deploy --only functions`. Any change to `storage.rules`/`firestore.rules` requires the rules deploy command. Frontend-only changes only need `--only hosting`.

---

## Live links

| Page | URL |
|---|---|
| Guest upload | https://wedding-photo-wall-3ace4.web.app |
| Leave a blessing | https://wedding-photo-wall-3ace4.web.app/blessing |
| Projector live wall | https://wedding-photo-wall-3ace4.web.app/wall |
| Gallery | https://wedding-photo-wall-3ace4.web.app/gallery |
| Admin (delete photos/blessings) | https://wedding-photo-wall-3ace4.web.app/gallery?admin=megumi-timothy-8826-admin — **keep private**, anyone with this link can delete photos |

---

## Cost guard (auto/manual "pause")

A Firestore flag (`config/guard`) can disable the cost-incurring features
(uploads, blessings, full-res downloads) while the wall keeps scrolling. See
ARCHITECTURE.md → "Cost guard" for the design. Two ways to trip it:

**Manual (B) — no console needed.** Open the gallery admin URL
(`/gallery?admin=<key>`) and click **🔒 Pause sharing (cost guard)**. Click
**🔓 Resume sharing** to clear it. This is also how you clear an auto-lock.

**Automatic (A) — one-time Google Cloud Console setup** (the `budget-alerts`
Pub/Sub topic is created by deploying functions):

1. Google Cloud Console → **Billing → Budgets & alerts** → open your **S$25** budget → **Edit**.
2. Confirm the budget **currency is SGD** and the amount is **25**.
3. Under **Manage notifications**, tick **"Connect a Pub/Sub topic to this budget."**
4. Choose project **`wedding-photo-wall-3ace4`** and select the topic **`budget-alerts`**.
5. **Save.** (Google auto-grants the budget publish rights to the topic.)

To test A without spending money: publish a fake budget message to the topic —
Console → **Pub/Sub → Topics → `budget-alerts` → Messages → Publish**, body
`{"costAmount":25,"budgetAmount":25,"currencyCode":"SGD"}`. The guard should
lock within seconds; clear it from the admin toggle.

> The auto-lock fires a few hours after spend *actually* crosses S$25 (budget
> data lags), and never un-locks on its own — clear it manually when safe.

---

## Photo downloads (Storage CORS)

The gallery's **Save Photo** button fetches the image as a blob, then branches
by platform — because a plain `<a download>` is ignored for the cross-origin
Storage URL (that was the "opens a white page" bug):

- **iOS:** Web Share sheet → **Save Image** → Photos (a blob download just
  opens the image in Safari, so share is the only reliable path).
- **Android + desktop:** a **direct blob download** → saves to Downloads, which
  Samsung Gallery / Google Photos / etc. then show. (Android's share sheet is
  app-to-app with no reliable "save to Gallery", so we skip it there.)

This requires **CORS** on the Storage bucket so the browser can `fetch()` the
image. Config is in `cors.json` (repo root). **One-time** apply:

```bash
# Needs gsutil (Google Cloud SDK). No gsutil? Run it in Cloud Shell at
# console.cloud.google.com (project wedding-photo-wall-3ace4) — upload cors.json first.
gsutil cors set cors.json gs://wedding-photo-wall-3ace4.firebasestorage.app
gsutil cors get gs://wedding-photo-wall-3ace4.firebasestorage.app   # verify
```

`cors.json` only allows **GET** from the site's own origins. If Save silently
fails on mobile (or just opens the image in a tab), CORS isn't applied yet —
re-run the command.

---

## Testing & verification

Recipes to re-confirm the key backend features (all verified **2026-07-18**).
Callables live at `https://asia-southeast1-wedding-photo-wall-3ace4.cloudfunctions.net/<name>`.
`K` below is the admin key.

### Cost guard — manual toggle (B)  ✅ verified
- **In the app:** open `/gallery?admin=<key>` → **🔒 Pause sharing** → guest pages show the banner and disable uploads / well-wishes / downloads; **🔓 Resume sharing** clears it.
- **Via CLI:**
  ```bash
  K=megumi-timothy-8826-admin
  # wrong key → rejected
  curl -s -XPOST .../setGuard -H 'Content-Type: application/json' \
    -d '{"data":{"locked":true,"adminKey":"nope"}}'
  #   → {"error":{... "PERMISSION_DENIED", "Invalid admin key."}}
  # lock, then unlock (ALWAYS finish unlocked)
  curl -s -XPOST .../setGuard -H 'Content-Type: application/json' \
    -d "{\"data\":{\"locked\":true,\"adminKey\":\"$K\"}}"   #  → {"result":{"success":true,"locked":true}}
  curl -s -XPOST .../setGuard -H 'Content-Type: application/json' \
    -d "{\"data\":{\"locked\":false,\"adminKey\":\"$K\"}}"  #  → locked:false
  ```

### Cost guard — automatic budget trip (A)  ✅ verified
1. Publish a fake budget message to the `budget-alerts` topic (Pub/Sub → Topics → Publish):
   `{"costAmount":25,"budgetAmount":25,"currencyCode":"SGD"}`
2. Confirm it fired: `firebase functions:log --only budgetGuard` — expect:
   ```
   Budget alert: cost=25 budget=25 SGD
   Cost 25SGD >= 25 → cost guard LOCKED.
   ```
   (A *real* budget notification logs `cost=0 … SGD` and correctly does nothing, which also confirms the live budget→topic link.)
3. Guest pages show the paused banner → **clear the lock** via the admin Resume button (or the `setGuard` unlock above).

### Device checks (mobile — can't be covered by CLI)  ✅ verified
Open the site on a real phone and check both platform-specific paths:

| Action | iOS (Safari/Chrome) | Android (Chrome) |
|---|---|---|
| **Take Photo** (upload page) | Camera opens directly | Camera opens directly — **the bug this fixes**: a single multi-file input opens the Google Photos picker with *no camera option* |
| **Choose from Library** | Photo library, multi-select | Picker, multi-select |
| **Save Photo** (gallery) | Share sheet → **Save Image** → Photos | Downloads → appears in Gallery (often a "Download" album) |

If Save silently does nothing, the bucket CORS isn't applied (see above). If the
camera won't open on Android, check that `cameraInput` still has the `capture`
attribute and wasn't merged back into the library input.

### Blessing validation (`postBlessing`)  ✅ verified
```bash
# 26 words (> 25) → rejected
curl -s -XPOST .../postBlessing -H 'Content-Type: application/json' \
  -d '{"data":{"message":"a a a a a a a a a a a a a a a a a a a a a a a a a a"}}'
#   → {"error":{... "Please keep it to 25 words or fewer."}}
# >200 chars → "Please keep it under 200 characters."
```
A valid blessing returns `{"result":{"success":true,"id":"…"}}` and appears on the wall/gallery. Delete test docs via the admin UI, or `deletePhoto` (needs `photoId` + admin key).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `firebase: command not found` | Open a **new** terminal window (PATH only updates in new sessions after install), or run `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")` in the current one |
| `sharp`/build errors on deploy or emulator start | Delete `functions/node_modules`, run `npm install` again inside `functions/` |
| Deploy asks to enable APIs | Answer **Yes** |
| Changes not showing in browser | Hard refresh (Ctrl+Shift+R) and confirm you bumped the `?v=` query string |
| Wrong Google account logged into CLI | `firebase logout` then `firebase login` with `timothygoh.ey@gmail.com` |
