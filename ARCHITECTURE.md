# Architecture — Wedding Live Photo Wall

A live photo-sharing wall for a wedding. Guests scan a QR code to upload
photos from their phones/cameras; new photos appear on a projector screen in
real time, and everyone can browse the full gallery. Photos auto-delete
after 24 hours.

- **Firebase project:** `wedding-photo-wall-3ace4`
- **Region:** `asia-southeast1` (Singapore) — chosen to keep functions close to the Firestore/Storage data

---

## Live links

| Page | URL | Audience |
|---|---|---|
| Guest upload | https://wedding-photo-wall-3ace4.web.app | Guests (QR code lands here) |
| Projector live wall | https://wedding-photo-wall-3ace4.web.app/wall | Public display, shown on the projector |
| Gallery | https://wedding-photo-wall-3ace4.web.app/gallery | Guests browsing/downloading all photos |
| Admin (delete photos) | https://wedding-photo-wall-3ace4.web.app/gallery?admin=megumi-timothy-8826-admin | Private — moderators only |

---

## Languages & technologies

| Layer | Technology |
|---|---|
| Frontend | Vanilla **HTML5**, **CSS3**, **JavaScript (ES modules)** — no framework/build step |
| Frontend Firebase SDK | Firebase JS SDK v10 (modular), loaded directly from Google's CDN (`gstatic.com`) |
| Backend | **Node.js 20**, JavaScript (ES modules), deployed as **Cloud Functions (2nd gen)** |
| Image processing | `sharp` (resize/compress/re-encode, native binary) + `heic-convert` (iPhone HEIC → JPEG) |
| Database | **Firestore** (NoSQL document store) — one `photos` collection |
| File storage | **Cloud Storage for Firebase** — raw uploads + processed images |
| Hosting | **Firebase Hosting** (static file CDN + rewrites/cache headers) |
| Security | Firestore Security Rules + Storage Security Rules (declarative rules DSL, `rules_version = '2'`) |
| Tooling | Firebase CLI (deploy, emulators, logs) |

No server framework (Express, etc.) is used — each Cloud Function is a standalone event-driven handler. No frontend framework (React, Vue, etc.) is used — the three HTML pages each load plain JS modules directly.

---

## Project layout

```
wedding-app/
├─ firebase.json            # Hosting + Functions + emulator config
├─ .firebaserc              # Links this folder to the wedding-photo-wall-3ace4 project
├─ firestore.rules          # DB: public read, backend-only writes
├─ storage.rules            # Storage: guest uploads ≤50MB, public read of /processed
├─ firestore.indexes.json   # (empty — the one query used needs no composite index)
├─ functions/
│  ├─ index.js              # processUpload, cleanupExpired, deletePhoto
│  └─ package.json          # firebase-admin, firebase-functions, sharp, heic-convert
└─ public/                  # Static site deployed to Hosting
   ├─ index.html             # Guest UPLOAD page
   ├─ gallery.html           # Guest GALLERY (+ hidden admin mode via ?admin=)
   ├─ wall.html              # Projector LIVE WALL + QR code
   ├─ css/styles.css
   └─ js/
      ├─ firebase-init.js    # Shared Firebase config + app-wide constants
      ├─ upload.js           # Client-side validation + resumable upload
      ├─ gallery.js          # Gallery grid + admin delete calls
      └─ wall.js             # Live wall grid (Firestore listener, limit 15)
```

---

## Data flow

```
Guest's phone                Cloud Storage           Cloud Function            Firestore              Browsers
──────────────                ────────────           ──────────────            ─────────              ────────
upload.js
  └─ uploadBytesResumable ──▶ /uploads/{file}
                                    │
                                    ▼ (onObjectFinalized trigger)
                              processUpload()
                                - download original
                                - HEIC → JPEG (heic-convert), if needed
                                - resize + compress (sharp):
                                    thumb  ≤800px,  q72
                                    display ≤3200px, q88
                                - upload both  ──────────▶ /processed/{file}_thumb.jpg
                                                            /processed/{file}_display.jpg
                                - create doc  ───────────────────────────────▶ photos/{id}
                                - delete original from /uploads/
                                                                                    │
                                                                                    ▼ (onSnapshot listener)
                                                                        wall.js (limit 15) / gallery.js (all)
                                                                        render live as new docs arrive
```

Two supporting functions:
- **`cleanupExpired`** — runs on a schedule (hourly). Deletes any `photos` doc (and its two Storage files) older than `RETENTION_HOURS` (24h), keeping storage near-empty and the event self-cleaning.
- **`deletePhoto`** — callable function used by the gallery's hidden admin mode (`?admin=<key>`). Requires the secret `ADMIN_KEY`; deletes the Firestore doc + both processed files immediately so moderators can remove inappropriate photos live.

---

## Security model

Clients (guests' browsers) never write directly to Firestore or to
`/processed/` in Storage — only the trusted backend (Cloud Functions, using
the Admin SDK, which bypasses rules) can do that. This prevents guests from
spoofing photo documents or injecting arbitrary files into the public feed.

**Firestore (`firestore.rules`):**
- `photos/{photoId}`: anyone can **read** (drives the wall/gallery); **create/update/delete is denied** for clients — only the backend writes.

**Storage (`storage.rules`):**
- `/uploads/{fileName}`: anyone can **create** (upload) an image ≤50MB; **no read** (originals are transient and deleted right after processing).
- `/processed/{fileName}`: anyone can **read** (wall/gallery display these); **write is denied** for clients — only the backend writes.
- Everything else: denied by default.

**Admin deletion** is protected by a shared-secret string (`ADMIN_KEY` in `functions/index.js`) passed as a query param/callable argument — not real user authentication. It's "good enough" for a single-event, trusted-guest-list context, but the key must stay out of anything guests can see (see `DEPLOYMENT.md` for the current admin link).

---

## Cost & scale notes

- Designed for a single event's worth of traffic (hundreds of photos, one evening) — expected cost is well under US$1 on Firebase's Blaze (pay-as-you-go) plan, which is required for Cloud Functions.
- The hourly cleanup function keeps storage/Firestore small indefinitely, so the project is safe to leave deployed and forgotten after the event.
