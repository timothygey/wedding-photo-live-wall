// wall.js — the projector Live Wall.
// Subscribes to the latest N photos/blessings in real time and shows them in a
// grid that slowly AUTO-SCROLLS: when it reaches the bottom it loops back to the
// top, so we can show far more than one screenful. Also renders a scannable QR
// code pointing at the guest upload page.

import { db, PHOTOS_COLLECTION, WALL_MAX_FRAMES } from "./firebase-init.js";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const grid = document.getElementById("grid");
const emptyState = document.getElementById("emptyState");
const photoArea = document.querySelector(".photo-area");

// ── Auto-scroll speed ─────────────────────────────────────────────
// Pixels per second the wall scrolls down. Lower = slower/easier to read,
// higher = faster. Tuned so a 25-word blessing stays readable as it passes.
const SCROLL_SPEED_PX_PER_SEC = 45;
// ──────────────────────────────────────────────────────────────────

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

/* ---------- Live photo feed ---------- */
const rendered = new Map(); // id -> element

/* ---------- Auto-scroll + off-screen animation pausing ---------- */
let scrollPos = 0;
let lastTs = null;

// Pause the Ken Burns zoom on frames scrolled out of view so lots of tiles
// stay smooth. Root is the scrolling photo area; a margin keeps just-off-screen
// frames animating so they're already moving when they scroll in.
const kbObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      e.target.classList.toggle("kb-paused", !e.isIntersecting);
    }
  },
  { root: photoArea, rootMargin: "150px 0px" }
);

function autoScroll(ts) {
  if (lastTs === null) lastTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.1); // clamp long frame gaps
  lastTs = ts;

  const max = photoArea.scrollHeight - photoArea.clientHeight;
  if (max > 1) {
    scrollPos += SCROLL_SPEED_PX_PER_SEC * dt;
    if (scrollPos >= max) scrollPos = 0; // reached the bottom → loop to top
    photoArea.scrollTop = scrollPos;
  } else {
    scrollPos = 0;
    photoArea.scrollTop = 0;
  }
  requestAnimationFrame(autoScroll);
}
requestAnimationFrame(autoScroll);

const q = query(
  collection(db, PHOTOS_COLLECTION),
  orderBy("uploadedAt", "desc"),
  limit(WALL_MAX_FRAMES)
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

  // Insert newest-first at the top. If we're mid-scroll, nudge the scroll
  // position by the added height so the visible frames don't jump; when we're
  // at the very top, let the new frame simply appear.
  const prevH = photoArea.scrollHeight;
  grid.insertBefore(el, grid.firstChild);
  if (scrollPos > 1) {
    scrollPos += photoArea.scrollHeight - prevH;
    photoArea.scrollTop = scrollPos;
  }
  kbObserver.observe(el);
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
  kbObserver.unobserve(el);
  el.style.transition = "opacity 0.5s ease, transform 0.5s ease";
  el.style.opacity = "0";
  el.style.transform = "scale(0.85)";
  setTimeout(() => el.remove(), 500);
  rendered.delete(id);
}

// Keep DOM order matching the desc-by-time (newest-first) snapshot order,
// moving ONLY frames that are out of place — important now that the wall can
// hold many frames (a full re-append every update would thrash the scroll).
function reorder(orderedIds) {
  let ref = null; // the node that should come immediately after the current one
  for (let i = orderedIds.length - 1; i >= 0; i--) {
    const el = rendered.get(orderedIds[i]);
    if (!el) continue;
    if (el.nextSibling !== ref) grid.insertBefore(el, ref);
    ref = el;
  }
}

function updateEmptyState() {
  if (rendered.size === 0) {
    if (!grid.contains(emptyState)) grid.appendChild(emptyState);
    emptyState.style.display = "";
  } else if (grid.contains(emptyState)) {
    emptyState.remove(); // keep the grid to real frames only
  }
}
