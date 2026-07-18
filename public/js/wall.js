// wall.js — the projector Live Wall (Option A).
// Subscribes to the latest N photos in real time and keeps the grid showing
// only the newest ones (older photos are pushed off the wall). Also renders
// a scannable QR code pointing at the guest upload page.

import { db, PHOTOS_COLLECTION, WALL_PHOTO_LIMIT } from "./firebase-init.js";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const grid = document.getElementById("grid");
const emptyState = document.getElementById("emptyState");

/* ---------- QR code ---------- */
// Points guests to the upload page on this same site. Using the current
// origin means it automatically works whether local, *.web.app, or a
// custom domain — no hard-coded URL to update.
const uploadUrl = new URL("index.html", window.location.href).href;

function renderQR(attempt = 0) {
  const container = document.getElementById("qrCanvas");
  if (!container) return;

  // qrcode-generator exposes a global `qrcode(typeNumber, errorLevel)`.
  if (typeof window.qrcode === "function") {
    const qr = window.qrcode(0, "M"); // type 0 = auto-size to fit data
    qr.addData(uploadUrl);
    qr.make();
    // createImgTag(cellSize, margin) returns an <img> that scales via CSS.
    container.innerHTML = qr.createImgTag(8, 0);
    const img = container.querySelector("img");
    if (img) {
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.imageRendering = "pixelated"; // crisp scaling on projector
    }
    return;
  }

  // Library not ready yet — retry briefly (CDN may still be loading).
  if (attempt < 20) {
    setTimeout(() => renderQR(attempt + 1), 150);
  } else {
    console.error("QR library failed to load.");
    container.textContent = "QR unavailable";
  }
}

window.addEventListener("load", () => renderQR());

/* ---------- Live photo feed (latest N) ---------- */
const rendered = new Map(); // id -> element

const q = query(
  collection(db, PHOTOS_COLLECTION),
  orderBy("uploadedAt", "desc"),
  limit(WALL_PHOTO_LIMIT)
);

onSnapshot(q, (snap) => {
  snap.docChanges().forEach((change) => {
    if (change.type === "added") {
      addPhoto(change.doc.id, change.doc.data());
    } else if (change.type === "removed") {
      removePhoto(change.doc.id);
    }
  });
  reorder(snap.docs.map((d) => d.id));
  updateEmptyState();
});

function addPhoto(id, data) {
  if (rendered.has(id)) return;
  const el = document.createElement("div");
  el.className = "photo";
  el.dataset.id = id;

  // Same Ken Burns start-phase offset for both photos and blessings.
  const delay = `-${(Math.random() * 16).toFixed(1)}s`;

  if (data.type === "blessing") {
    el.classList.add("blessing");
    const card = document.createElement("div");
    card.className = "blessing-card";
    card.style.animationDelay = delay;

    const quote = document.createElement("div");
    quote.className = "blessing-msg";
    quote.textContent = (data.message || "").trim();
    card.appendChild(quote);

    const fromText = (data.from || "").trim();
    if (fromText) {
      const from = document.createElement("div");
      from.className = "blessing-from";
      from.textContent = "— " + fromText;
      card.appendChild(from);
    }
    el.appendChild(card);
    // Fit once laid out — and AGAIN after the web font loads. Measuring with
    // the fallback serif (before "Cormorant Garamond" arrives) has different
    // metrics and picks the wrong, often far-too-small, size.
    requestAnimationFrame(() => fitBlessing(el));
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => fitBlessing(el));
    }
  } else {
    const img = document.createElement("img");
    img.src = data.thumbnailURL;
    img.alt = "Guest photo";
    img.style.animationDelay = delay;
    el.appendChild(img);
  }

  // Newest first.
  grid.insertBefore(el, grid.firstChild === emptyState ? null : grid.firstChild);
  rendered.set(id, el);
}

// Dynamically scale a blessing's text so it fills its frame while leaving a
// margin for the Ken Burns zoom (so the words never get clipped as it scales).
function fitBlessing(el) {
  const card = el.querySelector(".blessing-card");
  if (!card) return;
  const availW = card.clientWidth;
  const availH = card.clientHeight;
  if (!availW || !availH) return;

  // Top-align while measuring so vertical overflow is fully reported
  // (flex centering can hide overflow that spills above the top).
  const prevJustify = card.style.justifyContent;
  card.style.justifyContent = "flex-start";

  let lo = 12, hi = Math.floor(availH * 0.5), best = lo;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    card.style.fontSize = mid + "px";
    if (card.scrollWidth <= availW && card.scrollHeight <= availH) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  card.style.fontSize = best + "px";
  card.style.justifyContent = prevJustify; // restore centering
}

// Re-fit every blessing when the viewport (and thus frame size) changes.
let refitTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(refitTimer);
  refitTimer = setTimeout(() => {
    rendered.forEach((el) => {
      if (el.classList.contains("blessing")) fitBlessing(el);
    });
  }, 200);
});

function removePhoto(id) {
  const el = rendered.get(id);
  if (!el) return;
  el.style.transition = "opacity 0.5s ease, transform 0.5s ease";
  el.style.opacity = "0";
  el.style.transform = "scale(0.85)";
  setTimeout(() => el.remove(), 500);
  rendered.delete(id);
}

// Keep DOM order matching the desc-by-time order from Firestore.
function reorder(orderedIds) {
  orderedIds.forEach((id) => {
    const el = rendered.get(id);
    if (el) grid.appendChild(el);
  });
}

function updateEmptyState() {
  if (rendered.size === 0) {
    if (!grid.contains(emptyState)) grid.appendChild(emptyState);
    emptyState.style.display = "flex";
  } else {
    emptyState.style.display = "none";
  }
}
