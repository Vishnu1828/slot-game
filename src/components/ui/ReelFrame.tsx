import PixiContainer from "../pixi/PixiContainer";
import { PixiSprite } from "../pixi/PixiSprite";
import { PixiGameAnimation } from "../pixi/PixiGameAnimation";
import Reels from "./Reels";
import PaylineOverlay from "./PaylineOverlay";
import SymbolAnimations from "./SymbolAnimations";
import {
  hasSheet,
  type AnimatedCell,
  type SymbolAnimKind,
} from "@/utils/symbolAnimations";
import { useStage } from "@/hooks/useStage";
import { reelFrameRect, reelInnerRect, type Rect } from "@/utils/reelCells";
import type { ReelArt, SymbolArt } from "@/types/theme";
import type { SpeedLevel } from "@/store/useGameControlsStore";
import type { WinLine } from "@/game/math/types";

const CORNER_KEYS = ["tl", "tr", "bl", "br"] as const;

/** Animated-reels control (from the spin engine). When given, the frame renders scrolling reels. */
export interface ReelsControl {
  /** Per-reel symbol strips as asset aliases (`strips[reel][stopIndex]`) — the real math strips. */
  strips: string[][];
  spinId: number;
  /** Top-visible stop index per reel (`SpinResult.stops`). */
  stops: number[];
  speed: SpeedLevel;
  onSettled: () => void;
  /**
   * Fired as EACH reel lands, with its column index — before `onSettled`, which only fires once every
   * reel has stopped. Drives per-reel landing feedback (e.g. bouncing that reel's symbols).
   */
  onReelLanded?: (col: number) => void;
  /**
   * Is this spin's win-presentation art loaded? While false the reels keep turning (capped per speed), so
   * the spin covers the download. See `Reels`' own `artReady`.
   */
  artReady?: () => boolean;
}

/**
 * Winning-payline presentation for the settled spin. Omit (or pass no wins) while the reels are
 * spinning or when nothing paid.
 */
export interface PaylineControl {
  /** The full payline table (`MathConfig.lines`) — the art is chosen from the FULL row pattern. */
  lines: number[][];
  wins: WinLine[];
  /** Bumped per presentation (use `spinId`) — remounts the overlay so the pulse restarts. */
  runId: number;
}

/**
 * Per-symbol win animations for the settled spin — one beat at a time (`bounce`, then `winning`).
 * Omit while spinning or when nothing paid.
 */
export interface SymbolAnimControl {
  kind: SymbolAnimKind;
  /** Winning cells, de-duped — build with `winningCells(wins)`. */
  cells: AnimatedCell[];
  /** SymbolId → art (`theme.symbols`). */
  symbols: Record<string, SymbolArt>;
  /** Length of this beat; the sheets' playback speed is derived from it. */
  durationMs: number;
  /** Bumped per beat (`${spinId}-${kind}`) — remounts so every animation restarts from frame 0. */
  runId: string;
}

export interface ReelFrameProps {
  /** Per-game reel descriptor (theme.reel): frame/bg art, grid shape, decorative animations. */
  reel: ReelArt;
  /** Animated reels (from the spin engine). Omit for the empty scaffold. */
  reels?: ReelsControl;
  /** Winning paylines to pulse over the symbols. */
  paylines?: PaylineControl;
  /** Per-symbol win animations for the current beat. */
  symbolAnims?: SymbolAnimControl;
}

/**
 * Reusable, data-driven slot playfield: ornate frame + purple reel background + a rows×cols symbol
 * grid + theme-driven corner/edge animations. Self-positioning (centered, sized per layout mode);
 * portrait uses the vertical art, landscape/desktop the horizontal. All decoration positions are
 * FRAME-local, so they track the frame at any size. Renders nothing until the frame texture loads.
 */
