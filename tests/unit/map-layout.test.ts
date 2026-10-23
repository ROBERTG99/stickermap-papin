import { describe, expect, it } from "vitest";
import { MARKER_CLEARANCE_PX, NO_PADDING, SHEET_PEEK_PX, samePadding, selectionPadding, type SelectionLayout } from "../../src/map/layout";

const base: SelectionLayout = { desktop: false, mapHeight: 780, viewportHeight: 844, snap: "peek", headerBottom: 124, drawerOpen: false };

describe("selectionPadding", () => {
  it("desktop: keeps the dot left of the 400px panel (+16px insets)", () => {
    const p = selectionPadding({ ...base, desktop: true });
    expect(p.right).toBe(432);
    expect(p.left).toBe(0);
  });

  it("desktop: also clears the filter drawer on the left", () => {
    expect(selectionPadding({ ...base, desktop: true, drawerOpen: true }).left).toBe(432);
  });

  it("mobile peek: leaves the header on top and the peeking sheet at the bottom", () => {
    const p = selectionPadding(base);
    expect(p.top).toBe(124);
    expect(p.bottom).toBeGreaterThanOrEqual(SHEET_PEEK_PX);
  });

  it("mobile peek: always leaves room for the marker head above the dot", () => {
    expect(selectionPadding({ ...base, headerBottom: 0 }).top).toBe(MARKER_CLEARANCE_PX);
  });

  it("mobile expanded: puts the dot just above the sheet's top edge (88% sheet)", () => {
    const p = selectionPadding({ ...base, snap: "expanded" });
    const dotY = p.top + (base.mapHeight - p.top - p.bottom) / 2;
    const sheetTop = base.viewportHeight * 0.12;
    expect(dotY).toBeLessThan(sheetTop);
    expect(dotY).toBeGreaterThan(0);
  });

  it("never returns negative padding", () => {
    const p = selectionPadding({ ...base, snap: "expanded", mapHeight: 50 });
    expect(Math.min(p.top, p.right, p.bottom, p.left)).toBeGreaterThanOrEqual(0);
  });

  it("compares paddings by value", () => {
    expect(samePadding(NO_PADDING, { top: 0, right: 0, bottom: 0, left: 0 })).toBe(true);
    expect(samePadding(NO_PADDING, { ...NO_PADDING, right: 1 })).toBe(false);
  });
});
