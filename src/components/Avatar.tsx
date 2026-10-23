import { cx } from "../lib/cx";
import { t } from "../lib/i18n";

/** Stable tilt token for a list position: index % 4 → --tilt-1..4 (never random). */
export function tiltVar(index: number): string {
  return `var(--tilt-${((index % 4) + 4) % 4 + 1})`;
}

/** Style object that sets `--tilt` from a list position. */
export function tiltStyle(index: number): Record<string, string> {
  return { "--tilt": tiltVar(index) };
}

/** Stable 1..6 bucket from a name (djb2 over the lowercase name) → avatar-1..avatar-6. */
export function avatarTone(name: string): number {
  let hash = 5381;
  for (const ch of name.trim().toLowerCase()) {
    hash = ((hash << 5) + hash + (ch.codePointAt(0) ?? 0)) >>> 0;
  }
  return (hash % 6) + 1;
}

/** First two letters of a name, as typed (first one capitalised): "Ana" → "Co", "iñaki" → "Iñ". */
export function initialsOf(name: string): string {
  const [first = "", second = ""] = Array.from(name.trim());
  return first.toLocaleUpperCase("es") + second;
}

const UNKNOWN_NAMES = new Set(["", "¿?", "?"]);

interface AvatarProps {
  /** Person's name as typed; empty, null or "¿?" renders the unknown placer. */
  name: string | null | undefined;
  /** List position, for the stable tilt. Omit for no tilt. */
  index?: number;
  /** 24, 28, 32 (default), 48 px or "lg" (96 px profile). */
  size?: 24 | 28 | 32 | 48 | "lg";
  /** True (default) when the name is written next to it; false exposes the name to assistive tech. */
  decorative?: boolean;
  class?: string;
}

/** A person as a sticker: first two letters on a pastel die-cut circle. */
export function Avatar({ name, index, size = 32, decorative = true, class: className }: AvatarProps) {
  const clean = (name ?? "").trim();
  const unknown = UNKNOWN_NAMES.has(clean);
  const tone = unknown ? 0 : avatarTone(clean);
  const style: Record<string, string> = index === undefined ? {} : tiltStyle(index);
  if (typeof size === "number" && size !== 32) style["--s"] = `${size}px`;
  return (
    <span
      class={cx(
        "mp-avatar",
        tone > 1 && `mp-avatar--${tone}`,
        unknown && "mp-avatar--unknown",
        size === "lg" && "mp-avatar--lg",
        className,
      )}
      style={style}
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : unknown ? t("components.person.unidentified") : clean}
    >
      {unknown ? t("common.person.unknownPlacer") : initialsOf(clean)}
    </span>
  );
}

interface AvatarGroupProps {
  names: readonly string[];
  size?: 24 | 28 | 32 | 48;
  class?: string;
}

/** Overlapping avatars (-6px). Write the names out next to it: the group is decorative. */
export function AvatarGroup({ names, size, class: className }: AvatarGroupProps) {
  return (
    <span class={cx("mp-avatars", className)}>
      {names.map((name, i) => (
        <Avatar key={`${name}-${i}`} name={name} index={i} size={size} />
      ))}
    </span>
  );
}
