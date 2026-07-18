// firebase-init.js
// Shared Firebase initialization used by all three pages
// (upload, gallery, wall). Uses the Firebase v10 modular SDK via CDN.
//
// NOTE: These config values are PUBLIC identifiers (safe to expose in
// frontend code). Real security is enforced by Firestore/Storage rules.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyAbxdYYHEITvQapgd9UugrGhQNEoD6KhJw",
  authDomain: "wedding-photo-wall-3ace4.firebaseapp.com",
  projectId: "wedding-photo-wall-3ace4",
  storageBucket: "wedding-photo-wall-3ace4.firebasestorage.app",
  messagingSenderId: "160600872388",
  appId: "1:160600872388:web:d817e8678195b86b16c091",
  measurementId: "G-B7YNE13022",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
// Functions run in Singapore region — must match the deployed region.
export const functions = getFunctions(app, "asia-southeast1");

// ---- Shared app-wide constants ----
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB per photo
export const WALL_MAX_FRAMES = 120; // max frames kept on the auto-scrolling wall (performance cap; older ones remain in the gallery)
export const PHOTOS_COLLECTION = "photos"; // Firestore collection name
export const UPLOADS_PATH = "uploads"; // where guests upload originals

// ---- Blessing (text message) limits ----
// Kept short so the auto-scaled text stays readable on the projector wall
// (see ARCHITECTURE.md). Enforced client-side AND in the postBlessing function.
export const BLESSING_WORD_LIMIT = 25;   // max words per blessing
export const BLESSING_CHAR_LIMIT = 200;  // hard character backstop
export const BLESSING_NAME_LIMIT = 24;   // max chars for the optional "from" name

// Accepted image types for upload (broadest common set).
export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/tiff",
];
