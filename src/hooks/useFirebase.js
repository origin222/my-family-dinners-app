// src/hooks/useFirebase.js
// Simple helper that reuses the safe singleton in services/firebase
import app, { db } from "../services/firebase";

export default function useFirebase() {
  return { app, db };
}
