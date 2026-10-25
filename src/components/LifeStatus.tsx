import { formatAgo, formatDays } from "../lib/format";
import { cx } from "../lib/cx";
import { lang, t } from "../lib/i18n";
import type { SpotLife } from "../shared/types";

/** The words of a life badge: "Vivo · visto hace 3 meses", "Sin noticias hace 14 meses", "Despegado · duró 412 días". */
export function lifeText(life: SpotLife, now = Date.now()): string {
  const l = lang.value;
  if (life.status === "dead") return t("components.life.gone", { days: formatDays(life.days, l) });
  if (life.status === "unknown") return t("components.life.unknown", { ago: formatAgo(life.last_seen_at ?? life.placed_at, now, l) });
  return life.last_seen_at ? t("components.life.aliveSeen", { ago: formatAgo(life.last_seen_at, now, l) }) : t("components.life.alive");
}

/** Life badge (F4): colour dot plus words plus shape, never colour alone. */
export function LifeBadge({ life, class: className }: { life: SpotLife; class?: string }) {
  const kind = life.status === "dead" ? "gone" : life.status;
  return <span class={cx("mp-life", `mp-life--${kind}`, className)}>{lifeText(life)}</span>;
}
