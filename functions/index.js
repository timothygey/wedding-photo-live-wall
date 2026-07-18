/**
 * Cloud Functions for the Wedding Live Photo Wall.
 *
 * Three functions:
 *   1. processUpload  — triggered when a guest uploads an original to
 *      /uploads/. Converts HEIC→JPEG if needed, produces a ~400KB
 *      thumbnail and a high-quality ~5MB display version, writes both to
 *      /processed/, deletes the bulky original, and creates a Firestore
 *      'photos' doc so the wall + gallery update in real time.
 *
 *   2. cleanupExpired — scheduled hourly. Deletes photos (docs + files)
 *      older than 24 hours so storage stays near-empty and the event is
 *      self-cleaning.
 *
 *   3. deletePhoto — callable admin function. Given a photo id and the
 *      secret admin key, deletes the Firestore doc + both Storage files so
 *      the photo vanishes from the wall + gallery instantly. Used by the
 *      hidden admin mode on the gallery for live moderation.
 */

import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import sharp from "sharp";
import heicConvert from "heic-convert";
import path from "path";
import os from "os";
import fs from "fs";

initializeApp();

// Run everything in Singapore region, close to the Firestore/Storage data.
setGlobalOptions({ region: "asia-southeast1", memory: "1GiB", timeoutSeconds: 120 });

const db = getFirestore();

// ---- Tunable output settings ----
const THUMB_MAX_EDGE = 800;     // px — grid/wall thumbnails
const THUMB_QUALITY = 72;       // JPEG quality for thumbnails
const DISPLAY_MAX_EDGE = 3200;  // px — high-quality keepsake/download version
const DISPLAY_QUALITY = 88;     // JPEG quality for display version

// ---- Admin moderation ----
// Secret key required to delete photos. CHANGE THIS to your own private
// value; anyone with it can remove photos, so keep it off the wall/screen.
const ADMIN_KEY = "megumi-timothy-8826-admin";
const RETENTION_HOURS = 168;    // auto-delete after this many hours (168 = 1 week)

/* ============================================================
 * 1. Process a newly uploaded original.
 * ============================================================ */
