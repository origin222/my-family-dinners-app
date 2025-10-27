// src/App.jsx
import React from "react";
import { MealPlanProvider, useMealPlan } from "./context/MealPlanContext";
import { ToastProvider, useToast } from "./components/ToastHost";
import LegacyApp from "./App.Legacy.jsx";

/**
 * AppShell
 * Wraps the legacy planner UI and wires archive -> toast messages.
 */
function AppShell() {
  const { archiveCurrentPlan, plan } = useMealPlan();
  const { show } = useToast();

  // Example: If your legacy UI exposes an "Archive" button callback,
  // you can pass this handler down as a prop.
  async function handleArchive() {
    const res = archiveCurrentPlan();
    if (!res?.ok) {
      if (res?.reason === "no-week-start") {
        show("Pick a Week Start before archiving.");
      } else {
        show("Could not archive.");
      }
      return;
    }
    if (res.mode === "updated") {
      show("Updated existing archive for this week.");
    } else {
      show("Archived this week!");
    }
  }

  // You have two options:
  // 1) If your LegacyApp already has an Archive button that calls archiveCurrentPlan(),
  //    you can leave it be. The context logic will still prevent duplicates.
  // 2) Or pass the handler so it shows the nicer toast:
  //    <LegacyApp onArchive={handleArchive} />
  //
  // For maximum compatibility, we render LegacyApp and, if it doesn't use onArchive,
  // the context rule still applies. If you want the nicer toast, wire `onArchive`
  // to your button inside App.Legacy.jsx.
  return <LegacyApp onArchive={handleArchive} plan={plan} />;
}

export default function App() {
  return (
    <ToastProvider>
      <MealPlanProvider>
        <AppShell />
      </MealPlanProvider>
    </ToastProvider>
  );
}