export function ReelFrame({
  reel,
  reels,
  paylines,
  symbolAnims,
}: ReelFrameProps) {
  const { w, h, mode, portrait } = useStage();
  const o = portrait ? reel.vertical : reel.horizontal;

  // Fit the frame inside the per-mode box, preserving its texture aspect; then center it.
  const frameRect = reelFrameRect(reel, mode, portrait, w, h);
  if (!frameRect) return null; // need the frame's aspect to lay everything out
  const { w: fw, h: fh } = frameRect;
  const cx = frameRect.x + fw / 2;
  const cy = frameRect.y + fh / 2;

  // Symbol grid opening = frame minus its border insets. Shared so anything drawing ON the grid from
  // outside this component lands on exactly the same cells.
  const inner = reelInnerRect(reel, mode, portrait, w, h)!;

  // BG = the opening expanded by the theme's fractional `bleed`, so the purple tucks under the
  // frame's inner border with no gap. Fractional → adapts to any frame size, tuned per theme.
  const b = o.bleed ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const bg: Rect = {
    x: inner.x - b.left * fw,
    y: inner.y - b.top * fh,
    w: inner.w + (b.left + b.right) * fw,
    h: inner.h + (b.top + b.bottom) * fh,
  };

  // Corner animations → the frame corners. `sameForAll` lights all 4; `perCorner` lights only the
  // corners present (a subset, e.g. top-only). Each is nudged INWARD by its `inset` (onto the gem).
  const cornerPt = {
    tl: [frameRect.x, frameRect.y, 1, 1],
    tr: [frameRect.x + fw, frameRect.y, -1, 1],
    bl: [frameRect.x, frameRect.y + fh, 1, -1],
    br: [frameRect.x + fw, frameRect.y + fh, -1, -1],
  } as const;
  const corners = reel.corners;
  const cornerAnims = !corners
    ? []
    : CORNER_KEYS.flatMap((k) => {
        const anim =
          "sameForAll" in corners ? corners.sameForAll : corners.perCorner[k];
        if (!anim) return [];
        const [px, py, sx, sy] = cornerPt[k];
        const d = (anim.inset ?? 0) * fw;
        return [{ key: k, anim, cx: px + sx * d, cy: py + sy * d }];
      });

  // Still symbols to hide under their animation. Only for `winning`: those sheets draw the symbol AND
  // its effect at a larger size, so the still copy would show as a ghost outline wherever a frame scales
  // or offsets it. The `bounce` beat animates the still art itself (or a sheet at nearly its size), so
  // hiding there would blink the cell instead.
  //
  // Keyed off whether the sheet ACTUALLY RESOLVED, not off the theme entry — that is what makes a missing
  // or misnamed sheet degrade to the plain symbol rather than leaving an empty cell.
  const hiddenCells =
    symbolAnims?.kind === "winning"
      ? symbolAnims.cells.reduce<boolean[][]>((acc, { row, col, symbolId }) => {
          if (hasSheet(symbolAnims.symbols[symbolId], "winning"))
            (acc[col] ??= [])[row] = true;
          return acc;
        }, [])
      : undefined;

  return (
    <PixiContainer>
      {/* Purple reel background — the opening plus the theme's bleed (tucked under the frame border). */}
      <PixiSprite texture={o.bg} x={bg.x} y={bg.y} width={bg.w} height={bg.h} />
      {/* Winning paylines, part 1 of 2 — the MATCHED span, drawn BEHIND the symbols so the symbols it
          pays for stay fully legible and read as sitting on the line. Keyed by runId so each
          presentation is a fresh mount and the pulse restarts from zero. */}
      {paylines && paylines.wins.length > 0 && (
        <PaylineOverlay
          key={`behind-${paylines.runId}`}
          segment="behind"
          innerRect={inner}
          rows={reel.rows}
          cols={reel.cols}
          lines={paylines.lines}
          wins={paylines.wins}
        />
      )}

      {/* Scrolling symbol reels (rendered once the spin engine is wired via `reels`). */}
      {reels && (
        <Reels
          innerRect={inner}
          rows={reel.rows}
          cols={reel.cols}
          strips={reels.strips}
          spinId={reels.spinId}
          stops={reels.stops}
          speed={reels.speed}
          onSettled={reels.onSettled}
          onReelLanded={reels.onReelLanded}
          artReady={reels.artReady}
          hiddenCells={hiddenCells}
        />
      )}

      {/* Winning paylines, part 2 of 2 — the span PAST the match, drawn OVER the symbols so it reads as
          a line merely crossing reels that didn't pay. A 5-of-a-kind renders nothing here. Still under
          the ornate frame below, so the glow's tapered ends tuck beneath the border. */}
      {paylines && paylines.wins.length > 0 && (
        <PaylineOverlay
          key={`front-${paylines.runId}`}
          segment="front"
          innerRect={inner}
          rows={reel.rows}
          cols={reel.cols}
          lines={paylines.lines}
          wins={paylines.wins}
        />
      )}

      {/* Per-symbol win animations — above the reels and both payline segments (so a glow bleeding into a
          neighbouring cell covers the line rather than being cut by it), but still under the ornate frame,
          matching the payline convention. Only one beat mounts at a time, so they never z-fight. */}
      {symbolAnims && symbolAnims.cells.length > 0 && (
        <SymbolAnimations
          key={symbolAnims.runId}
          innerRect={inner}
          rows={reel.rows}
          cols={reel.cols}
          cells={symbolAnims.cells}
          kind={symbolAnims.kind}
          symbols={symbolAnims.symbols}
          durationMs={symbolAnims.durationMs}
        />
      )}

      {/* Ornate frame on top — its transparent center shows the grid; edges cover bg/symbol edges. */}
      <PixiSprite
        texture={o.frame}
        anchor={0.5}
        x={cx}
        y={cy}
        width={fw}
        height={fh}
      />

      {/* Corner animations (theme-driven; square, sized as a fraction of frame width). */}
      {cornerAnims.map(({ key, anim, cx: ax, cy: ay }) => (
        <PixiGameAnimation
          key={key}
          sheet={anim.sheet}
          x={ax}
          y={ay}
          width={anim.sizeFrac * fw}
          height={anim.sizeFrac * fw}
          anchor={0.5}
          loop
          animationSpeed={anim.animationSpeed ?? 0.4}
        />
      ))}

      {/* Extra animations at arbitrary frame-relative spots (e.g. top-center). */}
      {reel.extraAnimations?.map((e, i) => {
        const width = e.widthFrac * fw;
        return (
          <PixiGameAnimation
            key={`extra-${i}`}
            sheet={e.sheet}
            x={frameRect.x + e.xFrac * fw}
            y={frameRect.y + e.yFrac * fh}
            width={width}
            height={width / e.aspect}
            anchor={0.5}
            loop
            animationSpeed={e.animationSpeed ?? 0.4}
          />
        );
      })}
    </PixiContainer>
  );
}

export default ReelFrame;
