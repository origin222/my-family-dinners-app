// src/components/ToastHost.jsx
import React from "react";

const ToastContext = React.createContext(null);

export function ToastProvider({ children }) {
  const [msg, setMsg] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const show = React.useCallback((text, timeout = 2200) => {
    setMsg(String(text || ""));
    setOpen(true);
    window.clearTimeout((show)._t);
    (show)._t = window.setTimeout(() => setOpen(false), timeout);
  }, []);

  const value = React.useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 24,
          transform: "translateX(-50%)",
          background: "#111827",
          color: "#fff",
          padding: "10px 14px",
          borderRadius: 8,
          boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
          opacity: open ? 1 : 0,
          pointerEvents: "none",
          transition: "opacity .2s ease",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
          zIndex: 10000,
          maxWidth: 480,
          textAlign: "center",
        }}
      >
        {msg}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
