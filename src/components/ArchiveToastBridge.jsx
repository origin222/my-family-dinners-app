// src/components/ArchiveToastBridge.jsx
import React from "react";
import { useToast } from "./ToastHost";

/**
 * Invisible component that listens for 'archive:result'
 * and shows a toast with a clear message.
 */
export default function ArchiveToastBridge() {
  const { show } = useToast();

  React.useEffect(() => {
    function onArchive(e) {
      const detail = e?.detail || {};
      if (!detail.ok) {
        if (detail.reason === "no-week-start") {
          show("Pick a Week Start before archiving.");
        } else {
          show("Could not archive.");
        }
        return;
      }
      if (detail.mode === "updated") {
        show("Updated existing archive for this week.");
      } else {
        show("Archived this week!");
      }
    }

    window.addEventListener("archive:result", onArchive);
    return () => window.removeEventListener("archive:result", onArchive);
  }, [show]);

  return null; // nothing to render
}