export const processUpload = onObjectFinalized(async (event) => {
  const object = event.data;
  const filePath = object.name || "";
  const contentType = object.contentType || "";

  // Only react to files dropped into /uploads/.
  if (!filePath.startsWith("uploads/")) {
    return;
  }
  if (!contentType.startsWith("image/")) {
    logger.warn(`Skipping non-image upload: ${filePath} (${contentType})`);
    return;
  }

  const bucket = getStorage().bucket(object.bucket);
  const fileName = path.basename(filePath);
  const baseName = path.parse(fileName).name; // strip extension
  const tempOriginal = path.join(os.tmpdir(), fileName);

  try {
    // Download the original to the function's temp disk.
    await bucket.file(filePath).download({ destination: tempOriginal });
    let inputBuffer = fs.readFileSync(tempOriginal);

    // --- HEIC/HEIF conversion (browsers can't render these) ---
    const isHeic =
      contentType.includes("heic") ||
      contentType.includes("heif") ||
      /\.hei[cf]$/i.test(fileName);

    if (isHeic) {
      logger.info(`Converting HEIC → JPEG: ${fileName}`);
      const converted = await heicConvert({
        buffer: inputBuffer,
        format: "JPEG",
        quality: 0.95,
      });
      inputBuffer = Buffer.from(converted);
    }

    // Normalize orientation using EXIF, then produce two sizes.
    const base = sharp(inputBuffer).rotate();

    const displayBuffer = await base
      .clone()
      .resize(DISPLAY_MAX_EDGE, DISPLAY_MAX_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: DISPLAY_QUALITY, mozjpeg: true })
      .toBuffer();

    const thumbBuffer = await base
      .clone()
      .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
      .toBuffer();

    // --- Upload both processed versions to /processed/ ---
    const displayPath = `processed/${baseName}_display.jpg`;
    const thumbPath = `processed/${baseName}_thumb.jpg`;

    // A download token makes the file publicly fetchable via a stable URL.
    const displayToken = makeToken();
    const thumbToken = makeToken();

    await bucket.file(displayPath).save(displayBuffer, {
      metadata: {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=86400",
        metadata: { firebaseStorageDownloadTokens: displayToken },
      },
    });
    await bucket.file(thumbPath).save(thumbBuffer, {
      metadata: {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=86400",
        metadata: { firebaseStorageDownloadTokens: thumbToken },
      },
    });

    const displayURL = tokenUrl(object.bucket, displayPath, displayToken);
    const thumbnailURL = tokenUrl(object.bucket, thumbPath, thumbToken);

    // --- Create the Firestore doc that drives the wall + gallery ---
    await db.collection("photos").add({
      thumbnailURL,
      displayURL,
      thumbPath,
      displayPath,
      status: "ready",
      uploadedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Processed ${fileName}: display=${(displayBuffer.length / 1e6).toFixed(2)}MB thumb=${(thumbBuffer.length / 1e3).toFixed(0)}KB`);

    // --- Delete the bulky original to save storage ---
    await bucket.file(filePath).delete().catch((e) =>
      logger.warn(`Could not delete original ${filePath}: ${e.message}`)
    );
  } catch (err) {
    logger.error(`Failed to process ${filePath}: ${err.stack || err.message}`);
  } finally {
    // Clean up temp file.
    if (fs.existsSync(tempOriginal)) {
      fs.unlinkSync(tempOriginal);
    }
  }
});

/* ============================================================
 * 2. Scheduled cleanup: delete photos older than 24 hours.
 * ============================================================ */
export const cleanupExpired = onSchedule("every 60 minutes", async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_HOURS * 3600 * 1000);
  const snapshot = await db
    .collection("photos")
    .where("uploadedAt", "<", cutoff)
    .get();

  if (snapshot.empty) {
    logger.info("Cleanup: nothing to delete.");
    return;
  }

  const bucket = getStorage().bucket();
  let deleted = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    // Remove both processed files (ignore missing-file errors).
    if (data.displayPath) {
      await bucket.file(data.displayPath).delete().catch(() => {});
    }
    if (data.thumbPath) {
      await bucket.file(data.thumbPath).delete().catch(() => {});
    }
    await doc.ref.delete();
    deleted += 1;
  }

  logger.info(`Cleanup: deleted ${deleted} expired photo(s).`);
});

/* ============================================================
 * 3. Admin: delete a single photo (doc + both Storage files).
 *    Callable from the gallery's hidden admin mode. Requires the
 *    secret admin key so guests cannot delete photos.
 * ============================================================ */
export const deletePhoto = onCall(async (request) => {
  const { photoId, adminKey } = request.data || {};

  if (adminKey !== ADMIN_KEY) {
    throw new HttpsError("permission-denied", "Invalid admin key.");
  }
  if (!photoId || typeof photoId !== "string") {
    throw new HttpsError("invalid-argument", "A photoId is required.");
  }

  const docRef = db.collection("photos").doc(photoId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "That photo no longer exists.");
  }

  const data = snap.data();
  const bucket = getStorage().bucket();

  // Delete both processed files (ignore missing-file errors), then the doc.
  if (data.displayPath) {
    await bucket.file(data.displayPath).delete().catch(() => {});
  }
  if (data.thumbPath) {
    await bucket.file(data.thumbPath).delete().catch(() => {});
  }
  await docRef.delete();

  logger.info(`Admin deleted photo ${photoId}.`);
  return { success: true, photoId };
});

/* ============================================================
 * 4. Guest blessing: create a text "blessing" doc.
 *    Callable from the blessing page. Validated server-side (word/char
 *    limits) and written via the Admin SDK so guests still cannot write
 *    to Firestore directly — same trust model as photos.
 * ============================================================ */
const BLESSING_WORD_LIMIT = 25;
const BLESSING_CHAR_LIMIT = 200;
const BLESSING_NAME_LIMIT = 24;

export const postBlessing = onCall(async (request) => {
  const { message, from } = request.data || {};

  if (typeof message !== "string" || !message.trim()) {
    throw new HttpsError("invalid-argument", "A blessing message is required.");
  }

  // Normalise whitespace (collapse runs/newlines to single spaces) and trim.
  const cleanMsg = message.replace(/\s+/g, " ").trim();
  if (!cleanMsg) {
    throw new HttpsError("invalid-argument", "A blessing message is required.");
  }
  if (cleanMsg.length > BLESSING_CHAR_LIMIT) {
    throw new HttpsError("invalid-argument", `Please keep it under ${BLESSING_CHAR_LIMIT} characters.`);
  }
  const wordCount = cleanMsg.split(" ").filter(Boolean).length;
  if (wordCount > BLESSING_WORD_LIMIT) {
    throw new HttpsError("invalid-argument", `Please keep it to ${BLESSING_WORD_LIMIT} words or fewer.`);
  }

  let cleanFrom = "";
  if (typeof from === "string") {
    cleanFrom = from.replace(/\s+/g, " ").trim().slice(0, BLESSING_NAME_LIMIT);
  }

  const doc = await db.collection("photos").add({
    type: "blessing",
    message: cleanMsg,
    from: cleanFrom,
    status: "ready",
    uploadedAt: FieldValue.serverTimestamp(),
  });

  logger.info(`New blessing ${doc.id} (${wordCount} words).`);
  return { success: true, id: doc.id };
});

/* ============================================================
 * 5. COST GUARD — a single Firestore flag (config/guard) that all pages
 *    watch. When { locked: true }, guest pages disable the features that
 *    incur cost (uploads, blessings, full-res downloads). The live wall is
 *    unaffected and keeps scrolling.
 *
 *    (A) budgetGuard  — auto-locks when the Cloud Billing budget crosses the
 *        threshold (via a Pub/Sub topic connected to the budget).
 *    (B) setGuard     — admin toggle to lock/unlock on demand (also how you
 *        clear an auto-lock, since budgets don't "un-trip").
 * ============================================================ */
const BUDGET_LOCK_AMOUNT = 25; // lock when actual spend reaches this (budget's currency, e.g. S$25)
const GUARD_DOC = "config/guard";

// (B) Manual admin toggle.
export const setGuard = onCall(async (request) => {
  const { locked, adminKey } = request.data || {};
  if (adminKey !== ADMIN_KEY) {
    throw new HttpsError("permission-denied", "Invalid admin key.");
  }
  await db.doc(GUARD_DOC).set(
    { locked: !!locked, reason: locked ? "manual" : "", updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  logger.info(`Cost guard ${locked ? "LOCKED" : "unlocked"} (manual).`);
  return { success: true, locked: !!locked };
});

// (A) Auto-lock from the billing budget's Pub/Sub notifications.
// The budget must be connected to the "budget-alerts" Pub/Sub topic (this
// deploy creates that topic). Budgets never auto-unlock, so clearing is manual.
export const budgetGuard = onMessagePublished("budget-alerts", async (event) => {
  let payload = {};
  try {
    payload = event.data.message.json || {};
  } catch (e) {
    logger.error("Budget message was not valid JSON:", e);
    return;
  }
  const cost = Number(payload.costAmount || 0);
  const budget = Number(payload.budgetAmount || 0);
  const currency = payload.currencyCode || "";
  logger.info(`Budget alert: cost=${cost} budget=${budget} ${currency}`);

  if (cost >= BUDGET_LOCK_AMOUNT) {
    await db.doc(GUARD_DOC).set(
      { locked: true, reason: `budget:${cost}${currency}`, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    logger.warn(`Cost ${cost}${currency} >= ${BUDGET_LOCK_AMOUNT} → cost guard LOCKED.`);
  }
});

/* ============================================================
 * Helpers
 * ============================================================ */
function makeToken() {
  // Simple random token for the Firebase download URL.
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

function tokenUrl(bucketName, objectPath, token) {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}
