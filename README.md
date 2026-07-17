# � Migration Guide — Moving the Wedding Photo Wall to a New Laptop

This guide ports the **entire** Wedding Live Photo Wall project to a new
computer so you can keep deploying changes. No Git / GitHub required.

- **Firebase project:** `wedding-photo-wall-3ace4`
- **Live site:** https://wedding-photo-wall-3ace4.web.app
- **New location:** `C:\Users\timmy\Desktop\Coding\wedding-app`

> ⚠️ Your live app keeps running the entire time. Migrating laptops only
> moves your ability to *deploy changes* — it never affects the running site.

---

## What travels vs. what gets re-created

| Travels in the ZIP ✅ | Re-created on new laptop ♻️ | Never copy ❌ |
|----------------------|----------------------------|---------------|
| All source code (`public/`, `functions/*.js`) | `functions/node_modules/` (via `npm install`) | `functions/node_modules/` |
| `firebase.json`, `.firebaserc` | Firebase CLI login (via `firebase login`) | Old CLI auth tokens |
| `firestore.rules`, `storage.rules`, indexes | Firebase CLI + Node.js install | — |
| `firebaseConfig` + admin key (already in code) | — | — |

**Why not copy `node_modules`?** It contains `sharp`, which has **compiled
native binaries built for the old machine**. Copying it across machines often
breaks. Running `npm install` on the new laptop rebuilds it correctly.

---

## PART A — On the OLD laptop (this one)

1. **(Optional) Log out of the Firebase CLI** to tidy up access:
   ```bash
   firebase logout
   ```
2. **ZIP the project excluding node_modules** (already done for you — see the
   generated `wedding-app.zip` on the Desktop). If you need to recreate it:
   ```bash
   cd /home/tgoha/Desktop
   zip -r wedding-app.zip wedding-app -x "wedding-app/functions/node_modules/*"
   ```
3. **Transfer the ZIP** to the new laptop via any of:
   - Email it to yourself through **Outlook** (attach `wedding-app.zip`).
   - Upload to **OneDrive / Google Drive**, download on the new laptop.
   - Copy to a **USB stick**.

---

## PART B — On the NEW laptop (`C:\Users\timmy\Desktop\Coding`)

### 1. Install prerequisites (one-time)

| Tool | How |
|------|-----|
| **Node.js v20+** | Download the LTS installer from https://nodejs.org and run it |
| **Firebase CLI** | In a terminal: `npm install -g firebase-tools` |

Verify (in PowerShell):
```powershell
node --version        # should print v20.x or newer
firebase --version    # should print a version number
```

### 2. Unzip the project into the Coding folder

Place `wedding-app.zip` in `C:\Users\timmy\Desktop\Coding`, right-click →
**Extract All**. You should end up with:
```
C:\Users\timmy\Desktop\Coding\wedding-app\
```

### 3. Reinstall the functions dependencies (rebuilds `sharp`)

```powershell
cd C:\Users\timmy\Desktop\Coding\wedding-app\functions
npm install
cd ..
```

### 4. Log in to Firebase

```powershell
firebase login
```
Sign in with the **same Google account** that owns the project
(`timothygoh.ey@gmail.com`). Approve access in the browser.

### 5. Confirm the project link

```powershell
firebase projects:list
```
You should see `wedding-photo-wall-3ace4`. It's already set as the default in
[`.firebaserc`](.firebaserc), so no extra config needed.

### 6. Deploy to confirm everything works

```powershell
firebase deploy
```
Expect `✔ Deploy complete!` and the Hosting URL. That confirms the new laptop
is fully wired up.

> First deploy on a new machine may show harmless warnings (Node runtime
> deprecation, firebase-functions version). These don't block deployment.

---

## Everyday commands (once set up)

From `C:\Users\timmy\Desktop\Coding\wedding-app`:

```powershell
firebase deploy --only hosting     # after editing HTML/CSS/JS in public/
firebase deploy --only functions   # after editing functions/index.js
firebase deploy                    # deploy everything
firebase functions:log             # view function logs
```

> Reminder: when you change CSS/JS, bump the `?v=N` number in the HTML files
> (e.g. `styles.css?v=4` → `?v=5`) so browsers load the fresh version.

---

## Key facts to keep handy

| Item | Value |
|------|-------|
| Firebase project ID | `wedding-photo-wall-3ace4` |
| Live wall URL | https://wedding-photo-wall-3ace4.web.app/wall |
| Guest upload URL | https://wedding-photo-wall-3ace4.web.app |
| Gallery URL | https://wedding-photo-wall-3ace4.web.app/gallery |
| Admin delete URL | https://wedding-photo-wall-3ace4.web.app/gallery?admin=megumi-timothy-8826-admin |
| Region | `asia-southeast1` (Singapore) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `firebase: command not found` | Re-run `npm install -g firebase-tools`; reopen the terminal |
| `sharp`/build errors on deploy | Delete `functions/node_modules`, run `npm install` again |
| Deploy asks to enable APIs | Answer **Yes** (first deploy on a new machine may re-check) |
| Wrong Google account | `firebase logout` then `firebase login` with the correct account |
| Changes not showing in browser | Hard refresh (Ctrl+Shift+R) and bump the `?v=` query in HTML |

---

## Safe to decommission the old laptop when…

- [ ] `wedding-app.zip` transferred and unzipped on the new laptop.
- [ ] `npm install` succeeded in `functions/` on the new laptop.
- [ ] `firebase login` done on the new laptop.
- [ ] A test `firebase deploy` from the new laptop succeeded.
- [ ] (Optional) `firebase logout` run on the old laptop.

Once all boxes are ticked, the old laptop is no longer needed — everything
lives in the ZIP + the cloud project.
