// blessing.js — guest "leave a blessing" page.
// Validates a short text message client-side (live word counter + limiter),
// then sends it to the postBlessing Cloud Function, which validates again and
// writes the Firestore doc so it appears on the wall + gallery.

import {
  functions,
  BLESSING_WORD_LIMIT,
  BLESSING_CHAR_LIMIT,
  BLESSING_NAME_LIMIT,
} from "./firebase-init.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const msg = document.getElementById("msg");
const from = document.getElementById("from");
const counter = document.getElementById("counter");
const sendBtn = document.getElementById("sendBtn");
const toast = document.getElementById("toast");

msg.setAttribute("maxlength", BLESSING_CHAR_LIMIT);
from.setAttribute("maxlength", BLESSING_NAME_LIMIT);
counter.textContent = `0 / ${BLESSING_WORD_LIMIT} words`;

const countWords = (t) => t.trim().split(/\s+/).filter(Boolean).length;

/* ---------- Live word counter + limiter ---------- */
msg.addEventListener("input", updateState);

function updateState() {
  const words = countWords(msg.value);
  const over = words > BLESSING_WORD_LIMIT;
  counter.textContent = `${words} / ${BLESSING_WORD_LIMIT} words`;
  counter.classList.toggle("over", over);
  // Enable only when there's something to send and it's within the limit.
  sendBtn.disabled = words === 0 || over;
}

/* ---------- Send ---------- */
const callPost = httpsCallable(functions, "postBlessing");

sendBtn.addEventListener("click", async () => {
  const words = countWords(msg.value);
  if (words === 0 || words > BLESSING_WORD_LIMIT) return;

  sendBtn.disabled = true;
  sendBtn.textContent = "Sending…";
  clearToast();

  try {
    await callPost({ message: msg.value, from: from.value });
    showToast("success", "💛 Thank you! Your blessing will appear on the wall shortly.");
    msg.value = "";
    from.value = "";
    updateState();
  } catch (err) {
    showToast("error", "Couldn't send: " + (err?.message || err));
  } finally {
    sendBtn.textContent = "Send Blessing";
    // updateState() already set the correct disabled state on success;
    // re-enable on error so they can retry.
    if (countWords(msg.value) > 0) sendBtn.disabled = false;
  }
});

/* ---------- UI helpers ---------- */
function showToast(type, text) {
  toast.innerHTML = `<div class="toast ${type}">${text}</div>`;
}
function clearToast() {
  toast.innerHTML = "";
}
