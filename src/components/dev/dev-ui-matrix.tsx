"use client";
import { useEffect, useState } from "react";
import { DevUiButtonsMatrix } from "./dev-ui-buttons-matrix";
import { Dialog } from "@/components/ui/dialog";
import { KeyboardHelpHotkey } from "@/components/ui/keyboard-help-dialog";
import { ForbiddenView, NotFoundView } from "@/components/ui/forbidden-view";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { renderBold } from "@/lib/format/render-bold";

/** Fires the 4 sample toasts from global.html?state=toasts. */
function ToastsDemo() {
  const { toast } = useToast();
  useEffect(() => {
    const s = copy.toastSamples;
    toast({ type: "success", text: s.added, action: { label: copy.common.undo, onClick: () => undefined } });
    toast({ type: "info", text: copy.picker.cloudToast });
    toast({ type: "warn", text: s.expired });
    toast({ type: "err", text: s.torboxDown, action: { label: copy.common.retry, onClick: () => undefined } });
  }, [toast]);
  return (
    <div className="demo">
      <h2>{copy.devUi.toastsTitle}</h2>
    </div>
  );
}

function DialogDemo({ danger }: { danger: boolean }) {
  const [open, setOpen] = useState(true);
  const d = copy.dialog, s = copy.devUi;
  return (
    <>
      <div className="demo" />
      {danger ? (
        <Dialog open={open} onOpenChange={setOpen} variant="danger" confirmText={s.sampleUser} title={d.deleteMember.title(s.sampleUser)} body={renderBold(d.deleteMember.text(s.sampleName, s.sampleUser))} actions={[{ label: copy.common.cancel }, { label: d.deleteMember.ok, variant: "red", primary: true }]} />
      ) : (
        <Dialog open={open} onOpenChange={setOpen} variant="confirm" title={d.removeContinue.title} body={d.removeContinue.text(s.sampleTitle, s.samplePercent)} actions={[{ label: copy.common.cancel }, { label: d.removeContinue.ok, variant: "red", primary: true }]} />
      )}
    </>
  );
}

/** `/dev/ui?state=…` — renders the global.html states with the real UI kit (LUMEN_SCENARIOS=1 only). */
export function DevUiMatrix({ state }: { state: string }) {
  switch (state) {
    case "toasts":
      return <ToastsDemo />;
    case "dialog-confirm":
      return <DialogDemo danger={false} />;
    case "dialog-danger":
      return <DialogDemo danger />;
    case "kbd-help":
      return (
        <>
          <div className="demo" />
          <KeyboardHelpHotkey initialOpen />
        </>
      );
    case "403":
      return <ForbiddenView />;
    case "404":
      return <NotFoundView />;
    case "offline":
      return <div className="demo" />;
    default:
      return <DevUiButtonsMatrix />;
  }
}
