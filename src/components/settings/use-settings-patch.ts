"use client";
import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import type { UserSettings } from "@/lib/users/user-settings";

/**
 * Optimistic PATCH /api/me/settings for the Phát / Phụ đề rows: the control flips immediately, the request follows; a
 * failed request rolls the value back and toasts. `saving` lets a section show the inline "Đã lưu ✓" (2 s) if wanted.
 */
export function useSettingsPatch(initial: UserSettings) {
  const [settings, setSettings] = useState(initial);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { toast } = useToast();

  const patch = useCallback(
    async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      const previous = settings[key];
      setSettings((s) => ({ ...s, [key]: value }));
      try {
        const res = await fetch("/api/me/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [key]: value }) });
        if (!res.ok) throw new Error(`PATCH /api/me/settings ${res.status}`);
        const data = (await res.json()) as { settings: UserSettings };
        setSettings(data.settings);
        setSavedAt(Date.now());
      } catch (err) {
        console.error("[settings]", err);
        setSettings((s) => ({ ...s, [key]: previous }));
        toast({ type: "err", text: copy.settings.errToast });
      }
    },
    [settings, toast],
  );

  return { settings, patch, savedAt };
}

/** Shows `.saved` for 2 s after a successful save (profile "Đã lưu ✓"). */
export function useSavedFlash(ms = 2000): [boolean, () => void] {
  const [until, setUntil] = useState(0);
  const [, force] = useState(0);
  const flash = useCallback(() => {
    const t = Date.now() + ms;
    setUntil(t);
    setTimeout(() => force((n) => n + 1), ms + 10);
  }, [ms]);
  return [Date.now() < until, flash];
}
