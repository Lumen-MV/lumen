import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/format/class-names";

export type ButtonVariant = "default" | "white" | "red" | "round";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm";
  /** Shows the mockup's `.load` spinner and blocks clicks. */
  loading?: boolean;
};

/** `.btn` + `.w` / `.r` / `.round` / `.sm` / `.load` / `.dis` — same classes as the mockup. */
export function Button({ variant = "default", size, loading, disabled, className, type = "button", children, ...rest }: Props) {
  const cls = cx(
    "btn",
    variant === "white" && "w",
    variant === "red" && "r",
    variant === "round" && "round",
    size === "sm" && "sm",
    loading && "load",
    disabled && "dis",
    className,
  );
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {children}
    </button>
  );
}
