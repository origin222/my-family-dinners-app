// src/App.Legacy.jsx
import React, { useMemo, useState } from "react";
import { useMealPlan } from "./context/MealPlanContext";
import { toISODate } from "./utils/time";

/**
 * App.Legacy.jsx (Recreated Full Planner UI)
 * ------------------------------------------
 * - Weekly planner with "week start" selector
 * - 7-day columns (Mon–Sun) starting from week start
 * - Add / Edit / Delete meals per day
 * - Notes per meal
 * - Archive Current Plan button
 * - Uses MealPlanContext for all data (localStorage by default; Firestore if configured)
 *
 * This file contains NO Firebase initialization. It relies on MealPlanContext.
 */

/* ---------- Small UI helpers (pure React, simple styles) ---------- */
function Section({ title, right, children }) {
  return (
    <section style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>{title}</h3>
        <div style={{ marginLeft: "auto" }}>{right}</div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Button({ children, onClick, kind = "default", ...rest }) {
  const styles = {
    default: {
      padding: "8px 12px",
      background: "#0ea5e9",
      color: "white",
      border: "none",
      borderRadius: 8,
      cursor: "pointer",
    },
    subtle: {
      padding: "8px 12px",
      background: "#f1f5f9",
      color: "#0f172a",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      cursor: "pointer",
    },
    danger: {
      padding: "8px 12px",
      background: "#ef4444",
      color: "white",
      border: "none",
      borderRadius: 8,
      cursor: "pointer",
    },
  };
  return (
    <button onClick={onClick} style={styles[kind]} {...rest}>
      {children}
    </button>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        padding: "8px 10px",
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        ...props.style,
      }}
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        padding: "8px 10px",
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        minHeight: 60,
        ...props.style,
      }}
    />
  );
}

/* ---------- Date helpers ---------- */
function startOfWeekISO(isoDate) {
  // Treat provided isoDate as the Monday start (or given day as start)
  // We’ll keep it simple: the selected date IS the week start.
  return isoDate;
}

function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function labelForDay(iso) {
  // e.g., "Mon 10/24"
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}

/* ---------- Main Planner UI ---------- */
export default function AppLegacy() {
  const { plan, setPlan, archiveCurrentPlan } = useMealPlan();
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [activeDayISO, setActiveDayISO] = useState(null);

  const weekStartISO = plan?.weekStart || toISODate(new Date());
  const normalizedWeekStartISO = startOfWeekISO(weekStartISO);

  // Build a 7-day array from the selected week start
  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const iso = addDaysISO(normalizedWeekStartISO, i);
      arr.push(iso);
    }
    return arr;
  }, [normalizedWeekStartISO]);

  // Ensure active day is set (defaults to first day)
  React.useEffect(() => {
    setActiveDayISO((prev) => prev || days[0]);
  }, [days]);

  /* ----- Plan mutators (all write through MealPlanContext) ----- */
  function setWeekStart(iso) {
    setPlan((p) => ({ ...p, weekStart: iso }));
  }

  function addMealToDay(dayISO, { title, notes }) {
    if (!title.trim()) return;
    setPlan((p) => {
      const dayMeals = p.days[dayISO] || [];
      const entry = {
        id: String(Date.now()),
        title: title.trim(),
        notes: (notes || "").trim(),
      };
      return {
        ...p,
        days: {
          ...p.days,
          [dayISO]: [...dayMeals, entry],
        },
      };
    });
    setNewTitle("");
    setNewNotes("");
  }

  function updateMeal(dayISO, id, patch) {
    setPlan((p) => {
      const dayMeals = p.days[dayISO] || [];
      const next = dayMeals.map((m) => (m.id === id ? { ...m, ...patch } : m));
      return {
        ...p,
        days: { ...p.days, [dayISO]: next },
      };
    });
  }

  function deleteMeal(dayISO, id) {
    setPlan((p) => {
      const dayMeals = p.days[dayISO] || [];
      const next = dayMeals.filter((m) => m.id !== id);
      return {
        ...p,
        days: { ...p.days, [dayISO]: next },
      };
    });
  }

  function clearDay(dayISO) {
    setPlan((p) => ({
      ...p,
      days: { ...p.days, [dayISO]: [] },
    }));
  }

  function clearWeek() {
    setPlan((p) => ({ ...p, days: {} }));
  }

  /* ----- UI: Add Meal form for the active day ----- */
  function AddMealForm() {
    return (
      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: 12,
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <TextInput
            placeholder="Meal name (e.g., Teriyaki Chicken Bowls)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button
            onClick={() =>
              addMealToDay(activeDayISO, { title: newTitle, notes: newNotes })
            }
          >
            Add
          </Button>
        </div>
        <TextArea
          placeholder="Notes (e.g., Kids: extra pineapple)"
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
        />
      </div>
    );
  }

  /* ----- UI: Day Column ----- */
  function DayColumn({ iso }) {
    const meals = plan?.days?.[iso] || [];
    return (
      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          background: "#fff",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 600, color: "#0f172a" }}>
            {labelForDay(iso)}
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Button kind="subtle" onClick={() => clearDay(iso)}>
              Clear Day
            </Button>
          </div>
        </div>

        {meals.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 14 }}>No meals yet</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {meals.map((m) => (
              <li
                key={m.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 10,
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <TextInput
                    value={m.title}
                    onChange={(e) =>
                      updateMeal(iso, m.id, { title: e.target.value })
                    }
                    style={{ flex: 1 }}
                  />
                  <Button kind="danger" onClick={() => deleteMeal(iso, m.id)}>
                    Delete
                  </Button>
                </div>
                <TextArea
                  value={m.notes || ""}
                  onChange={(e) => updateMeal(iso, m.id, { notes: e.target.value })}
                />
              </li>
            ))}
          </ul>
        )}

        {/* If this is the active day, show the add form at the bottom */}
        {activeDayISO === iso && <AddMealForm />}
      </div>
    );
  }

  /* ----- Render ----- */
  return (
    <div style={{ padding: "12px", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginTop: 0 }}>Weekly Planner</h2>

      {/* Week controls */}
      <Section
        title="Week Settings"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              kind="subtle"
              onClick={() => setWeekStart(toISODate(new Date()))}
              title="Set week start to today"
            >
              This Week
            </Button>
            <Button kind="danger" onClick={clearWeek}>
              Clear Week
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ color: "#334155" }}>
            Week start:
            <TextInput
              type="date"
              value={normalizedWeekStartISO}
              onChange={(e) => setWeekStart(e.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>

          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ color: "#64748b" }}>|</span>
            <span style={{ color: "#64748b" }}>Active day:</span>
            <select
              value={activeDayISO || ""}
              onChange={(e) => setActiveDayISO(e.target.value)}
              style={{
                padding: "8px 10px",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                background: "#fff",
              }}
            >
              {days.map((iso) => (
                <option value={iso} key={iso}>
                  {labelForDay(iso)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Button onClick={archiveCurrentPlan}>Archive Current Plan</Button>
          </div>
        </div>
      </Section>

      {/* Day grid */}
      <Section title="Your Week">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {/* On large screens, show 7 columns; on small, stack. */}
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns:
                "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            {days.map((iso) => (
              <DayColumn key={iso} iso={iso} />
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}
