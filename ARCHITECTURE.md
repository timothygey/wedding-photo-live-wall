# Architecture — Wedding Live Photo Wall

A live photo-sharing wall for a wedding. Guests scan a QR code to upload
photos from their phones/cameras — or leave a short text **blessing** — and
they appear on a projector screen in real time, with everyone able to browse
the full gallery. Photos and blessings auto-delete after 1 week.

- **Firebase project:** `wedding-photo-wall-3ace4`
- **Region:** `asia-southeast1` (Singapore) — chosen to keep functions close to the Firestore/Storage data

---

## Live links

| Page | URL | Audience |
|---|---|---|
| Guest upload | https://wedding-photo-wall-3ace4.web.app | Guests (QR code lands here) |
| Leave a blessing | https://wedding-photo-wall-3ace4.web.app/blessing | Guests posting a text message |
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
│  ├─ index.js              # processUpload, cleanupExpired, deletePhoto, postBlessing
│  └─ package.json          # firebase-admin, firebase-functions, sharp, heic-convert
└─ public/                  # Static site deployed to Hosting
   ├─ index.html             # Guest UPLOAD page
   ├─ gallery.html           # Guest GALLERY (+ hidden admin mode via ?admin=)
   ├─ wall.html              # Projector LIVE WALL + QR code
   ├─ blessing.html          # Guest LEAVE-A-BLESSING page (text message)
   ├─ css/styles.css
   └─ js/
      ├─ firebase-init.js    # Shared Firebase config + app-wide constants
      ├─ upload.js           # Client-side validation + resumable upload
      ├─ gallery.js          # Gallery grid + admin delete calls
      ├─ blessing.js         # Blessing form: live word limiter + postBlessing call
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

Three supporting functions:
- **`cleanupExpired`** — runs on a schedule (hourly). Deletes any `photos` doc (and its two Storage files, if any) older than `RETENTION_HOURS` (currently 168h = 1 week), keeping storage small and the event self-cleaning.
- **`deletePhoto`** — callable function used by the gallery's hidden admin mode (`?admin=<key>`). Requires the secret `ADMIN_KEY`; deletes the Firestore doc + both processed files immediately so moderators can remove inappropriate photos (or blessings) live.
- **`postBlessing`** — callable function behind the blessing page. Validates a short text message server-side (≤30 words, ≤200 chars; optional name ≤24 chars) and writes a `type: "blessing"` doc via the Admin SDK. No Storage files are involved.

See **Blessings** below for how text messages share the same collection, listeners, retention, and admin tooling as photos.

---

## Security model

