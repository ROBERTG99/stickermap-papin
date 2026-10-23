import { useId, useState } from "preact/hooks";
import type { StickerType } from "../shared/types";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";
import { TypeSticker } from "./map-parts";

interface LegendProps {
  /** Active types from `/api/types`, in admin order. Fits 3-12 (the list scrolls after about 7 rows). */
  types: StickerType[];
  /** Slug of the type the map is filtered to, if any. */
  activeType?: string | null;
  /** Pressing a row filters to that type; pressing the active one clears it. */
  onToggleType?: (slug: string) => void;
  /** Controlled collapsed state; leave undefined to let the legend manage it. */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  class?: string;
}

/** Map legend: header toggle collapses it to a pill; each row is a type filter. */
export function Legend({ types, activeType, onToggleType, collapsed, defaultCollapsed = false, onCollapsedChange, class: className }: LegendProps) {
  const [inner, setInner] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? inner;
  const listId = useId();

  const toggle = () => {
    const next = !isCollapsed;
    setInner(next);
    onCollapsedChange?.(next);
  };

  return (
    <div class={cx("mp-legend", isCollapsed && "mp-legend--collapsed", className)}>
      <button type="button" class="mp-legend__toggle" aria-expanded={!isCollapsed} aria-controls={listId} onClick={toggle}>
        <span class="mp-legend__stack" aria-hidden="true">
          {types.slice(0, 4).map((t) => (
            <TypeSticker key={t.slug} type={t} />
          ))}
        </span>
        Tipos
        <Icon name={isCollapsed ? "chevron-up" : "chevron-down"} />
      </button>
      <ul class="mp-legend__list" id={listId}>
        {types.map((t) => (
          <li key={t.slug}>
            <button
              type="button"
              class="mp-legend__pick"
              aria-pressed={activeType === t.slug}
              disabled={t.count === 0}
              onClick={() => onToggleType?.(t.slug)}
            >
              <TypeSticker type={t} />
              <span>{t.label}</span>
              <span>{t.count ?? ""}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
