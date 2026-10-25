import type { IconFit } from "../shared/types";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { tiltById } from "./map-parts";

export interface MarkerOptions {
  /** Spot id: drives the stable tilt (hash mod 4). */
  id: string;
  /** Display labels of the spot's types; the first one is the head icon ("Papa", "Sexo."). */
  types: string[];
  /** Icon URL of the first type. */
  iconUrl: string;
  /** `contain` for cut-outs (Papa, Otro), `cover` for photo-like icons. */
  fit: IconFit;
  /** Number of types; above 1 shows the "+N" badge. Defaults to `types.length`. */
  n?: number;
  selected?: boolean;
  /** 32px head, optional at zoom 3-5 for lone spots. */
  small?: boolean;
  /** F1: the spot has a video (play badge on the head). */
  video?: boolean;
  /** Place name appended to the accessible name ("Papa y 1 más, Puerta del Sol"). */
  label?: string | null;
}

/** "Papa y 1 más, Puerta del Sol" */
export function markerAriaLabel(o: Pick<MarkerOptions, "types" | "n" | "label">): string {
  const count = o.n ?? o.types.length;
  const first = o.types[0] ?? t("components.marker.sticker");
  const head = count > 1 ? t("components.marker.withMore", { first, n: count - 1 }) : first;
  const place = o.label ? `, ${o.label}` : "";
  return `${head}${place}`;
}

/** Cluster bubble size by count: default 36px for 2-9, `md` 48px for 10-49, `lg` 64px for 50+. */
export function clusterSize(count: number): "sm" | "md" | "lg" {
  if (count >= 50) return "lg";
  if (count >= 10) return "md";
  return "sm";
}

function clusterClass(count: number): string {
  const size = clusterSize(count);
  return cx("mp-cluster", size === "md" && "mp-cluster--md", size === "lg" && "mp-cluster--lg");
}

function formatCount(count: number): string {
  return count.toLocaleString("es-AR");
}

export function clusterAriaLabel(count: number): string {
  return t("components.marker.cluster", { count: formatCount(count) });
}

/**
 * DOM element for `new maplibregl.Marker({ element, anchor: "bottom", offset: [0, 4] })`.
 * `button.mp-marker` > head (+ "+N" badge) + tail + dot; the dot is the real coordinate.
 */
export function createMarkerElement(o: MarkerOptions): HTMLButtonElement {
  const count = o.n ?? o.types.length;
  const el = document.createElement("button");
  el.type = "button";
  el.className = cx("mp-marker", o.small && "mp-marker--sm", o.selected && "is-selected");
  el.dataset.spotId = o.id;
  el.style.setProperty("--tilt", tiltById(o.id));
  el.setAttribute("aria-label", markerAriaLabel(o));
  if (o.selected) el.setAttribute("aria-current", "true");

  const head = document.createElement("span");
  head.className = cx("mp-marker__head", o.fit === "contain" && "mp-marker__head--contain");
  const img = document.createElement("img");
  img.src = o.iconUrl;
  img.alt = "";
  img.draggable = false;
  head.append(img);
  el.append(head);

  if (o.video) {
    const play = document.createElement("span");
    play.className = "mp-marker__play";
    play.innerHTML = '<svg class="mp-i" aria-hidden="true"><use href="#i-play"/></svg>';
    el.append(play);
  }

  if (count > 1) {
    const badge = document.createElement("span");
    badge.className = "mp-marker__badge";
    badge.textContent = `+${count - 1}`;
    el.append(badge);
  }

  const tail = document.createElement("span");
  tail.className = "mp-marker__tail";
  const dot = document.createElement("span");
  dot.className = "mp-marker__dot";
  el.append(tail, dot);
  return el;
}

/** Flip the selected look (56px head, brand ring, straight, 12px dot) without rebuilding the element. */
export function setMarkerSelected(el: HTMLElement, selected: boolean): void {
  el.classList.toggle("is-selected", selected);
  if (selected) el.setAttribute("aria-current", "true");
  else el.removeAttribute("aria-current");
}

/** DOM element for a cluster bubble (only exists up to zoom 5). */
export function createClusterElement(count: number): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = clusterClass(count);
  el.dataset.size = clusterSize(count);
  el.textContent = formatCount(count);
  el.setAttribute("aria-label", clusterAriaLabel(count));
  return el;
}

interface MapMarkerProps extends MarkerOptions {
  onClick?: (id: string) => void;
  class?: string;
}

/** Preact version of the marker (kitchen sink, stories). The map itself uses `createMarkerElement`. */
export function MapMarker({ id, types, iconUrl, fit, n, selected, small, label, video, onClick, class: className }: MapMarkerProps) {
  const count = n ?? types.length;
  return (
    <button
      type="button"
      class={cx("mp-marker", small && "mp-marker--sm", selected && "is-selected", className)}
      style={`--tilt:${tiltById(id)}`}
      aria-label={markerAriaLabel({ types, n, label })}
      aria-current={selected ? "true" : undefined}
      data-spot-id={id}
      onClick={onClick ? () => onClick(id) : undefined}
    >
      <span class={cx("mp-marker__head", fit === "contain" && "mp-marker__head--contain")}>
        <img src={iconUrl} alt="" draggable={false} />
      </span>
      {video && <span class="mp-marker__play"><svg class="mp-i" aria-hidden="true"><use href="#i-play" /></svg></span>}
      {count > 1 && <span class="mp-marker__badge">{`+${count - 1}`}</span>}
      <span class="mp-marker__tail" />
      <span class="mp-marker__dot" />
    </button>
  );
}

/** Preact version of a cluster bubble. */
export function MapCluster({ count, onClick }: { count: number; onClick?: () => void }) {
  return (
    <button type="button" class={clusterClass(count)} data-size={clusterSize(count)} aria-label={clusterAriaLabel(count)} onClick={onClick}>
      {formatCount(count)}
    </button>
  );
}

/**
 * "The dot is the truth": a marker with a dashed guide running from its dot, to show that
 * the dot's centre (not the head) sits on the coordinate.
 */
export function MarkerExactDot(props: Omit<MarkerOptions, "selected">) {
  return (
    <div style="display:flex;align-items:flex-end">
      <MapMarker {...props} />
      <span
        aria-hidden="true"
        style="width:var(--space-12);margin-left:calc(var(--marker-head) / -2 + var(--marker-dot) / 2);margin-bottom:calc(var(--marker-dot) / 2);border-top:1.5px dashed var(--ink-strong)"
      />
      <span class="mp-attrib" style="margin-left:var(--space-2);margin-bottom:calc(var(--marker-dot) / 2 - 7px)">
        {t("components.marker.exactDot")}
      </span>
    </div>
  );
}
