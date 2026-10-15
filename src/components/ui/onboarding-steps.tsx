"use client";
import { QrCode } from "./qr-code";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";

export type Quality = "1080p" | "2160p";
export type SubLang = "vi" | "en" | "off";

/** `.steps > i[.on]×3` progress bar. */
export function StepsBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="steps">
      {[1, 2, 3].map((n) => (
        <i key={n} className={cx(step >= n && "on")} />
      ))}
    </div>
  );
}

const hint = { color: "#888" } as const;
const lead = { color: "#bbb" } as const;

/** Step 1: `.opt > span[.on] > b + br + small` quality choice. */
export function StepQuality({ name, value, onChange }: { name: string; value: Quality; onChange: (q: Quality) => void }) {
  const o = copy.onboard;
  return (
    <>
      <h2>{o.hello(name)}</h2>
      <p style={lead}>{o.qualityText}</p>
      <div className="opt" role="radiogroup">
        <span className={cx(value === "1080p" && "on")} role="radio" aria-checked={value === "1080p"} onClick={() => onChange("1080p")}>
          <b>{o.q1080}</b>
          <br />
          <small style={hint}>{o.q1080Hint}</small>
        </span>
        <span className={cx(value === "2160p" && "on")} role="radio" aria-checked={value === "2160p"} onClick={() => onChange("2160p")}>
          <b>{o.q4k}</b>
          <br />
          <small style={hint}>{o.q4kHint}</small>
        </span>
      </div>
    </>
  );
}

/** Step 2: subtitle language chips + AI auto-translate checkbox. */
export function StepSubtitles({ lang, autoAi, onLang, onAutoAi }: { lang: SubLang; autoAi: boolean; onLang: (l: SubLang) => void; onAutoAi: (v: boolean) => void }) {
  const o = copy.onboard;
  const opts: Array<[SubLang, string]> = [
    ["vi", o.vi],
    ["en", o.en],
    ["off", o.off],
  ];
  return (
    <>
      <h2>{o.subsTitle}</h2>
      <p style={lead}>{o.subsText}</p>
      <div className="opt" role="radiogroup">
        {opts.map(([v, label]) => (
          <span key={v} className={cx(lang === v && "on")} role="radio" aria-checked={lang === v} onClick={() => onLang(v)}>
            {label}
          </span>
        ))}
      </div>
      <label>
        <input type="checkbox" checked={autoAi} onChange={(e) => onAutoAi(e.target.checked)} /> {o.autoAi}
      </label>
    </>
  );
}

/** Step 3: QR of the Stremio manifest URL (160px box, same inline geometry as the mockup). */
export function StepTv({ manifestUrl }: { manifestUrl: string | null }) {
  const o = copy.onboard;
  return (
    <>
      <h2>{o.tvTitle}</h2>
      <p style={lead}>{o.tvText}</p>
      {manifestUrl ? (
        <QrCode value={manifestUrl} size={160} style={{ margin: "10px auto", border: "6px solid #fff" }} />
      ) : (
        <div className="qr" style={{ width: 160, height: 160, margin: "10px auto", border: "6px solid #fff", background: "#fff" }} />
      )}
    </>
  );
}
