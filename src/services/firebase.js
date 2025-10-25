// src/services/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

/**
 * Safe, single initialization:
 * - If env vars are missing, we export `db = null` so the app stays local-only.
 * - If env vars exist, we initialize Firebase only once (no duplicate-app error).
 */
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// If not configured, remain safely local-only
const hasConfig = !!(cfg.apiKey && cfg.projectId);

let app = null;
let db = null;

if (hasConfig) {
  app = getApps().length ? getApp() : initializeApp(cfg);
  db = getFirestore(app);
}

// Export `db` (null if not configured) and `app` (null if not configured)
export { db };
export default app;
