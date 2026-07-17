// upload.js — guest upload page logic.
// Validates files client-side (size + type), then uploads each original
// to /uploads/ in Cloud Storage. The processUpload Cloud Function takes
// over from there (convert/compress/thumbnail/Firestore doc).

import { storage, MAX_UPLOAD_BYTES, UPLOADS_PATH } from "./firebase-init.js";
import {
  ref,
  uploadBytesResumable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const selectedList = document.getElementById("selectedList");
const uploadBtn = document.getElementById("uploadBtn");
const toast = document.getElementById("toast");

let chosen = []; // [{ file, valid, reason }]

/* ---------- File selection ---------- */
fileInput.addEventListener("change", () => addFiles(fileInput.files));

// Drag & drop (useful on laptops connected to DSLRs).
["dragover", "dragenter"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  })
);
dropZone.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
});

function addFiles(fileList) {
  for (const file of fileList) {
    let valid = true;
    let reason = "";
    // iOS sometimes reports an empty MIME type for HEIC/library photos,
    // so fall back to checking the file extension.
    const looksLikeImage =
      file.type.startsWith("image/") ||
      /\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp)$/i.test(file.name);
    if (!looksLikeImage) {
      valid = false;
      reason = "Not an image";
    } else if (file.size > MAX_UPLOAD_BYTES) {
      valid = false;
      reason = `Too large (${formatSize(file.size)} > 50MB)`;
    }
    chosen.push({ file, valid, reason });
  }
  renderSelected();
}

function renderSelected() {
  selectedList.innerHTML = "";
  chosen.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "selected-item";

    const img = document.createElement("img");
    img.className = "thumb";
    img.src = URL.createObjectURL(item.file);
    row.appendChild(img);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = item.file.name;
    row.appendChild(name);

    const status = document.createElement("div");
    status.className = "status " + (item.valid ? "ok" : "err");
    status.textContent = item.valid ? formatSize(item.file.size) : item.reason;
    status.dataset.idx = idx;
    row.appendChild(status);

    // progress bar placeholder
    const prog = document.createElement("div");
    prog.className = "progress";
    prog.innerHTML = "<span></span>";
    prog.style.display = "none";
    prog.dataset.idx = idx;
    row.appendChild(prog);

    selectedList.appendChild(row);
  });

  const anyValid = chosen.some((c) => c.valid);
  uploadBtn.disabled = !anyValid;
}

/* ---------- Upload ---------- */
uploadBtn.addEventListener("click", async () => {
  const validItems = chosen.filter((c) => c.valid);
  if (!validItems.length) return;

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Uploading…";
  clearToast();

  let done = 0;
  let failed = 0;

  await Promise.all(
    chosen.map((item, idx) => {
      if (!item.valid) return Promise.resolve();
      return uploadOne(item.file, idx)
        .then(() => { done += 1; markStatus(idx, "ok", "✓ Uploaded"); })
        .catch((err) => {
          failed += 1;
          markStatus(idx, "err", "Failed");
          console.error(err);
        });
    })
  );

  if (failed === 0) {
    showToast("success", `🎉 ${done} photo${done === 1 ? "" : "s"} uploaded! They'll appear on the wall shortly.`);
    chosen = [];
    setTimeout(renderSelected, 1500);
  } else {
    showToast("error", `${done} uploaded, ${failed} failed. Please retry the failed ones.`);
  }

  uploadBtn.textContent = "Upload Photos";
  uploadBtn.disabled = false;
});

function uploadOne(file, idx) {
  return new Promise((resolve, reject) => {
    // Unique path: timestamp + random + original extension.
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storageRef = ref(storage, `${UPLOADS_PATH}/${safeName}`);

    // iOS may report an empty MIME type; derive one from the extension so the
    // Storage rule (contentType must match image/*) still accepts it.
    const contentType = file.type && file.type.startsWith("image/")
      ? file.type
      : extToMime(ext);

    const task = uploadBytesResumable(storageRef, file, { contentType });
    const progEl = selectedList.querySelector(`.progress[data-idx="${idx}"]`);
    if (progEl) progEl.style.display = "block";

    task.on(
      "state_changed",
      (snap) => {
        const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
        if (progEl) progEl.querySelector("span").style.width = pct + "%";
      },
      (err) => reject(err),
      () => resolve()
    );
  });
}

/* ---------- UI helpers ---------- */
function markStatus(idx, cls, text) {
  const el = selectedList.querySelector(`.status[data-idx="${idx}"]`);
  if (el) { el.className = "status " + cls; el.textContent = text; }
}
function showToast(type, msg) {
  toast.innerHTML = `<div class="toast ${type}">${msg}</div>`;
}
function clearToast() { toast.innerHTML = ""; }
function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function extToMime(ext) {
  const map = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", gif: "image/gif", heic: "image/heic",
    heif: "image/heif", tif: "image/tiff", tiff: "image/tiff",
    bmp: "image/bmp",
  };
  return map[ext] || "image/jpeg";
}
