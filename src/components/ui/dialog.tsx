"use client";
import * as RD from "@radix-ui/react-dialog";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./button";
import { useDialogReturnFocus } from "./dialog-return-focus";

export type DialogAction = { label: string; variant?: ButtonVariant; onClick?: () => void | Promise<void>; primary?: boolean; keepOpen?: boolean };
export type DialogVariant = "confirm" | "danger" | "info" | "form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: ReactNode;
  actions: DialogAction[];
  variant?: DialogVariant;
  /** danger: the primary action stays `.dis` until the user types this exact text */
  confirmText?: string;
  width?: number;
  actsStyle?: CSSProperties;
  children?: ReactNode;
  /** render the `<p>` after `children` (admin invite-result: QR + link first, text below) */
  bodyAfterChildren?: boolean;
};

/**
 * `.dlg > .card2 > h3 + p + [input] + .acts` — Radix Dialog supplies focus trap, Esc and overlay click; on close, focus
 * returns to the element that opened it (see dialog-return-focus.ts).
 * Overlay and Content are nested on purpose so the DOM equals the mockup's `.dlg/.card2` pair.
 */
export function Dialog({ open, onOpenChange, title, body, actions, variant = "confirm", confirmText, width, actsStyle, children, bodyAfterChildren }: Props) {
  const [typed, setTyped] = useState("");
  const onCloseAutoFocus = useDialogReturnFocus();
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const needsConfirm = variant === "danger" && Boolean(confirmText);
  const confirmed = !needsConfirm || typed === confirmText;

  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="dlg">
          <RD.Content className="card2" style={width ? { width } : undefined} onCloseAutoFocus={onCloseAutoFocus}>
            <RD.Title asChild>
              <h3>{title}</h3>
            </RD.Title>
            {body && !bodyAfterChildren && (
              <RD.Description asChild>
                <p>{body}</p>
              </RD.Description>
            )}
            {children}
            {body && bodyAfterChildren && (
              <RD.Description asChild>
                <p>{body}</p>
              </RD.Description>
            )}
            {needsConfirm && <input value={typed} placeholder={confirmText} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />}
            <div className="acts" style={actsStyle}>
              {actions.map((a) => (
                <Button
                  key={a.label}
                  variant={a.variant}
                  disabled={a.primary && !confirmed}
                  onClick={async () => {
                    await a.onClick?.();
                    if (!a.keepOpen) onOpenChange(false);
                  }}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </RD.Content>
        </RD.Overlay>
      </RD.Portal>
    </RD.Root>
  );
}
