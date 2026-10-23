/**
 * Where the selected spot's dot should sit so it stays visible: above the mobile sheet, or beside the 400px desktop panel
 * (`map.setPadding`, BUILD.md 7.2). Pure numbers in, padding out.
 */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

export const SHEET_PEEK_PX = 176;
export const SHEET_EXPANDED_RATIO = 0.88;
export const PANEL_WIDTH_PX = 400;
export const PANEL_INSET_PX = 16;
/** Space the marker (head + tail) needs above its dot. */
export const MARKER_CLEARANCE_PX = 84;

export interface SelectionLayout {
  desktop: boolean;
  /** Height of the map area (below the desktop nav, above the mobile tab bar). */
  mapHeight: number;
  /** Height of the whole viewport (the sheet is a percentage of this one). */
  viewportHeight: number;
  snap: "peek" | "expanded";
  /** Bottom edge of the floating mobile header, in map coordinates. */
  headerBottom: number;
  /** The desktop filter drawer is open on the left (400px + insets). */
  drawerOpen: boolean;
}

export function selectionPadding(l: SelectionLayout): Padding {
  if (l.desktop) {
    const side = PANEL_WIDTH_PX + PANEL_INSET_PX * 2;
    return { top: MARKER_CLEARANCE_PX, right: side, bottom: PANEL_INSET_PX, left: l.drawerOpen ? side : 0 };
  }
  if (l.snap === "peek") {
    return { top: Math.max(l.headerBottom, MARKER_CLEARANCE_PX), right: 0, bottom: SHEET_PEEK_PX + PANEL_INSET_PX, left: 0 };
  }
  // Expanded: the sheet covers 88% of the screen, so the dot goes just above its top edge (the marker head needs ~84px above it, so it may peek out at the top).
  const sheetTop = l.viewportHeight * (1 - SHEET_EXPANDED_RATIO);
  const dotY = Math.max(40, sheetTop - 6);
  return { top: 0, right: 0, bottom: Math.max(0, l.mapHeight - dotY * 2), left: 0 };
}

export const samePadding = (a: Padding, b: Padding): boolean =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
