/** Join class names, skipping falsy values: cx("mp-btn", primary && "mp-btn--primary"). */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
