"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorBox } from "@/components/ui/error-box";

/** ErrorBox whose "Thử lại" re-runs the server render (router.refresh) — used by server-fetched home rows / catalog errors. */
export function RefreshErrorBox({ message }: { message: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <ErrorBox
      message={message}
      onAction={() => {
        if (busy) return;
        setBusy(true);
        router.refresh();
        setTimeout(() => setBusy(false), 1500);
      }}
    />
  );
}
