export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Split an inner rectangle into a `rows × cols` grid of equal cell rects (row-major, top-left first).
 * Shared by ReelGrid (symbol placement) and the future spin mechanic (reel-strip layout).
 */
export function reelCells(inner: Rect, rows: number, cols: number): Rect[] {
  const cw = inner.w / cols;
  const ch = inner.h / rows;
  const cells: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: inner.x + c * cw, y: inner.y + r * ch, w: cw, h: ch });
    }
  }
  return cells;
}
