"use client";
import { useEffect, useState } from "react";
import { Banner } from "./banner";
import { copy } from "@/lib/copy-vi";
import { readScenarioClient } from "@/lib/dev/scenario-flags-client";

/** Sticky `.banner.err` shown when the browser reports offline (or dev scenario `offline`). */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine || readScenarioClient().has("offline"));
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <Banner kind="err" style={{ position: "sticky", top: 0, zIndex: 9 }} action={{ label: copy.common.retry, onClick: () => window.location.reload() }}>
      {copy.offline.text}
    </Banner>
  );
}
