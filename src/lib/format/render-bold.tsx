import { Fragment, type ReactNode } from "react";

/** Renders copy strings that contain `<b>…</b>` markers (e.g. dialog.deleteMember.text) without innerHTML. */
export function renderBold(text: string): ReactNode {
  const parts = text.split(/<b>(.*?)<\/b>/);
  return parts.map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>));
}
