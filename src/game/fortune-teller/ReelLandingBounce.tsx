import { useRef, useState } from "react";
import { useTick } from "@pixi/react";
import type { Ticker } from "pixi.js";
import SymbolAnimations from "@/components/ui/SymbolAnimations";
import { useStage } from "@/hooks/useStage";
import { reelInnerRect } from "@/utils/reelCells";
import type { AnimatedCell } from "@/utils/symbolAnimations";
import { BOUNCE_MS } from "@/constants/winPresentation";
import type { ReelArt, SymbolArt } from "@/types/theme";

export interface ReelLandingBounceProps {
  reel: ReelArt;
  /** Symbol-ID strips (NOT asset aliases): `strips[col][stopIndex]`. */
  strips: string[][];
  /** Top-visible stop index per reel for this spin. */
  stops: number[];
  /** SymbolId → art (`theme.symbols`). */
  symbols: Record<string, SymbolArt>;
  /** Columns that have landed so far this spin, in landing order. */
  landedCols: number[];
  /** Bumped per spin — keys the groups so a new spin can't reuse the previous one's. */
  spinId: number;
}

/** Positive modulo — matches the strip cursor in `Reels`. */
const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * One column's bounce, which unmounts itself once the beat is over.
 *
 * Self-expiry is the point: `PixiGameAnimation` with `loop={false}` stops on the sheet's LAST frame, so
 * a group left mounted would keep drawing a second copy of every symbol at 1.1x over the still one —
 * and if a sheet's last frame isn't the rest pose, it would visibly corrupt the idle grid.
 */
function ColumnBounce(props: Parameters<typeof SymbolAnimations>[0]) {
  const elapsed = useRef(0);
  const [done, setDone] = useState(false);

  useTick((ticker: Ticker) => {
    if (done) return;
    elapsed.current += ticker.deltaMS;
    if (elapsed.current >= props.durationMs) setDone(true);
  });

  return done ? null : <SymbolAnimations {...props} />;
}

/**
 * Bounces a reel's symbols as that reel lands, rather than bouncing every winning symbol at once after
 * the whole spin has settled. Each column mounts its own group the moment `Reels` reports it home, so
 * the bounces roll left→right in step with the reels — and it happens on every spin, win or lose,
 * because it is landing feedback rather than win feedback.
 *
 * Game-local rather than part of `ReelFrame`: it needs the SYMBOL-ID strips to know what landed, and
 * `ReelFrame` only ever sees asset aliases. It reads `reelInnerRect` — the same helper `ReelFrame`
 * derives its grid opening from — so both land on exactly the same cells. Mount it after `<ReelFrame>`.
 */
export function ReelLandingBounce({
  reel,
  strips,
  stops,
  symbols,
  landedCols,
  spinId,
}: ReelLandingBounceProps) {
  const { w, h, mode, portrait } = useStage();

  const inner = reelInnerRect(reel, mode, portrait, w, h);
  if (!inner || landedCols.length === 0) return null;

  return (
    <>
      {landedCols.map((col) => {
        const strip = strips[col];
        if (!strip?.length) return null;
        // `stops[col]` sits in row 0 at rest (see `restTop` in Reels), so row r is r steps further on.
        const cells: AnimatedCell[] = Array.from({ length: reel.rows }, (_, row) => ({
          row,
          col,
          symbolId: strip[mod((stops[col] ?? 0) + row, strip.length)],
        }));

        return (
          <ColumnBounce
            key={`${spinId}-${col}`}
            innerRect={inner}
            rows={reel.rows}
            cols={reel.cols}
            cells={cells}
            kind="bounce"
            symbols={symbols}
            durationMs={BOUNCE_MS}
          />
        );
      })}
    </>
  );
}

export default ReelLandingBounce;
