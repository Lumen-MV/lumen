"use client";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { segmentKeyDown } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";

export type CreatedInvite = { id: number; url: string; expiresAt: string; note: string; maxUses: 1 | null };
type Expiry = 3 | 7 | 14;
const EXPIRIES: Expiry[] = [3, 7, 14];
const EXPIRY_OPTIONS = EXPIRIES.map((d, i) => ({ value: String(d), label: copy.admin.invites.expiries[i] }));
const activate = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};
const segStyle = { display: "inline-flex", border: "1px solid #444", borderRadius: 6, overflow: "hidden" } as const;
const optStyle = { padding: "4px 10px", cursor: "pointer" } as const;

/** "Tạo link mời": note input, expiry seg 3 / 7 / 14 ngày, "Số lần dùng: 1 lần · Nhiều lần" → POST /api/admin/invites → `onCreated`. */
export function CreateInviteDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (inv: CreatedInvite) => void }) {
  const t = copy.admin.invites;
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [days, setDays] = useState<Expiry>(7);
  const [multi, setMulti] = useState(false);

  const create = async () => {
    try {
      const res = await fetch("/api/admin/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: note.trim(), expiresDays: days, maxUses: multi ? null : 1 }) });
      if (!res.ok) throw new Error(`POST /api/admin/invites ${res.status}`);
      const data = (await res.json()) as { id: number; url: string; expiresAt: string };
      onCreated({ ...data, note: note.trim(), maxUses: multi ? null : 1 });
      setNote("");
      setDays(7);
      setMulti(false);
    } catch (err) {
      console.error("[invite create]", err);
      toast({ type: "err", text: copy.settings.errToast });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} variant="form" title={t.createTitle} actions={[{ label: copy.common.cancel }, { label: t.create, variant: "red", primary: true, onClick: create }]}>
      <input placeholder={t.notePh} value={note} maxLength={80} autoFocus aria-label={t.notePh} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void create().then(() => onOpenChange(false))} />
      <div style={{ display: "flex", gap: 8, margin: "4px 0 10px", fontSize: 13, color: "#bbb", alignItems: "center" }}>
        {t.expiry}
        <span className="seg" style={segStyle} role="radiogroup" aria-label={t.expiry}>
          {EXPIRIES.map((d, i) => (
            <span key={d} role="radio" aria-checked={days === d} tabIndex={days === d ? 0 : -1} className={cx(days === d && "on")} style={{ ...optStyle, ...(days === d ? { background: "#fff", color: "#000" } : {}) }} onClick={() => setDays(d)} onKeyDown={(e) => segmentKeyDown(e, EXPIRY_OPTIONS, String(days), (v) => setDays(Number(v) as Expiry))}>
              {t.expiries[i]}
            </span>
          ))}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "#bbb", marginBottom: 6 }} data-uses={multi ? "many" : "once"}>
        {t.uses}{" "}
        <b role="button" tabIndex={0} style={{ color: multi ? "#7fb5ff" : "#fff", cursor: "pointer" }} onClick={() => setMulti(false)} onKeyDown={activate(() => setMulti(false))}>
          {t.once}
        </b>{" "}
        ·{" "}
        <span role="button" tabIndex={0} style={{ color: multi ? "#fff" : "#7fb5ff", fontWeight: multi ? 700 : 400, cursor: "pointer" }} onClick={() => setMulti(true)} onKeyDown={activate(() => setMulti(true))}>
          {t.many}
        </span>
      </div>
    </Dialog>
  );
}
