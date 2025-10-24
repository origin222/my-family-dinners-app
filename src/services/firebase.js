// src/services/firebase.js
// Safe Firebase init (runs only if env is present)
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let db = null;

export async function getFirebase() {
  if (!cfg.apiKey) return { app: null, db: null }; // not configured
  const { initializeApp, getApps } = await import('firebase/app');
  const { getFirestore } = await import('firebase/firestore');

  if (!getApps().length) {
    app = initializeApp(cfg);
  }
  db = getFirestore();
  return { app, db };
}
