"use client";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { copy } from "@/lib/copy-vi";
import type { UserSettings } from "@/lib/users/user-settings";
import { SettingsField, SettingsSection } from "./settings-shell";
import { useSettingsPatch } from "./use-settings-patch";

type Quality = UserSettings["quality"];
type App = UserSettings["handoff_app"];
const APPS: App[] = ["auto", "stremio", "infuse", "vlc"];

/** Phát: quality seg (1080p / 4K), prefer small, autoplay next, ask resume, default hand-off app — every change saves at once. */
export function PlaybackSection({ initial }: { initial: UserSettings }) {
  const { settings, patch } = useSettingsPatch(initial);
  const p = copy.settings.playback;
  return (
    <SettingsSection title={copy.settings.nav[1]} desc={p.desc}>
      <SettingsField label={p.quality} hint={p.qualityHint}>
        <SegmentedControl<Quality> options={[{ value: "1080p", label: p.q[0] }, { value: "2160p", label: p.q[1] }]} value={settings.quality} onChange={(v) => void patch("quality", v)} />
      </SettingsField>
      <SettingsField label={p.small} hint={p.smallHint}>
        <ToggleSwitch on={settings.prefer_small} label={p.small} onChange={(v) => void patch("prefer_small", v)} />
      </SettingsField>
      <SettingsField label={p.autoplay} hint={p.autoplayHint}>
        <ToggleSwitch on={settings.autoplay_next} label={p.autoplay} onChange={(v) => void patch("autoplay_next", v)} />
      </SettingsField>
      <SettingsField label={p.askResume}>
        <ToggleSwitch on={settings.ask_resume} label={p.askResume} onChange={(v) => void patch("ask_resume", v)} />
      </SettingsField>
      <SettingsField label={p.handoff} hint={p.handoffHint}>
        <SegmentedControl<App> options={APPS.map((v, i) => ({ value: v, label: p.apps[i] }))} value={settings.handoff_app} onChange={(v) => void patch("handoff_app", v)} />
      </SettingsField>
    </SettingsSection>
  );
}
