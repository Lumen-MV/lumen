"use client";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";
import { useSources } from "./sources-provider";

/** Hero "Chọn bản khác" → opens the picker (highlighting the primary = "Lần trước" or best row); "📺 Xem bằng app" → app hand-off for the best cached row (else the picker). */
export function PickOtherButton() {
  const s = useSources();
  return (
    <Button data-action="pick-other" onClick={() => s.openPicker(s.primary?.hash ?? null)}>
      {copy.detail.pickOther}
    </Button>
  );
}

export function OpenAppButton() {
  const s = useSources();
  const cached = s.data?.releases.find((r) => r.cacheState === "cached" && r.playClass === "app") ?? s.data?.releases.find((r) => r.cacheState === "cached") ?? null;
  return (
    <Button data-action="open-app" disabled={s.status === "loading"} onClick={() => (cached ? void s.actions.app(cached) : s.openPicker(null))}>
      {copy.detail.openApp}
    </Button>
  );
}
