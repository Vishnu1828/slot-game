import { type Texture } from "pixi.js";
import { getAsset } from "@/utils/assets";
import { REEL } from "@/constants/reel";
import type { LayoutMode } from "@/hooks/useScreen";
import type { ReelArt } from "@/types/theme";

/** A screen-space rectangle (px). Used for the reel frame opening and symbol layout. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How much of a cell a symbol fills (0..1). Lives here rather than as a default inside `Reels` because
 * anything drawing ON the grid (win animations, highlights) has to match it exactly — a second copy of
 * this number is a drift bug waiting to happen.
 */
export const REEL_FILL = 0.86;

export interface CellGeometry {
  cellW: number;
  cellH: number;
  /** Square box a symbol is drawn at, centred on its cell. */
  box: number;
  /** Centre of cell (row, col) in the same space as `inner`. */
  centre: (row: number, col: number) => { x: number; y: number };
}

/**
 * Cell metrics for a rows x cols grid inside the frame opening `inner`.
 *
 * The single source of truth for where a symbol sits: `Reels` positions its sprites from this, and any
 * overlay drawing on the grid derives from the same function, so the two provably cannot diverge.
 */
export function cellGeometry(
  inner: Rect,
  rows: number,
  cols: number,
  fill: number = REEL_FILL,
): CellGeometry {
  const cellW = inner.w / cols;
  const cellH = inner.h / rows;
  return {
    cellW,
    cellH,
    box: Math.min(cellW, cellH) * fill,
    centre: (row, col) => ({
      x: inner.x + col * cellW + cellW / 2,
      y: inner.y + (row + 0.5) * cellH,
    }),
  };
}

/**
 * Where the reel frame sits: fit inside the per-mode `REEL` box preserving the art's own aspect, then
 * centred. Returns undefined until the frame texture is loaded (its aspect is what drives the fit).
 *
 * Shared rather than inlined because the win screen sizes itself against this box — the celebration is
 * meant to land ON the slot, so the two have to be derived from the same numbers.
 */
export function reelFrameRect(
  reel: ReelArt,
  mode: LayoutMode,
  portrait: boolean,
  w: number,
  h: number,
): Rect | undefined {
  const o = portrait ? reel.vertical : reel.horizontal;
  const tex = getAsset<Texture>(o.frame);
  if (!tex) return undefined;

  const s = REEL[mode];
  const aspect = tex.width / tex.height;
  let fw = s.widthFrac * w;
  let fh = fw / aspect;
  if (fh > s.heightFrac * h) {
    fh = s.heightFrac * h;
    fw = fh * aspect;
  }
  return { x: w / 2 - fw / 2, y: s.centerYFrac * h - fh / 2, w: fw, h: fh };
}

/**
 * The symbol grid OPENING — the frame rect minus that orientation's fractional border insets. This is
 * the box every per-cell calculation starts from (`cellGeometry` takes it as `inner`).
 *
 * Shared for the same reason as `reelFrameRect`: anything drawing on the grid from outside `ReelFrame`
 * — the per-reel landing bounce, for one — has to land on exactly the same cells, and a second copy of
 * these fractions would drift the moment a theme retunes its insets.
 */
export function reelInnerRect(
  reel: ReelArt,
  mode: LayoutMode,
  portrait: boolean,
  w: number,
  h: number,
): Rect | undefined {
  const frame = reelFrameRect(reel, mode, portrait, w, h);
  if (!frame) return undefined;

  const { inset } = portrait ? reel.vertical : reel.horizontal;
  return {
    x: frame.x + inset.left * frame.w,
    y: frame.y + inset.top * frame.h,
    w: frame.w * (1 - inset.left - inset.right),
    h: frame.h * (1 - inset.top - inset.bottom),
  };
}
