import { Assets, type Texture } from "pixi.js";
import PixiContainer from "../pixi/PixiContainer";
import { PixiSprite } from "../pixi/PixiSprite";
import { reelCells, type Rect } from "@/utils/reelCells";

export interface ReelGridProps {
  /** Inner opening of the frame (screen px) where the grid lives. */
  innerRect: Rect;
  rows: number;
  cols: number;
  /**
   * Symbols to show, as a `rows × cols` grid of texture aliases (undefined = empty cell). Omit to
   * render nothing (the current scaffold state — no symbol art yet). A future spin mechanic feeds
   * this each frame.
   */
  symbols?: (string | undefined)[][];
  /** How much of the cell a symbol fills (0..1). Default 0.86. */
  fill?: number;
}

/**
 * The symbol grid inside a ReelFrame. Lays out one sprite per cell (centered, fit to the cell while
 * preserving the symbol's aspect). Renders nothing until `symbols` are supplied — this is the seam a
 * spin/reel-strip component fills later; the cell geometry comes from `reelCells`.
 */
export function ReelGrid({
  innerRect,
  rows,
  cols,
  symbols,
  fill = 0.86,
}: ReelGridProps) {
  if (!symbols) return null;

  const cells = reelCells(innerRect, rows, cols);

  return (
    <PixiContainer>
      {cells.map((cell, i) => {
        const alias = symbols[Math.floor(i / cols)]?.[i % cols];
        if (!alias) return null;

        // Fit within a square box (min side * fill), preserving the symbol's aspect if it's loaded.
        const box = Math.min(cell.w, cell.h) * fill;
        const tex = Assets.get<Texture>(alias);
        let width = box;
        let height = box;
        if (tex) {
          const a = tex.width / tex.height;
          if (a >= 1) height = box / a;
          else width = box * a;
        }

        return (
          <PixiSprite
            key={i}
            texture={alias}
            anchor={0.5}
            x={cell.x + cell.w / 2}
            y={cell.y + cell.h / 2}
            width={width}
            height={height}
          />
        );
      })}
    </PixiContainer>
  );
}

export default ReelGrid;
