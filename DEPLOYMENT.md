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

## Troubleshooting

| Problem | Fix |
|---|---|
| `firebase: command not found` | Open a **new** terminal window (PATH only updates in new sessions after install), or run `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")` in the current one |
| `sharp`/build errors on deploy or emulator start | Delete `functions/node_modules`, run `npm install` again inside `functions/` |
| Deploy asks to enable APIs | Answer **Yes** |
| Changes not showing in browser | Hard refresh (Ctrl+Shift+R) and confirm you bumped the `?v=` query string |
| Wrong Google account logged into CLI | `firebase logout` then `firebase login` with `timothygoh.ey@gmail.com` |
