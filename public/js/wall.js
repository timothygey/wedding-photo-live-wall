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
  const img = document.createElement("img");
  img.src = data.thumbnailURL;
  img.alt = "Guest photo";
  el.appendChild(img);
  // Newest first.
  grid.insertBefore(el, grid.firstChild === emptyState ? null : grid.firstChild);
  rendered.set(id, el);
}

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
