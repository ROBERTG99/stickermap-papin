import { cx } from "../lib/cx";

type Dimension = number | string;

function px(value: Dimension | undefined): string | undefined {
  return typeof value === "number" ? `${value}px` : value;
}

interface SkeletonProps {
  /** "line" is a text line, "circle" an avatar; default is a plain block. */
  variant?: "block" | "line" | "circle";
  /** Match the real content: numbers are px. */
  width?: Dimension;
  height?: Dimension;
  /** CSS aspect-ratio, e.g. "4/5". */
  ratio?: string;
  radius?: Dimension;
  class?: string;
}

/** Placeholder shaped like what is loading (shimmer is removed under reduced motion). Never for buttons. */
export function Skeleton({ variant = "block", width, height, ratio, radius, class: className }: SkeletonProps) {
  const style: Record<string, string> = {};
  const w = px(width);
  const h = px(height);
  const r = px(radius);
  if (w) style.width = w;
  if (h) style.height = h;
  if (ratio) style.aspectRatio = ratio;
  if (r) style.borderRadius = r;
  return (
    <div
      class={cx("mp-skel", variant === "line" && "mp-skel--line", variant === "circle" && "mp-skel--circle", className)}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Loading shape of the spot sheet: photo + title, place and two chips. Wrap in a live region with aria-busy. */
export function SpotSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: "var(--space-3)" }}>
      <Skeleton ratio="4/5" radius="var(--radius-md)" />
      <div style={{ display: "grid", gap: "10px", alignContent: "start" }}>
        <Skeleton variant="line" width="80%" height={20} />
        <Skeleton variant="line" width="40%" />
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Skeleton width={84} height={32} radius={16} />
          <Skeleton width={84} height={32} radius={16} />
        </div>
      </div>
    </div>
  );
}

const TILE_HEIGHTS = [180, 130, 150, 190] as const;

interface GallerySkeletonProps {
  /** Number of tiles (default 4). */
  count?: number;
}

/** Loading masonry for the gallery: heights cycle by index, never random. */
export function GallerySkeleton({ count = 4 }: GallerySkeletonProps) {
  return (
    <div style={{ columns: "2", columnGap: "14px" }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ marginBottom: "14px", breakInside: "avoid" }}>
          <Skeleton height={TILE_HEIGHTS[i % TILE_HEIGHTS.length]} radius={6} />
        </div>
      ))}
    </div>
  );
}
