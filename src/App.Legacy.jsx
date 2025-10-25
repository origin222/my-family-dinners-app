// src/App.Legacy.jsx
import React, { useEffect, useState } from "react";
import app, { db } from "./services/firebase"; // ✅ reuse the single Firebase instance
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";

/**
 * App.Legacy.jsx
 * --------------
 * This is your original working app UI.
 * It connects to Firestore using the shared db (no re-initialization).
 * You can keep building your logic here — it’s wrapped inside PlannerView now.
 */
export default function AppLegacy() {
  const [meals, setMeals] = useState([]);
  const [newMeal, setNewMeal] = useState("");

  // Load meals from Firestore (if db exists)
  useEffect(() => {
    if (!db) return; // run local-only if Firebase not configured

    const unsub = onSnapshot(collection(db, "meals"), (snapshot) => {
      const loaded = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMeals(loaded);
    });

    return () => unsub();
  }, []);

  // Add a meal
  async function addMeal() {
    if (!newMeal.trim()) return;
    if (!db) {
      alert("No Firestore connection configured yet.");
      return;
    }
    await addDoc(collection(db, "meals"), { name: newMeal, createdAt: Date.now() });
    setNewMeal("");
  }

  // Delete a meal
  async function deleteMeal(id) {
    if (!db) {
      alert("No Firestore connection configured yet.");
      return;
    }
    await deleteDoc(doc(db, "meals", id));
  }

  // Update a meal
  async function updateMeal(id, name) {
    if (!db) return;
    await updateDoc(doc(db, "meals", id), { name });
  }

  return (
    <div style={{ padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <h2>My Family Dinners</h2>

      <div style={{ marginBottom: "1rem" }}>
        <input
          value={newMeal}
          onChange={(e) => setNewMeal(e.target.value)}
          placeholder="Add a new meal"
          style={{
            padding: "8px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            marginRight: "6px",
          }}
        />
        <button
          onClick={addMeal}
          style={{
            padding: "8px 12px",
            background: "#0ea5e9",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Add Meal
        </button>
      </div>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {meals.map((m) => (
          <li
            key={m.id}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "8px 10px",
              marginBottom: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <input
              value={m.name}
              onChange={(e) => updateMeal(m.id, e.target.value)}
              style={{
                flex: 1,
                marginRight: "8px",
                border: "none",
                fontSize: "1rem",
              }}
            />
            <button
              onClick={() => deleteMeal(m.id)}
              style={{
                padding: "6px 10px",
                background: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {!meals.length && (
        <p style={{ color: "#64748b" }}>No meals yet — add your first above!</p>
      )}
    </div>
  );
}
