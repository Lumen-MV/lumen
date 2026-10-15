"use client";
import { useEffect, useState } from "react";
import { normalizeUsername, USERNAME_RE } from "@/lib/users/username-rules";

export type UsernameStatus = "idle" | "checking" | "ok" | "taken" | "invalid";
export type UsernameAvailability = { status: UsernameStatus; suggestions: string[] };

const DEBOUNCE_MS = 300;

/** Live check while typing (300ms debounce) against GET /api/username-available. */
export function useUsernameAvailability(username: string, displayName: string): UsernameAvailability {
  const [state, setState] = useState<UsernameAvailability>({ status: "idle", suggestions: [] });

  useEffect(() => {
    const u = normalizeUsername(username);
    if (!u) {
      setState({ status: "idle", suggestions: [] });
      return;
    }
    if (!USERNAME_RE.test(u)) {
      setState({ status: u.length >= 3 ? "invalid" : "idle", suggestions: [] });
      return;
    }
    setState({ status: "checking", suggestions: [] });
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username-available?u=${encodeURIComponent(u)}&name=${encodeURIComponent(displayName)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as { available: boolean; suggestions: string[] };
        setState({ status: d.available ? "ok" : "taken", suggestions: d.suggestions ?? [] });
      } catch (err) {
        if (!ctrl.signal.aborted) {
          console.error("[username-available]", err);
          setState({ status: "idle", suggestions: [] });
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [username, displayName]);

  return state;
}
