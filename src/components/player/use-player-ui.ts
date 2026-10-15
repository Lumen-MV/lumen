"use client";
import { useCallback, useState } from "react";

/** Which floating surface is open (one at a time) + one-shot dialogs; `anyOpen` locks the auto-hide. */
export type FlashKind = "play" | "pause" | "b10" | "f10";
export type PlayerPanel = "none" | "handoff" | "drawer" | "help" | "qr" | "sent" | "speed" | "subs";

export function usePlayerUi() {
  const [panel, setPanelState] = useState<PlayerPanel>("none");
  const [sentApp, setSentApp] = useState("");
  const [flash, setFlash] = useState<{ kind: FlashKind; n: number } | null>(null);
  const [showRemaining, setShowRemaining] = useState(false);
  const [nextDismissed, setNextDismissed] = useState(false);
  const [noAudioDismissed, setNoAudioDismissed] = useState(false);

  const setPanel = useCallback((p: PlayerPanel) => setPanelState((cur) => (cur === p ? "none" : p)), []);
  const closePanel = useCallback(() => setPanelState("none"), []);
  const openSent = useCallback((app: string) => {
    setSentApp(app);
    setPanelState("sent");
  }, []);
  /** centre ▶ / ⏸ flash on every toggle, ↺ / ↻ on a mobile double-tap seek */
  const flashIcon = useCallback((kind: FlashKind) => setFlash((f) => ({ kind, n: (f?.n ?? 0) + 1 })), []);
  const toggleRemaining = useCallback(() => setShowRemaining((v) => !v), []);

  return { panel, setPanel, closePanel, anyOpen: panel !== "none", sentApp, openSent, flash, flashIcon, showRemaining, toggleRemaining, nextDismissed, setNextDismissed, noAudioDismissed, setNoAudioDismissed };
}

export type PlayerUi = ReturnType<typeof usePlayerUi>;
