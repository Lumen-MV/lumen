"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Toast, type ToastAction, type ToastItem, type ToastType } from "./toast";

export type ToastInput = { type?: ToastType; text: string; action?: ToastAction; closable?: boolean; durationMs?: number };
type ToastApi = { toast: (input: ToastInput) => number; dismiss: (id: number) => void };

const MAX_VISIBLE = 3;
const DEFAULT_MS = 4000;

const ToastContext = createContext<ToastApi | null>(null);

/** Bottom-left stack (`.toasts`), 4s auto-dismiss, hover pauses, max 3 (oldest evicted). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, { handle: ReturnType<typeof setTimeout>; remaining: number; startedAt: number }>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t.handle);
    timers.current.delete(id);
    setItems((list) => list.filter((i) => i.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, ms: number) => {
      if (ms <= 0) return;
      timers.current.set(id, { handle: setTimeout(() => dismiss(id), ms), remaining: ms, startedAt: Date.now() });
    },
    [dismiss],
  );

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const item: ToastItem = { id, type: input.type ?? "success", text: input.text, action: input.action, closable: input.closable ?? true };
      setItems((list) => {
        const next = [...list, item];
        for (const evicted of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) {
          const t = timers.current.get(evicted.id);
          if (t) clearTimeout(t.handle);
          timers.current.delete(evicted.id);
        }
        return next.slice(-MAX_VISIBLE);
      });
      schedule(id, input.durationMs ?? DEFAULT_MS);
      return id;
    },
    [schedule],
  );

  const pause = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t) return;
    clearTimeout(t.handle);
    t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
  }, []);

  const resume = useCallback(
    (id: number) => {
      const t = timers.current.get(id);
      if (!t) return;
      schedule(id, t.remaining);
    },
    [schedule],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts">
        {items.map((item) => (
          <Toast key={item.id} item={item} onDismiss={dismiss} onPause={pause} onResume={resume} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