Clients (guests' browsers) never write directly to Firestore or to
`/processed/` in Storage — only the trusted backend (Cloud Functions, using
the Admin SDK, which bypasses rules) can do that. This prevents guests from
spoofing photo documents or injecting arbitrary files into the public feed.

**Firestore (`firestore.rules`):**
- `photos/{photoId}`: anyone can **read** (drives the wall/gallery); **create/update/delete is denied** for clients — only the backend writes. This applies to both photo docs and blessing docs: blessings are created only through the trusted `postBlessing` function, so guests can't inject arbitrary/spoofed messages.

**Storage (`storage.rules`):**
- `/uploads/{fileName}`: anyone can **create** (upload) an image ≤50MB; **no read** (originals are transient and deleted right after processing).
- `/processed/{fileName}`: anyone can **read** (wall/gallery display these); **write is denied** for clients — only the backend writes.
- Everything else: denied by default.

**Admin deletion** is protected by a shared-secret string (`ADMIN_KEY` in `functions/index.js`) passed as a query param/callable argument — not real user authentication. It's "good enough" for a single-event, trusted-guest-list context, but the key must stay out of anything guests can see (see `DEPLOYMENT.md` for the current admin link).

---

## Photo retention & auto-delete

**How the retention timer works** (currently set to 168h = 1 week)

- Each photo's lifetime is tied to a single field on its Firestore doc: `uploadedAt`.
  It's set with a **server timestamp at the moment `processUpload` finishes and
  creates the doc** — i.e. a few seconds *after* the guest's upload lands and the
  image has been converted/resized. It is **per-photo**, not a global timer, and
  does **not** start when the guest first taps upload.
- A scheduled function, `cleanupExpired`, runs **every 60 minutes**. Each run
  deletes any photo whose `uploadedAt` is older than `RETENTION_HOURS` (currently
  **168** = 1 week): it removes the thumbnail file, the display file (Storage), and the
  Firestore doc. Removing the doc makes the photo vanish from the wall + gallery
  automatically (their live listeners react to the removal).
- **Practical nuance:** because cleanup runs hourly rather than continuously, a
  photo is deleted on the **next hourly sweep after it crosses the retention
  window** — so in practice, at the current 168h setting, a photo lives
  **between 168 and ~169 hours** (and, more generally, up to ~59 min beyond
  whatever `RETENTION_HOURS` is set to).
- The bulky **original** in `/uploads/` is deleted **immediately** after
  processing — it is *not* part of the retention window; only the processed
  thumbnail + display versions are.
- A **failed** upload (errored during processing, so no doc was ever created) is
  not tracked by `cleanupExpired`; the orphaned original just sits privately in
  `/uploads/` (not readable by anyone).

**Changing the retention window**

Edit the single constant `RETENTION_HOURS` in `functions/index.js`, then
`firebase deploy --only functions`. Examples: `24` = 1 day, `72` = 3 days,
`168` = 1 week (the current setting).

**What a longer window costs** (e.g. 24h → 168h / 1 week)

Longer retention does **not** change how many photos exist — only how long they
sit in storage. So the guaranteed extra cost is tiny:

- **Storage volume — a few cents.** Storage is billed per GB-month (~$0.026/GB/mo
  in `asia-southeast1`). A busy wedding of ~3,000 photos ≈ ~9 GB (thumbnail +
  display). Held 1 day ≈ **$0.008**; held 7 days ≈ **$0.055**. So extending to a
  full week costs roughly **5 cents**.
- **Download bandwidth — variable, demand-driven.** Keeping photos alive longer
  gives guests more time to view/download them. Egress is ~$0.12/GB — this is the
  same per-view cost paid whenever anyone loads an image, not a penalty of
  retention itself, but a longer window creates more opportunity for it. Heavy
  full-res downloading over the week could add a few dollars; light browsing far
  less.
- **Functions & Firestore — no change.** `cleanupExpired` runs hourly regardless,
  and the doc storage is trivial.

**Bottom line:** extending retention to a week is essentially free (pennies of
storage); the only way it becomes a few dollars is if the extra days drive a lot
more full-res downloading.

---

## Blessings (guest text messages)

Guests can post a short **text blessing** instead of (or as well as) a photo,
via the `blessing.html` page. Blessings live in the **same `photos` collection**
as photos, distinguished by a `type: "blessing"` field, so they automatically
flow through the existing live listeners, retention cleanup, and admin delete —
no separate collection or pipeline.

**Document shape**

| Field | Photo doc | Blessing doc |
|---|---|---|
| `type` | absent / `"photo"` | `"blessing"` |
| `thumbnailURL` / `displayURL` / `thumbPath` / `displayPath` | set | *absent* |
| `message` | — | the blessing text |
| `from` | — | optional name (may be empty) |
| `uploadedAt`, `status` | set | set |

**Flow:** `blessing.js` (live word counter + limiter) → `postBlessing` callable
(validates, Admin SDK writes the doc) → the wall + gallery listeners render it.
Because there are no Storage files, `cleanupExpired` and `deletePhoto` simply
skip the file deletions (guarded by `if (data.displayPath)`), delete the doc,
and it disappears everywhere.

**Word limit — why 30.** The wall auto-scales each blessing's text to fit its
frame. A frame is ~280×340px on a 1080p projector, so past ~30 words the
auto-fit font drops below ~24px — too small to read across a room. 30 words
keeps short messages large and long ones still legible. It's also
forward-compatible with a future **auto-scroll** wall: moving text is harder to
read and each frame has limited on-screen dwell time, so a tight cap stays
right (a 30-word blessing needs ~15s of readable dwell at ~120 wpm). Limits live
in `firebase-init.js` (`BLESSING_WORD_LIMIT` / `BLESSING_CHAR_LIMIT` /
`BLESSING_NAME_LIMIT`) for the client **and** are re-enforced in `postBlessing`.

**Rendering**
- **Wall:** a cream serif "note" card; JS (`fitBlessing`) binary-searches the
  font size to fill the frame while leaving margin for the **same Ken Burns
  zoom/drift** as photos, so the words never clip. Text is refit on viewport
  resize.
- **Gallery:** an auto-fit text cell; tapping it opens the message enlarged in
  the lightbox (no download button).
- Rendered with `textContent` (never `innerHTML`), so a blessing can't inject
  markup/script.

---

## Cost & scale notes

- Designed for a single event's worth of traffic (hundreds of photos, one evening) — expected cost is well under US$1 on Firebase's Blaze (pay-as-you-go) plan, which is required for Cloud Functions.
- The hourly cleanup function keeps storage/Firestore small indefinitely, so the project is safe to leave deployed and forgotten after the event.
