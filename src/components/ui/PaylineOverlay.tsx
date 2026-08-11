import { useEffect, useRef } from "react";
import { extend, useTick } from "@pixi/react";
import {
  Graphics,
  type Container,
  type Texture,
  type Ticker,
} from "pixi.js";
import { getAsset } from "@/utils/assets";
import PixiContainer from "../pixi/PixiContainer";
import { PixiSprite } from "../pixi/PixiSprite";
import { commonTheme } from "@/constants/commonTheme";
import { PAYLINE_MS, PAYLINE_CYCLES } from "@/constants/winPresentation";
import type { Rect } from "@/utils/reelCells";
import type { WinLine } from "@/game/math/types";

// Register <pixiGraphics> as a JSX element (used only for the per-line clip masks).
extend({ Graphics });

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * TIMING — the glow runs for exactly PAYLINE_MS, the same constant `useWinPresentation` waits on before
 * opening the win screen, so the two beats can never overlap or leave a gap.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Alpha the glow dips to between pulses (the final descent still goes all the way to 0). */
const MIN_ALPHA = 0.25;
const CYCLE_MS = PAYLINE_MS / PAYLINE_CYCLES;

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * MEASURED ART CONSTANTS — from the source PNGs in `raw-assets/common{m}/ui/payline{tps}{fix}/`
 * (alpha centroid per pixel column), as fractions of each frame's OWN untrimmed height. These
 * describe the ART — don't "tidy" them.
 *
 *   line123.png  3311 x  106   flat bar, centre at y = 0.4951 for every x
 *   line4.png    3312 x 1553   flat ends at y = 0.2089 (row 0), apex at (x 0.5, y 0.9603) -> row 2
 *   line5.png    3312 x 1553   flat ends at y = 0.7904 (row 2), apex at (x 0.5, y 0.0390) -> row 0
 *
 * Both V frames put their bends at x = 0.1076 / 0.5004 / 0.8932 — the column centres (0.1/0.5/0.9) of
 * a 5-column grid, so the grid spans 0.982 of the art width and the glow deliberately overhangs the
 * opening by ~0.9% per side. Their reference points are 0.7514 of texture height apart across TWO grid
 * rows, so one row = 0.7514 x 1553 / 2 = 583.45 art px -> the authoring grid is 3312 x 1750.3 px
 * (aspect 1.892, vs the landscape opening's 1.853 — a 2% match, confirming what it was drawn for).
 *
 * A plain stretch to the opening would land the V apex at 0.96 of the grid height instead of the
 * row-2 centre at 0.8333, which is visibly wrong — hence the scale-and-offset in `place()`.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Height of the grid the art was authored against, in art px. Vertical scale = inner.h / this. */
const ART_GRID_H = 1750.3;
/** Fraction of the art's width the grid opening occupies (its bends sit on the column centres). */
const ART_GRID_W_FRAC = 0.982;

/**
 * Art per line shape. `refY` is where the frame's reference feature sits inside its own texture
 * (fraction of height); `row` is the grid row that feature must line up with.
 *  - `straight` — the bar itself; its row comes from the payline.
 *  - `vDown`    — the flat TOP ends (row 0); the apex is the bottom row.
 *  - `vUp`      — the flat BOTTOM ends (row 2); the apex is the top row.
 */
const ART = {
  straight: { frame: commonTheme.payline.straight, refY: 0.4951 },
  vDown: { frame: commonTheme.payline.vDown, refY: 0.2089, row: 0 },
  vUp: { frame: commonTheme.payline.vUp, refY: 0.7904, row: 2 },
} as const;

const same = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Pick the art for a payline from its ROW PATTERN rather than its index, so this keeps working if the
 * `lines` table is reordered. Returns null for a shape we have no art for — better to draw nothing
 * than to draw the wrong line.
 *
 * Pass the FULL per-reel pattern (`MathConfig.lines[lineId]`), never `WinLine.rows`: that field is
 * `line.slice(0, count)`, so a 3-of-5 win carries only a 3-row prefix.
 */
const resolveArt = (line: number[]) => {
  if (line.length === 0) return null;
  if (line.every((r) => r === line[0])) return { ...ART.straight, row: line[0] };
  if (same(line, [0, 1, 2, 1, 0])) return ART.vDown;
  if (same(line, [2, 1, 0, 1, 2])) return ART.vUp;
  return null;
};

/**
 * Which side of a win's match boundary this instance draws.
 *
 * A win covers `count` reels from the left. The line reads best when it passes BEHIND the symbols it
 * actually pays for (so those symbols stay fully legible and appear "on" the line) and IN FRONT of the
 * reels it doesn't (so it reads as a line merely crossing them). A 5-of-a-kind therefore has no `front`
 * segment at all, a 4-of-a-kind has one reel in front, a 3-of-a-kind has two.
 *
 * The caller renders one instance per side, on either side of `<Reels>` in the tree.
 */
export type PaylineSegment = "behind" | "front";

export interface PaylineOverlayProps {
  /** Inner opening of the reel frame (the symbol grid box), in DesignStage px. */
  innerRect: Rect;
  rows: number;
  /** Grid columns — needed to find the match boundary (`count` cells from the left). */
  cols: number;
  /** The full payline table (`MathConfig.lines`) — [lineIndex][reelIndex] = rowIndex. */
  lines: number[][];
  /** Winning lines of the settled spin. */
  wins: WinLine[];
  /** Draw the matched span (`behind`, under the symbols) or the rest (`front`, over them). */
  segment: PaylineSegment;
}

/**
 * Winning paylines drawn across the reel grid. Each win's line shape picks a still glow image, which is
 * scaled and offset so its reference features land exactly on the relevant cell centres, then made to
 * glow brighter and dimmer for `PAYLINE_MS` before the win screen takes over.
 *
 * The glow is a code-driven alpha pulse on the container, mutated through a ref rather than React state
 * (same pattern as `Toast`), so it costs nothing per frame and doesn't re-render the tree.
 *
 * Mount with a `key` that changes per spin: a fresh mount is the whole reset mechanism.
 */
export function PaylineOverlay({
  innerRect,
  rows,
  cols,
  lines,
  wins,
  segment,
}: PaylineOverlayProps) {
  const containerRef = useRef<Container>(null);
  const elapsed = useRef(0);
  const done = useRef(false);

  useTick((ticker: Ticker) => {
    const c = containerRef.current;
    if (!c || done.current) return;
    elapsed.current += ticker.deltaMS;
    const t = elapsed.current;
    if (t >= PAYLINE_MS) {
      c.alpha = 0;
      done.current = true;
      return;
    }
    // Sine pulse: dim at the cycle boundaries, full bright at the midpoint.
    const p = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / CYCLE_MS);
    // The floor keeps the line readable between pulses, then drops for the FINAL descent so the line
    // exits to nothing. Switching it exactly at the last peak (where p === 1) keeps the curve smooth.
    const floor = t >= PAYLINE_MS - CYCLE_MS / 2 ? 0 : MIN_ALPHA;
    c.alpha = floor + (1 - floor) * p;
  });

  // Stretch to the opening's width, scale so one authoring row === one real cell, then shift the art
  // so its reference feature sits on the target row's centre. `Texture.width/height` report the
  // UNTRIMMED size and Pixi bakes the atlas trim offset into the sprite, so trimmed frames land right.
  const cellW = innerRect.w / cols;
  const place = (tex: Texture, refY: number, row: number): Rect => {
    const h = tex.height * (innerRect.h / ART_GRID_H);
    const w = innerRect.w / ART_GRID_W_FRAC;
    return {
      x: innerRect.x - (w - innerRect.w) / 2,
      y: innerRect.y + ((row + 0.5) * innerRect.h) / rows - refY * h,
      w,
      h,
    };
  };

  // One sprite per distinct art+row: two wins that resolve to the same line must not stack and
  // double up the glow.
  const seen = new Set<string>();
  const sprites = wins.flatMap((win) => {
    const art = resolveArt(lines[win.lineId] ?? []);
    if (!art) return [];
    const key = `${art.frame}:${art.row}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const tex = getAsset<Texture>(art.frame);
    if (!tex) return []; // atlas not loaded yet — guard only, `payline` ships in `common`

    // The match boundary: `count` cells from the left edge of the opening.
    const splitX = innerRect.x + Math.min(win.count, cols) * cellW;
    const clipX = segment === "behind" ? innerRect.x : splitX;
    const clipW =
      segment === "behind"
        ? splitX - innerRect.x
        : innerRect.x + innerRect.w - splitX;
    if (clipW <= 0) return []; // e.g. a 5-of-a-kind has no `front` segment

    return [{ key, tex, rect: place(tex, art.refY, art.row), clipX, clipW }];
  });

  if (sprites.length === 0) return null;

  return (
    // alpha 0 so the frame before the first tick isn't a flash at full brightness; eventMode "none"
    // so the lines never swallow taps meant for the reels or the buttons underneath.
    <PixiContainer ref={containerRef} alpha={0} eventMode="none">
      {sprites.map(({ key, tex, rect, clipX, clipW }) => (
        <ClippedLine
          key={key}
          texture={tex}
          rect={rect}
          clipX={clipX}
          clipW={clipW}
        />
      ))}
    </PixiContainer>
  );
}

/**
 * One payline sprite clipped to a horizontal span. Each win has its own boundary (it depends on that
 * line's match count), so the mask lives per sprite rather than on the shared pulse container.
 *
 * The mask spans the sprite's own full height, not the grid opening: the V frames are ~0.887x the grid
 * height and sit slightly outside it, so clipping to `innerRect` vertically would shave their glow.
 */
function ClippedLine({
  texture,
  rect,
  clipX,
  clipW,
}: {
  texture: Texture;
  rect: Rect;
  clipX: number;
  clipW: number;
}) {
  const holderRef = useRef<Container>(null);
  const maskRef = useRef<Graphics>(null);

  useEffect(() => {
    const holder = holderRef.current;
    const mask = maskRef.current;
    if (holder && mask) holder.mask = mask;
    return () => {
      if (holder) holder.mask = null;
    };
  }, []);

  return (
    <PixiContainer ref={holderRef}>
      <pixiGraphics
        ref={maskRef}
        draw={(g: Graphics) => {
          g.clear();
          g.rect(clipX, rect.y, clipW, rect.h);
          g.fill(0xffffff);
        }}
      />
      <PixiSprite
        texture={texture}
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
      />
    </PixiContainer>
  );
}

export default PaylineOverlay;
