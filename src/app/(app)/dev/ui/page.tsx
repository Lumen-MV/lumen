import { notFound } from "next/navigation";
import { DevUiMatrix } from "@/components/dev/dev-ui-matrix";
import { devScenariosEnabled } from "@/lib/config/env";

export const dynamic = "force-dynamic";

/** /dev/ui?state=buttons|toasts|dialog-confirm|dialog-danger|offline|kbd-help|403|404 — 404 unless LUMEN_SCENARIOS=1. */
export default async function DevUiPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!devScenariosEnabled()) notFound();
  const { state } = await searchParams;
  return <DevUiMatrix state={state ?? "buttons"} />;
}
