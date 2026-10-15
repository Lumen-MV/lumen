"use client";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { copy } from "@/lib/copy-vi";
import { formatVnd } from "@/lib/format/format-vnd";
import type { UserSettings } from "@/lib/users/user-settings";
import { SettingsField, SettingsSection } from "./settings-shell";
import { useSettingsPatch } from "./use-settings-patch";

export type SubtitleStats = { quotaUsed: number; quotaLimit: number; resetHours: number; aiCount: number; aiCostVnd: number };
type Lang = UserSettings["sub_lang"];
type Size = UserSettings["sub_size"];
const LANGS: Lang[] = ["vi", "en", "off"];
const SIZES: Size[] = ["S", "M", "L"];

/** Phụ đề: language / size segs, auto-AI toggle, sources line, OpenSubtitles mini bar `1/20`, AI this month `7 phim · 3.600đ`. */
export function SubtitlesSection({ initial, stats }: { initial: UserSettings; stats: SubtitleStats }) {
  const { settings, patch } = useSettingsPatch(initial);
  const s = copy.settings.subs;
  const percent = (stats.quotaUsed / stats.quotaLimit) * 100;
  return (
    <SettingsSection title={copy.settings.nav[2]}>
      <SettingsField label={s.lang}>
        <SegmentedControl<Lang> options={LANGS.map((v, i) => ({ value: v, label: s.langs[i] }))} value={settings.sub_lang} onChange={(v) => void patch("sub_lang", v)} />
      </SettingsField>
      <SettingsField label={s.size}>
        <SegmentedControl<Size> options={SIZES.map((v, i) => ({ value: v, label: s.sizes[i] }))} value={settings.sub_size} onChange={(v) => void patch("sub_size", v)} />
      </SettingsField>
      <SettingsField label={s.autoAi} hint={s.autoAiHint}>
        <ToggleSwitch on={settings.auto_translate} label={s.autoAi} onChange={(v) => void patch("auto_translate", v)} />
      </SettingsField>
      <SettingsField label={s.sources}>
        <div style={{ fontSize: 13, color: "#bbb" }}>{s.sourcesValue}</div>
      </SettingsField>
      <SettingsField label={s.quota} hint={s.quotaHint(stats.resetHours)}>
        <div data-quota={stats.quotaUsed}>
          <span className="mini" style={{ width: 120 }} role="progressbar" aria-valuenow={stats.quotaUsed} aria-valuemin={0} aria-valuemax={stats.quotaLimit}>
            <i style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: "#46d369" }} />
          </span>
          {s.quotaValue(stats.quotaUsed)}
        </div>
      </SettingsField>
      <SettingsField label={s.aiMonth}>
        <div data-ai-month>{s.aiMonthValue(stats.aiCount, formatVnd(stats.aiCostVnd))}</div>
      </SettingsField>
    </SettingsSection>
  );
}
