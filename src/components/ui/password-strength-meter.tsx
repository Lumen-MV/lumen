import { copy } from "@/lib/copy-vi";
import { strengthColor, strengthLevel } from "@/lib/auth/password-strength";

const LEVEL_LABEL = { weak: copy.invite.weak, fair: copy.invite.fair, strong: copy.invite.strong } as const;

/** `.meter > i` (red < 40, amber < 75, green) + "Độ mạnh: yếu/khá/mạnh". `score` null → empty bar, no label. */
export function PasswordStrengthMeter({ score }: { score: number | null }) {
  const s = score ?? 0;
  return (
    <>
      <div className="meter">
        <i style={{ width: `${s}%`, background: strengthColor(s) }} />
      </div>
      {score != null && (
        <div className="err" style={{ color: "#aaa" }}>
          {copy.invite.strength(LEVEL_LABEL[strengthLevel(score)])}
        </div>
      )}
    </>
  );
}
