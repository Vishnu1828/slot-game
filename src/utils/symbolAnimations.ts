import { hasAsset } from "@/utils/assets";
import type { SymbolArt } from "@/types/theme";

/** Which beat of the win presentation a symbol animation belongs to. */
export type SymbolAnimKind = "bounce" | "winning";

/** One cell of the grid to animate. `row`/`col` index the VISIBLE grid (row 0 = top). */
export interface AnimatedCell {
  row: number;
  col: number;
  symbolId: string;
}

/**
 * Does this symbol have a usable sheet for this beat?
 *
 * Probes the LOADED asset, not just the theme entry: a declared-but-missing sheet must degrade to the
 * still symbol, and `ReelFrame` uses this same answer to decide whether to hide that still symbol — so
 * asking the resolver is what stops a misnamed sheet leaving an empty cell.
 */
export function hasSheet(
  art: SymbolArt | undefined,
  kind: SymbolAnimKind,
): boolean {
  const sheet = kind === "bounce" ? art?.bounce : art?.winning;
  return !!sheet && hasAsset(`${sheet}.json`);
}

/** The winning cells of a spin's wins, de-duped — a cell on two lines must animate once, not twice. */
export function winningCells(
  wins: { rows: number[]; symbolId: string }[],
): AnimatedCell[] {
  const byCell = new Map<string, AnimatedCell>();
  // `WinLine.rows` is `line.slice(0, count)`, so the index IS the reel and the array covers exactly the
  // reels that matched.
  for (const w of wins)
    w.rows.forEach((row, col) =>
      byCell.set(`${row}:${col}`, { row, col, symbolId: w.symbolId }),
    );
  return [...byCell.values()];
}
