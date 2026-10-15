/** Joins truthy class names: cx("btn", isRed && "r") → "btn r". */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
