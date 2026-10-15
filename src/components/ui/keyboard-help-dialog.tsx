"use client";
import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import { copy } from "@/lib/copy-vi";

type Scope = "global" | "player";

function rows(scope: Scope): Array<[string, string[]]> {
  const k = copy.kbd;
  const player: Array<[string, string[]]> = [
    [k.playPause, ["Space", "K"]],
    [k.seek10, ["←", "→"]],
    [k.volume, ["↑", "↓"]],
    [k.mute, ["M"]],
    [k.fullscreen, ["F"]],
    [k.subs, ["C"]],
    [k.nextEp, ["N"]],
  ];
  // player (screen-player.js `help`): 8 rows ending with "Thoát Esc"; global (global.html `kbd-help`): 10 rows
  if (scope === "player") return [...player, [k.exit, ["Esc"]]];
  return [[k.search, ["/"]], [k.close, ["Esc"]], ...player, [k.help, ["?"]]];
}

type Props = { open: boolean; onOpenChange: (o: boolean) => void; scope?: Scope };

/** `.dlg > .card2[560px] > h3 + .kbd(span > kbd…) + .acts` — the mockup's "Phím tắt" dialog. */
export function KeyboardHelpDialog({ open, onOpenChange, scope = "global" }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={copy.kbd.title} variant="info" width={560} actsStyle={{ marginTop: 18 }} actions={[{ label: copy.common.close, variant: "white" }]}>
      <div className="kbd">
        {rows(scope).map(([label, keys]) => (
          <span key={label}>
            {label} {keys.map((key) => <kbd key={key}>{key}</kbd>)}
          </span>
        ))}
      </div>
    </Dialog>
  );
}

const EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;

/** Mount once per app shell: pressing `?` outside inputs opens the help dialog. */
export function KeyboardHelpHotkey({ scope = "global", initialOpen = false }: { scope?: Scope; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key === "?" && !(target && (EDITABLE.test(target.tagName) || target.isContentEditable))) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <KeyboardHelpDialog open={open} onOpenChange={setOpen} scope={scope} />;
}
