// guard.js — shared "cost guard" for the guest pages.
// Watches the config/guard flag (set by the budgetGuard function at the
// budget threshold, or manually via the admin toggle). When locked, each page
// disables the features that would incur further cost and shows a banner.
// The live wall is intentionally NOT guarded — it keeps scrolling.

import { db } from "./firebase-init.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Subscribe to the guard flag. Calls callback(locked) now and on every change.
// Fails OPEN (locked = false) on a read error so guests are never blocked by a
// transient glitch.
export function watchGuard(callback) {
  const ref = doc(db, "config", "guard");
  onSnapshot(
    ref,
    (snap) => callback(snap.exists() && snap.data().locked === true),
    (err) => {
      console.warn("Guard listener error:", err);
      callback(false);
    }
  );
}

// Show/hide a one-line banner at the top of the page content.
let bannerEl = null;
export function setBanner(show, text) {
  if (show) {
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.className = "guard-banner";
      const host = document.querySelector(".guest-wrap") || document.body;
      host.insertBefore(bannerEl, host.firstChild);
    }
    bannerEl.textContent = text;
    bannerEl.style.display = "block";
  } else if (bannerEl) {
    bannerEl.style.display = "none";
  }
}
