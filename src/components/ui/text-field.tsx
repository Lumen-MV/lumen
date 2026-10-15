"use client";
import { useState, type InputHTMLAttributes } from "react";
import { cx } from "@/lib/format/class-names";
import { copy } from "@/lib/copy-vi";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  state?: "bad" | "ok";
  /** Message rendered as `.err` right after the input (red by default). */
  error?: string;
  errorColor?: string;
  /** Password visibility toggle (`.eye` span placed after the input like the mockup). */
  eye?: boolean;
  shake?: boolean;
};

/** `.form input[.bad|.ok]` + optional `.eye` + `.err`. DOM order matches screen-login.js. */
export function TextField({ state, error, errorColor, eye, shake, className, type, ...rest }: Props) {
  const [reveal, setReveal] = useState(false);
  const inputType = eye ? (reveal ? "text" : "password") : type;
  return (
    <>
      <input className={cx(state, shake && "shake", className)} type={inputType} {...rest} />
      {eye && (
        <span className="eye" role="button" tabIndex={0} aria-pressed={reveal} onClick={() => setReveal((v) => !v)} onKeyDown={(e) => e.key === "Enter" && setReveal((v) => !v)}>
          {copy.login.eye}
        </span>
      )}
      {error && (
        <div className="err" style={errorColor ? { color: errorColor } : undefined}>
          {error}
        </div>
      )}
    </>
  );
}
