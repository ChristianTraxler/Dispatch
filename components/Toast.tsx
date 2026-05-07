"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

export type ToastKind = "signin" | "signout" | "info" | "success" | "error";

export interface ToastInput {
  kind: ToastKind;
  /** Primary line (e.g., "Sarah at Renegade Wellness") */
  title: string;
  /** Secondary line (e.g., "signed in") */
  detail?: string;
  /** Auto-dismiss duration in ms. Default 4500. Set to 0 to require manual dismiss. */
  duration?: number;
}

interface Toast extends ToastInput {
  id: string;
  createdAt: number;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: ToastInput) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: Toast = {
        ...toast,
        id,
        createdAt: Date.now(),
        duration: toast.duration ?? 4500,
      };
      setToasts((prev) => [...prev, newToast]);

      if (newToast.duration && newToast.duration > 0) {
        setTimeout(() => dismiss(id), newToast.duration);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

/* ============================================
   TOAST CONTAINER
   ============================================ */
function ToastContainer() {
  const { toasts, dismiss } = useToast();

  const bottomClass = process.env.NODE_ENV === "development" ? "bottom-20" : "bottom-5";

  return (
    <div
      className={`fixed ${bottomClass} left-5 z-[100] flex flex-col-reverse gap-2 pointer-events-none w-[min(92vw,360px)]`}
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

/* ============================================
   TOAST ITEM
   ============================================ */
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 20);
    return () => clearTimeout(t);
  }, []);

  const accent = (() => {
    switch (toast.kind) {
      case "signin":
      case "success":
        return "border-signal-green";
      case "signout":
      case "error":
        return "border-signal-red";
      default:
        return "border-ink";
    }
  })();

  const dotClass = (() => {
    switch (toast.kind) {
      case "signin":
        return "presence-dot online pulse";
      case "signout":
        return "presence-dot offline";
      default:
        return "";
    }
  })();

  const time = new Date(toast.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className={[
        "pointer-events-auto bg-parchment-warm border-l-[3px] shadow-[2px_2px_0_rgba(26,24,21,0.08)]",
        "border border-rule",
        accent,
        "transform transition-all duration-200 ease-out",
        entering ? "translate-x-[-12px] opacity-0" : "translate-x-0 opacity-100",
      ].join(" ")}
      role="status"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {dotClass && (
          <span className="flex-shrink-0 mt-1.5">
            <span className={dotClass} aria-hidden="true" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-sm text-ink truncate">{toast.title}</span>
          </div>
          {toast.detail && (
            <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mt-0.5">
              {toast.detail} · {time}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 font-mono text-xs text-ink-fade hover:text-signal-red transition-colors leading-none mt-1"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
