"use client";
import { KeyboardHelpDialog } from "@/components/ui/keyboard-help-dialog";

/** `?` inside the player: the 8-row "Phím tắt" dialog of screen-player.js (ends with "Thoát Esc"). */
export function PlayerKeyboardHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return <KeyboardHelpDialog open={open} onOpenChange={onOpenChange} scope="player" />;
}
