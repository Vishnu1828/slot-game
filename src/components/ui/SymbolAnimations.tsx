import { useRef } from "react";
import { useTick } from "@pixi/react";
import type { Container, Ticker } from "pixi.js";
import PixiContainer from "../pixi/PixiContainer";
import { PixiSprite } from "../pixi/PixiSprite";
import { PixiGameAnimation } from "../pixi/PixiGameAnimation";
import { cellGeometry, type Rect } from "@/utils/reelCells";
import {
  hasSheet,
  type AnimatedCell,
  type SymbolAnimKind,
} from "@/utils/symbolAnimations";
import type { SymbolArt } from "@/types/theme";

/**
 * Default render box per beat, as a multiple of the cell box. The sheets are authored larger than the
 * 280px still symbol (bounce 308, winning 391) so an effect can overshoot its cell; without this the
 * animation would be squeezed into the still symbol's footprint and the overshoot would be clipped away.
 * A symbol overrides these via `bounceSizeFrac` / `winningSizeFrac`.
 */
const SIZE_FRAC = { bounce: 308 / 280, winning: 391 / 280 } as const;

/** Code-driven bounce, used when a symbol has no bounce sheet: squash-and-overshoot on the still art. */
const BOUNCE_CURVE = (p: number) =>
  p < 0.45
    ? 1 + 0.18 * Math.sin((p / 0.45) * Math.PI) // swell up and back
    : 1 - 0.06 * Math.sin(((p - 0.45) / 0.55) * Math.PI); // small dip, settle at 1

export interface SymbolAnimationsProps {
  /** Inner opening of the reel frame (the symbol grid box), in DesignStage px. */
  innerRect: Rect;
  rows: number;
  cols: number;
  /** Cells to animate. De-duped by the caller — see `winningCells`. */
  cells: AnimatedCell[];
  kind: SymbolAnimKind;
  /** SymbolId → art (`theme.symbols`). */
  symbols: Record<string, SymbolArt>;
  /** Beat length; the sheet's playback speed is derived from it so frame count doesn't matter. */
  durationMs: number;
}

/**
 * Per-symbol win animations drawn over the reels — one instance per beat (`bounce`, then `winning`).
 *
 * Each cell resolves in order of preference:
 *  1. the symbol's sheet for this beat, if it loaded → play it over the beat's duration;
 *  2. `bounce` with no sheet → the still symbol, squashed on the ticker (no assets, no memory);
 *  3. neither → render nothing, leaving the still symbol from `Reels` visible.
 *
 * Positions come from the same `cellGeometry` the reels use, so the two cannot drift.
 *
 * Mount with a `key` that changes per spin so every animation restarts from frame 0.
 */
export function SymbolAnimations({
  innerRect,
  rows,
  cols,
  cells,
  kind,
  symbols,
  durationMs,
}: SymbolAnimationsProps) {
  const { box, centre } = cellGeometry(innerRect, rows, cols);

  if (cells.length === 0) return null;

  return (
    // eventMode "none" so the animations never swallow taps meant for the controls underneath.
    <PixiContainer eventMode="none">
      {cells.map(({ row, col, symbolId }) => {
        const art = symbols[symbolId];
        if (!art) return null;
        const { x, y } = centre(row, col);
        const key = `${row}:${col}`;

        if (hasSheet(art, kind)) {
          const sheet = (kind === "bounce" ? art.bounce : art.winning)!;
          const frac =
            (kind === "bounce" ? art.bounceSizeFrac : art.winningSizeFrac) ??
            SIZE_FRAC[kind];
          const size = box * frac;
          return (
            <PixiGameAnimation
              key={key}
              sheet={sheet}
              x={x}
              y={y}
              anchor={0.5}
              // Fixed box, NOT aspect-fitted per texture: `width`/`height` on an AnimatedSprite resolve
              // against the CURRENT frame, so fitting per frame would rescale (and warp) every frame.
              // Safe because every sheet is authored at a uniform frame size.
              width={size}
              height={size}
              durationMs={durationMs}
              loop={kind === "winning"}
            />
          );
        }

        if (kind === "bounce") {
          return (
            <CodeBounce
              key={key}
              alias={art.asset}
              x={x}
              y={y}
              box={box}
              durationMs={durationMs}
            />
          );
        }
        return null; // no winning sheet — the still symbol simply stays put
      })}
    </PixiContainer>
  );
}

/**
 * The fallback bounce: the still symbol scaled on the ticker. Identical in effect to a flipbook of the
 * same art at varying scale, but with no sheet to author, load or keep in memory.
 */
function CodeBounce({
  alias,
  x,
  y,
  box,
  durationMs,
}: {
  alias: string;
  x: number;
  y: number;
  box: number;
  durationMs: number;
}) {
  const ref = useRef<Container>(null);
  const elapsed = useRef(0);

  useTick((ticker: Ticker) => {
    const c = ref.current;
    if (!c) return;
    elapsed.current += ticker.deltaMS;
    const p = Math.min(1, elapsed.current / durationMs);
    c.scale.set(BOUNCE_CURVE(p));
  });

  return (
    <PixiContainer ref={ref} x={x} y={y}>
      <PixiSprite texture={alias} anchor={0.5} width={box} height={box} />
    </PixiContainer>
  );
}

export default SymbolAnimations;
