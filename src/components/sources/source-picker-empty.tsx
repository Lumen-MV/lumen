"use client";
import { Button } from "@/components/ui/button";
import { EmptyBox } from "@/components/ui/empty-box";
import { copy } from "@/lib/copy-vi";

/** `picker-empty`: emptyBox + "Thử lại" / "Yêu cầu thêm phim này" (the request only logs an admin activity row). */
export function SourcePickerEmpty({ onRetry, onRequest, requested }: { onRetry: () => void; onRequest: () => void; requested?: boolean }) {
  return (
    <div style={{ padding: "30px 22px" }} data-picker-empty>
      <EmptyBox title={copy.picker.emptyTitle} hint={copy.picker.emptyHint} />
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: -30 }}>
        <Button size="sm" onClick={onRetry}>{copy.picker.retry}</Button>
        <Button size="sm" onClick={onRequest} disabled={requested}>{copy.picker.request}</Button>
      </div>
    </div>
  );
}
