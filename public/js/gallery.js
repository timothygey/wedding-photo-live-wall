// gallery.js — guest gallery page.
// Loads ALL photos (newest first, paginated), shows thumbnails in a grid,
// and opens a lightbox with the high-quality display version + download.
//
// ADMIN MODE: visiting the gallery with ?admin=SECRET reveals a Delete
// button in the lightbox that calls the deletePhoto Cloud Function to
// remove the photo from BOTH the wall and gallery (doc + Storage files).

import { db, functions, PHOTOS_COLLECTION } from "./firebase-init.js";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// Read the admin key from the URL (?admin=...). Empty for normal guests.
const ADMIN_KEY = new URLSearchParams(window.location.search).get("admin") || "";
const isAdmin = ADMIN_KEY.length > 0;
let currentPhotoId = null; // photo currently shown in the lightbox

const grid = document.getElementById("galleryGrid");
const emptyState = document.getElementById("emptyState");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");
const downloadBtn = document.getElementById("downloadBtn");

const PAGE_SIZE = 30;
let lastDoc = null;
let loading = false;
const seenIds = new Set();

/* ---------- Live listener for the newest page ---------- */
// Keeps the top of the gallery fresh as new photos arrive, without a refresh.
const liveQuery = query(
  collection(db, PHOTOS_COLLECTION),
  orderBy("uploadedAt", "desc"),
  limit(PAGE_SIZE)
);

onSnapshot(liveQuery, (snap) => {
  // Prepend any brand-new docs we haven't rendered yet.
  const newOnes = [];
  snap.docChanges().forEach((change) => {
    if (change.type === "added" && !seenIds.has(change.doc.id)) {
      newOnes.push(change.doc);
    }
    if (change.type === "removed") {
      removeCell(change.doc.id);
    }
  });
  // Insert newest first (docChanges added come oldest→newest for a desc query
  // page, so reverse to keep newest at the very top).
  newOnes.reverse().forEach((doc) => prependCell(doc.id, doc.data()));

  if (!lastDoc && snap.docs.length) {
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  updateEmptyState();
  updateLoadMore(snap.docs.length);
});

/* ---------- Load more (older photos) ---------- */
loadMoreBtn.addEventListener("click", loadMore);

async function loadMore() {
  if (loading || !lastDoc) return;
  loading = true;
  loadMoreBtn.textContent = "Loading…";

  const q = query(
    collection(db, PHOTOS_COLLECTION),
    orderBy("uploadedAt", "desc"),
    startAfter(lastDoc),
    limit(PAGE_SIZE)
  );
  const snap = await getDocs(q);
  snap.docs.forEach((doc) => appendCell(doc.id, doc.data()));
  if (snap.docs.length) lastDoc = snap.docs[snap.docs.length - 1];

  loading = false;
  loadMoreBtn.textContent = "Load more";
  updateLoadMore(snap.docs.length);
  updateEmptyState();
}

/* ---------- Cell rendering ---------- */
function makeCell(id, data) {
  const cell = document.createElement("div");
  cell.className = "cell";
  cell.dataset.id = id;
  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = data.thumbnailURL;
  img.alt = "Guest photo";
  cell.appendChild(img);
  cell.addEventListener("click", () => openLightbox(id, data));
  return cell;
}
function prependCell(id, data) {
  if (seenIds.has(id)) return;
  seenIds.add(id);
  grid.insertBefore(makeCell(id, data), grid.firstChild);
}
function appendCell(id, data) {
  if (seenIds.has(id)) return;
  seenIds.add(id);
  grid.appendChild(makeCell(id, data));
}
function removeCell(id) {
  const cell = grid.querySelector(`.cell[data-id="${id}"]`);
  if (cell) cell.remove();
  seenIds.delete(id);
}

/* ---------- Lightbox ---------- */
function openLightbox(id, data) {
  currentPhotoId = id;
  lightboxImg.src = data.displayURL;
  downloadBtn.href = data.displayURL;
  downloadBtn.setAttribute("download", "wedding-photo.jpg");
  lightbox.classList.add("open");
}
lightboxClose.addEventListener("click", () => lightbox.classList.remove("open"));
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) lightbox.classList.remove("open");
});

/* ---------- Admin delete ---------- */
if (isAdmin) {
  // Reveal a Delete button in the lightbox actions.
  const actions = document.querySelector(".lightbox .actions");
  const delBtn = document.createElement("button");
  delBtn.className = "btn";
  delBtn.style.background = "rgba(224,104,92,0.9)";
  delBtn.style.color = "#fff";
  delBtn.textContent = "🗑️ Delete";
  actions.appendChild(delBtn);

  const callDelete = httpsCallable(functions, "deletePhoto");

  delBtn.addEventListener("click", async () => {
    if (!currentPhotoId) return;
    if (!confirm("Permanently delete this photo from the wall and gallery?")) return;

    delBtn.disabled = true;
    delBtn.textContent = "Deleting…";
    try {
      await callDelete({ photoId: currentPhotoId, adminKey: ADMIN_KEY });
      // The Firestore listener will remove the cell automatically.
      lightbox.classList.remove("open");
    } catch (err) {
      alert("Delete failed: " + (err?.message || err));
    } finally {
      delBtn.disabled = false;
      delBtn.textContent = "🗑️ Delete";
    }
  });

  // Small badge so you know admin mode is active.
  const badge = document.createElement("div");
  badge.textContent = "🔒 Admin mode — tap a photo to delete";
  badge.style.cssText =
    "text-align:center;color:#e6b866;font-size:0.85rem;margin-bottom:14px;";
  document.querySelector(".guest-wrap").insertBefore(
    badge,
    document.querySelector(".gallery-grid")
  );
}

/* ---------- State helpers ---------- */
function updateEmptyState() {
  emptyState.style.display = seenIds.size === 0 ? "block" : "none";
}
function updateLoadMore(lastBatchCount) {
  // Show "Load more" only if the last batch filled a page (more may exist).
  loadMoreBtn.style.display = lastBatchCount >= PAGE_SIZE ? "inline-flex" : "none";
}
