# Wedding Live Photo Wall 💒📸

A live photo-sharing wall for a wedding. Guests scan a QR code on the
projector screen to upload photos from their phones/DSLRs — or leave a short
text **blessing**. New photos and blessings appear on the big screen in real
time on an **auto-scrolling** wall, and everyone can browse the full gallery.
Photos and blessings auto-delete after 1 week.

- **Platform:** Firebase (Hosting + Firestore + Cloud Storage + Cloud Functions)
- **Project:** `wedding-photo-wall-3ace4`
- **Region:** `asia-southeast1` (Singapore)

---

## What's in here

```
wedding-app/
├─ firebase.json            # Hosting + Functions + rules config
├─ .firebaserc              # Links to the wedding-photo-wall-3ace4 project
├─ firestore.rules          # DB: public read, backend-only writes
├─ storage.rules            # Storage: image uploads ≤50MB, public read of /processed
├─ firestore.indexes.json   # (empty — single-field index is automatic)
├─ cors.json                # Storage bucket CORS (for the gallery Save Photo fetch)
├─ functions/
│  ├─ index.js              # processUpload, cleanupExpired, deletePhoto, postBlessing, setGuard, budgetGuard
│  └─ package.json          # sharp + heic-convert deps
└─ public/                  # The guest + projector web pages (deployed to Hosting)
   ├─ index.html            # Guest UPLOAD page (QR lands here)
   ├─ gallery.html          # Guest GALLERY (all photos + blessings)
   ├─ blessing.html         # Guest LEAVE-A-BLESSING page (text message)
   ├─ wall.html             # Projector auto-scrolling LIVE WALL + QR
   ├─ css/styles.css
   └─ js/
      ├─ firebase-init.js   # Shared config + constants
      ├─ upload.js
      ├─ gallery.js
      ├─ blessing.js
      ├─ guard.js           # Shared cost-guard listener + banner
      └─ wall.js
```

---

## How the data flows

1. Guest uploads an original → `/uploads/` in Cloud Storage.
2. `processUpload` fires automatically: converts HEIC→JPEG, makes a ~400KB
   thumbnail + a high-quality ~5MB display version into `/processed/`,
   deletes the bulky original, and creates a `photos` doc in Firestore.
   - **Blessings** take a different path: the `postBlessing` function validates
     the text (≤25 words) and creates a `type:"blessing"` doc — no image pipeline.
3. The **wall** (auto-scrolling, up to `WALL_MAX_FRAMES` newest frames) and the
   **gallery** (all, paginated) subscribe to `photos` and update live via
   Firestore listeners. Blessings render as auto-scaled text "note" cards.
4. `cleanupExpired` runs hourly and deletes photos/blessings (docs + any files)
   older than 1 week.

---

## Deploy (one-time setup, then `deploy`)

> Requires the Firebase CLI (already installed) and the **Blaze** plan
> (already enabled — needed for Cloud Functions).

From the `wedding-app/` directory:

```bash
# 1. Log in (opens a browser to authenticate your Google account)
firebase login

# 2. (Deps are already installed, but if you cloned fresh:)
cd functions && npm install && cd ..

# 3. Deploy EVERYTHING (rules, functions, hosting)
firebase deploy
```

To deploy only part of it:

```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules,storage
```

After deploy, the CLI prints your **Hosting URL**, e.g.:

```
Hosting URL: https://wedding-photo-wall-3ace4.web.app
```

- **Projector wall:** open `…/wall.html` on the projector's browser, press **F11** for fullscreen.
- **Guest upload:** the QR on the wall points to `…/index.html` automatically.
- **Gallery / blessings:** guests tap **Live Gallery** (`…/gallery.html`) or **Share your well-wishes** (`…/blessing.html`) from the nav buttons.

---

## Local testing with the Firebase Emulators (optional)

You can run everything locally without touching production:

```bash
firebase emulators:start
```

Then open the Hosting emulator URL it prints (default `http://localhost:5000`).
Uploads, functions, Firestore and Storage all run locally.

> Note: HEIC conversion + `sharp` run in the Functions emulator, so you can
> test the full pipeline offline. The emulator UI (default `localhost:4000`)
> lets you watch Firestore docs and Storage files appear.

---

## Customisation cheatsheet

| Want to change… | Edit… |
|-----------------|-------|
| Couple names / date | `public/*.html` (headings) |
| Colours / branding | `:root` variables at top of `public/css/styles.css` |
| Guest nav button labels | `public/index.html`, `gallery.html`, `blessing.html` |
| Max frames on the (auto-scrolling) wall | `WALL_MAX_FRAMES` in `public/js/firebase-init.js` |
| Wall auto-scroll speed | `SCROLL_SPEED_PX_PER_SEC` in `public/js/wall.js` |
| Blessing word/char limits (25 / 200 / 24) | `BLESSING_*` in `firebase-init.js` **and** `functions/index.js` |
| Max upload size (currently 50MB) | `MAX_UPLOAD_BYTES` in `firebase-init.js` **and** `storage.rules` |
| Compression quality/size | `DISPLAY_*` / `THUMB_*` constants in `functions/index.js` |
| Retention (currently 1 week / 168h) | `RETENTION_HOURS` in `functions/index.js` |

---

## Cost & safety

- Expected total cost for the event: **well under US$1** (see the brainstorming notes).
- **Set a budget alert** in the Google Cloud console (e.g. US$10) as a safety net.
- All uploads are validated both client-side and by `storage.rules`.
- Clients can only **read** the photo feed — all writes go through the trusted
  Cloud Function, preventing spoofed/malicious documents.

---

## Pre-wedding checklist

- [ ] `firebase deploy` succeeds with no errors.
- [ ] Open `wall.html` on the projector; QR renders.
- [ ] Scan the QR with a phone → upload page opens.
- [ ] Upload a JPG → appears on the wall within seconds.
- [ ] Upload an **iPhone HEIC** → converts and appears (key test!).
- [ ] Upload a >50MB file → politely rejected.
- [ ] Leave a **blessing** (with a name) → appears as a text card on the wall + gallery.
- [ ] Try a blessing over 25 words → the counter blocks sending.
- [ ] With 16+ frames on the wall, it **auto-scrolls** and loops back to the top.
- [ ] Gallery shows all photos/blessings; tap → enlarge + download (photos) works.
- [ ] Budget alert configured in Google Cloud console.
- [ ] **Cost guard:** admin **🔒 Pause / 🔓 Resume** toggles the paused banner + disables uploads/downloads (see `DEPLOYMENT.md` → Testing & verification).
- [ ] Budget connected to the `budget-alerts` Pub/Sub topic (auto-lock at S$25).
```
