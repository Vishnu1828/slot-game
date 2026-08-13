import { useEffect, useRef } from "react";
import { extend, useTick } from "@pixi/react";
import {
  BlurFilter,
  Graphics,
  Texture,
  type Container,
  type Sprite,
  type Ticker,
} from "pixi.js";
import { getAsset } from "@/utils/assets";
import PixiContainer from "../pixi/PixiContainer";
import { PixiSprite } from "../pixi/PixiSprite";
import { useStage } from "@/hooks/useStage";
import { cellGeometry, REEL_FILL, type Rect } from "@/utils/reelCells";
import { BLUR_CELL_FRAC, BLUR_RAMP_MS, BLUR_REF_CELLS_PER_SEC } from "@/constants/reel";
import type { SpeedLevel } from "@/store/useGameControlsStore";

// Register <pixiGraphics> as a JSX element (used only for the reel-opening mask).
extend({ Graphics });

/** Extra symbol above the top row so a new one can scroll in (the frame border hides it). */
const BUFFER = 1;

/**
 * Cells of REAL strip a reel scrolls through before it stops: at its stop time the cursor jumps to
 * `LAND_LEAD` cells ahead of the result, then scrolls the rest of the way, so the last symbols to
 * enter view are the result's true strip neighbours instead of a hard swap on the stop boundary.
 * 0 = snap exactly on the boundary.
 */
const LAND_LEAD = 3;

/**
 * Reel scroll timing per speed level:
 *  - `cellsPerSec` — vertical scroll speed (symbols pass per second)
 *  - `baseMs`      — when reel 0 stops (from spin start)
 *  - `perReelMs`   — extra delay per following reel (staggered left→right stop)
 *  - `maxHoldMs`   — how long the reels may keep spinning to cover a slow art download (see `artReady`)
 */
const TIMING: Record<
  SpeedLevel,
  { cellsPerSec: number; baseMs: number; perReelMs: number; maxHoldMs: number }
> = {
  1: { cellsPerSec: 16, baseMs: 650, perReelMs: 260, maxHoldMs: 2000 }, // normal
  2: { cellsPerSec: 22, baseMs: 360, perReelMs: 150, maxHoldMs: 1200 }, // fast
  3: { cellsPerSec: 30, baseMs: 170, perReelMs: 80, maxHoldMs: 400 }, // extra fast
};

/** Positive modulo — strip cursors walk backwards, so `%` alone isn't enough. */
const mod = (n: number, m: number) => ((n % m) + m) % m;

export interface ReelsProps {
  /** Inner opening of the frame (screen px) where the reels live. */
  innerRect: Rect;
  rows: number;
  cols: number;
  /**
   * Each reel's symbol strip as asset aliases: `strips[reel][stopIndex]`. This is the SAME data the
   * math engine pays from (`buildStrips`), so what scrolls past is always a genuine consecutive
   * slice of that reel. Lengths differ per reel (e.g. 50/55/60/55/55).
   */
  strips: string[][];
  /** Bumped by the spin engine to start a new spin. */
  spinId: number;
  /** Top-visible stop index per reel for the current `spinId` (`SpinResult.stops`). */
  stops: number[];
  /** Current spin speed level (drives scroll speed + stagger). */
  speed: SpeedLevel;
  /** Called once the last reel has stopped. */
  onSettled: () => void;
  /**
   * Called as EACH reel lands, with its column index — so a caller can give that reel its own landing
   * feedback (bouncing its symbols) while the reels to its right are still turning.
   */
  onReelLanded?: (col: number) => void;
  /**
   * Is this spin's win-presentation art loaded? While this returns false the reels keep spinning, up to
   * `TIMING[speed].maxHoldMs`, so the spin covers the download instead of the glow beat arriving to
   * nothing. Wire it to `useWinPresentation`'s `winArtReady`. Omit it and timing is unchanged.
   */
  artReady?: () => boolean;
  /** How much of a cell a symbol fills (0..1). Default 0.86. */
  fill?: number;
  /**
   * Static symbols to hide at rest, as `[col][row]` over the VISIBLE grid (row 0 = top row, buffer slot
   * excluded). Used by the win presentation: a `winning` sheet draws the symbol *plus* its effect at a
   * larger size, so leaving the still copy underneath shows a ghost outline wherever a frame scales or
   * offsets it. Omit (or pass `undefined`) to show everything.
   */
  hiddenCells?: boolean[][];
}

interface ColState {
  offset: number; // current vertical scroll offset within a cell (0..cellH)
  spinning: boolean;
  elapsed: number; // ms since this spin started
  stopDelay: number; // ms after which this reel lands
  landLeft: number; // cells left to scroll before landing; -1 = not landing yet
  blur: number; // current motion-blur strength, eased toward its target (see BLUR_RAMP_MS)
}

/**
 * Vertically-scrolling slot reels. Each column is a window onto that reel's real strip: a cursor
 * walks the strip backwards as the column scrolls downward (driven per-frame by `useTick`), so the
 * visible symbols are always consecutive strip entries in their true per-reel frequencies. Reels stop
 * staggered left→right, landing with `stops[reel]` in the top row — which makes the visible 3×5 window
 * identical to the engine's `result.grid` by construction, with no separate landing grid to sync.
 * Motion is applied by mutating the Pixi objects through refs (not React state), so scrolling stays
 * smooth and doesn't re-render the tree each frame.
 */
export function Reels({
  innerRect,
  rows,
  cols,
  strips,
  spinId,
  stops,
  speed,
  onSettled,
  onReelLanded,
  artReady,
  fill = REEL_FILL,
  hiddenCells,
}: ReelsProps) {
  // Shared with any overlay that draws on the grid — see `cellGeometry`.
  const { cellW, cellH, box } = cellGeometry(innerRect, rows, cols, fill);
  // Filters work in SCREEN pixels but `cellH` is design px, so the blur is scaled by the stage to stay
  // proportional at any window size.
  const { scale: stageScale } = useStage();
  const stripLen = rows + BUFFER;

  // Root container + a rect mask so symbols are only ever visible inside the frame opening
  // (the scrolling buffer symbols above/below the grid get clipped away).
  const rootRef = useRef<Container>(null);
  const maskRef = useRef<Graphics>(null);

  // Pixi object refs (mutated each frame; never re-created by re-renders).
  const colContainers = useRef<(Container | null)[]>([]);
  const spriteRefs = useRef<(Sprite | null)[][]>([]);
  /** Strip index shown in sprite slot 0 (the BUFFER slot above row 0), per reel. */
  const topIndex = useRef<number[]>([]);
  const colState = useRef<ColState[]>([]);
  const spinningActive = useRef(false);
  const lastSpinId = useRef(spinId);

  // Latest props for the tick loop (avoids stale closures without re-subscribing logic).
  const stripsRef = useRef(strips);
  stripsRef.current = strips;
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const onReelLandedRef = useRef(onReelLanded);
  onReelLandedRef.current = onReelLanded;
  const artReadyRef = useRef(artReady);
  artReadyRef.current = artReady;
  /** Extra ms this spin has stayed in motion waiting for art. Reset per spin; added to every reel. */
  const holdMs = useRef(0);
  const blurScaleRef = useRef(stageScale);
  blurScaleRef.current = stageScale;

  /** One vertical-only blur per reel, attached to that column's container only while it spins. */
  const blurRef = useRef<BlurFilter[]>([]);
  const spinIdRef = useRef(spinId);
  spinIdRef.current = spinId;
  const geomRef = useRef({ innerY: innerRect.y, cellH, box });
  geomRef.current = { innerY: innerRect.y, cellH, box };
  const hiddenRef = useRef(hiddenCells);
  hiddenRef.current = hiddenCells;

  // Apply a symbol alias to a sprite: swap texture and fit it into the cell box (preserve aspect).
  const fit = (
    sprite: Sprite | null | undefined,
    alias: string,
    hidden = false,
  ) => {
    if (!sprite) return;
    const tex = alias ? getAsset<Texture>(alias) : undefined;
    if (!tex) {
      sprite.visible = false;
      return;
    }
    sprite.visible = !hidden;
    sprite.texture = tex;
    const a = tex.width / tex.height;
    const b = geomRef.current.box;
    sprite.width = a >= 1 ? b : b * a;
    sprite.height = a >= 1 ? b / a : b;
  };

  /** Number of stops on reel `c`. */
  const stripSize = (c: number) => stripsRef.current[c]?.length ?? 0;

  /** Repaint a column straight from its strip — the window is always a real strip slice. */
  const refill = (c: number) => {
    const len = stripSize(c);
    if (!len) return;
    const strip = stripsRef.current[c];
    for (let i = 0; i < stripLen; i++) {
      // Slot i shows visible row `i - BUFFER`; the buffer slot (row -1) is never hidden (it is off-grid
      // and clipped anyway). While a reel scrolls, `hiddenCells` is undefined — the caller only hides
      // during the presentation, which is after every reel has come to rest.
      fit(
        spriteRefs.current[c]?.[i],
        strip[mod(topIndex.current[c] + i, len)],
        hiddenRef.current?.[c]?.[i - BUFFER] === true,
      );
    }
  };

  /** Cursor that puts `stops[c]` in row 0 (sprite slot BUFFER) — i.e. the reel at rest. */
  const restTop = (c: number) =>
    mod((stopsRef.current[c] ?? 0) - BUFFER, stripSize(c) || 1);

  /** Scroll one cell: symbols move DOWN, so a new one enters at the top → the cursor steps back. */
  const wrapColumn = (c: number) => {
    const len = stripSize(c);
    if (!len) return;
    topIndex.current[c] = mod(topIndex.current[c] - 1, len);
    refill(c);
  };

  /** Jump the cursor LAND_LEAD cells ahead of the result so the reel scrolls INTO it in-sequence. */
  const beginLanding = (c: number) => {
    const len = stripSize(c);
    if (!len) return;
    topIndex.current[c] = mod(restTop(c) + LAND_LEAD, len);
    refill(c);
  };

  // (Re)initialise cursors, state and sprite placement. Runs on mount and on layout/shape change.
  useEffect(() => {
    if (strips.length === 0) return;
    // A resize mid-spin lands everything immediately; settle the engine so it isn't left "spinning".
    const wasSpinning = spinningActive.current;
    // Which reels were still turning: this force-land is the SECOND place a reel lands, so they have to
    // report it too or their landing feedback would be silently skipped on any mid-spin resize.
    const forceLanded = colState.current.flatMap((s, c) => (s.spinning ? [c] : []));
    topIndex.current = Array.from({ length: cols }, (_, c) => restTop(c));
    colState.current = Array.from({ length: cols }, () => ({
      offset: 0,
      spinning: false,
      elapsed: 0,
      stopDelay: 0,
      landLeft: -1,
      blur: 0,
    }));
    spinningActive.current = false;
    for (let c = 0; c < cols; c++) {
      const cont = colContainers.current[c];
      if (cont) {
        cont.y = innerRect.y;
        cont.filters = null; // nothing is moving now — drop the blur's render target
      }
      for (let i = 0; i < stripLen; i++) {
        const sp = spriteRefs.current[c]?.[i];
        if (!sp) continue;
        sp.x = 0;
        sp.y = (i - BUFFER) * cellH + cellH / 2;
      }
      refill(c);
    }
    lastSpinId.current = spinIdRef.current; // don't treat mount/resize as a spin
    if (wasSpinning) {
      for (const c of forceLanded) onReelLandedRef.current?.(c);
      onSettledRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [innerRect.x, innerRect.y, innerRect.w, innerRect.h, rows, cols, strips]);

  // Begin a spin: every reel starts scrolling, each with its own staggered stop time.
  const startSpin = () => {
    const t = TIMING[speedRef.current];
    spinningActive.current = true;
    holdMs.current = 0;
    for (let c = 0; c < cols; c++) {
      const st = colState.current[c];
      if (!st) continue;
      st.spinning = true;
      st.elapsed = 0;
      st.offset = 0;
      st.landLeft = -1;
      st.stopDelay = t.baseMs + c * t.perReelMs;
    }
  };

  useTick((ticker: Ticker) => {
    const states = colState.current;
    if (states.length === 0) return;

    // New spin requested?
    if (spinIdRef.current !== lastSpinId.current) {
      lastSpinId.current = spinIdRef.current;
      startSpin();
    }

    const { innerY, cellH } = geomRef.current;
    const t = TIMING[speedRef.current];
    const vel = (t.cellsPerSec / 1000) * cellH; // px per ms
    const dt = ticker.deltaMS;

    // COVER THE DOWNLOAD WITH THE SPIN. The winning-symbol glow is per-spin art, so it cannot be preloaded,
    // and it is needed only BOUNCE_MS after the reels land — at "extra fast" that is under a second from the
    // result arriving. Rather than let the beat arrive to nothing, keep the reels turning until the art
    // exists: the spin is a believable loading indicator, and the outcome is already decided (it came from
    // the backend before this), so nothing about the result changes.
    //
    // ONE accumulator for the whole spin, added to every reel's threshold below, so the staggered
    // left-to-right cascade is preserved exactly — just shifted. Gating each reel independently would let
    // the later reels' own thresholds elapse during the wait and land them all at once.
    //
    // Capped per speed, and the cap is the point: unbounded, a 3G connection would spin the reels for ten
    // seconds or more, which is far worse than a missing effect. Past the cap the reels land anyway and the
    // presentation degrades as designed (`PixiGameAnimation` renders nothing rather than a partial
    // sequence). The cap shrinks as speed rises because a player on "extra fast" has told us they value
    // pace over spectacle.
    // `?? true` matters: with no `artReady` wired there is nothing to wait for, so timing must be exactly
    // as it was. Optional-chaining alone would yield `undefined`, read as "not ready", and hold every spin
    // for the full cap.
    const artIsReady = artReadyRef.current?.() ?? true;
    if (spinningActive.current && holdMs.current < t.maxHoldMs && !artIsReady) {
      holdMs.current += dt;
    }

    for (let c = 0; c < cols; c++) {
      const st = states[c];
      if (!st || !st.spinning) continue;
      st.elapsed += dt;
      st.offset += vel * dt;
      while (st.offset >= cellH) {
        st.offset -= cellH;
        // Reached this reel's stop time? Seed the landing run (see LAND_LEAD).
        if (st.landLeft < 0 && st.elapsed >= st.stopDelay + holdMs.current) {
          st.landLeft = LAND_LEAD;
          beginLanding(c);
        }
        if (st.landLeft !== 0) wrapColumn(c);
        if (st.landLeft > 0) st.landLeft -= 1;
        if (st.landLeft === 0) {
          // Cursor is on the result: row 0 holds strips[c][stops[c]]. Snap to rest.
          st.offset = 0;
          st.spinning = false;
          // This reel is home while the ones to its right still turn — the caller's cue to give it
          // its own landing feedback.
          onReelLandedRef.current?.(c);
          break;
        }
      }
      const cont = colContainers.current[c];
      if (cont) cont.y = innerY + st.offset;
    }

    // Motion blur. Deliberately a second pass over the columns: a reel that has just stopped still has
    // to ease OUT, and the motion loop above skips a column the moment `spinning` goes false — reading
    // that flag directly would pop the blur off in a single frame.
    const blurMax =
      BLUR_CELL_FRAC *
      cellH *
      (TIMING[speedRef.current].cellsPerSec / BLUR_REF_CELLS_PER_SEC) *
      blurScaleRef.current;
    const ease = Math.min(1, dt / BLUR_RAMP_MS);
    for (let c = 0; c < cols; c++) {
      const st = states[c];
      const cont = colContainers.current[c];
      if (!st || !cont) continue;

      const detached = st.blur === 0; // only ever exactly 0 while the filter is off
      st.blur += ((st.spinning ? blurMax : 0) - st.blur) * ease;

      // Faded out: drop the filter so a still grid costs no render target.
      if (!st.spinning && st.blur < 0.15) {
        if (!detached) {
          st.blur = 0;
          cont.filters = null;
        }
        continue;
      }
      const f = (blurRef.current[c] ??= new BlurFilter({
        strengthX: 0, // vertical only — the axis the reels scroll on, and a single filter pass
        strengthY: 0,
        quality: 2,
      }));
      f.strengthY = st.blur;
      if (detached) cont.filters = f; // attach once, not every frame (the setter rebuilds the effect)
    }

    // All reels stopped this spin → notify once.
    if (spinningActive.current && states.every((s) => !s.spinning)) {
      spinningActive.current = false;
      onSettledRef.current?.();
    }
  });

  // The filters outlive re-renders (they live in a ref), so destroy them with the component.
  useEffect(() => {
    const filters = blurRef.current;
    return () => {
      for (const f of filters) f?.destroy();
      filters.length = 0;
    };
  }, []);

  // Apply `hiddenCells` to a reel that is already AT REST. `refill()` runs only from the tick or on a
  // layout change, so without this a hide/un-hide arriving between spins would never be painted — which
  // is exactly when the win presentation asks for it.
  //
  // Repaints via `refill()` rather than poking `.visible` directly, so `fit()` stays the single place
  // that decides whether a sprite shows: setting visibility here would also un-hide slots `fit()` hid
  // because their texture hadn't loaded.
  useEffect(() => {
    for (let c = 0; c < cols; c++) refill(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenCells, cols]);

  // Clip the reels to the opening: bind the mask graphics to the root container once mounted.
  useEffect(() => {
    const root = rootRef.current;
    const m = maskRef.current;
    if (root && m) root.mask = m;
    return () => {
      if (root) root.mask = null;
    };
  }, []);

  if (strips.length === 0) return null;
  const placeholder = strips[0]?.[0] ?? "";

  return (
    <PixiContainer ref={rootRef}>
      {/* Mask = the frame opening; anything outside it (buffer symbols) is clipped. */}
      <pixiGraphics
        ref={maskRef}
        draw={(g: Graphics) => {
          g.clear();
          g.rect(innerRect.x, innerRect.y, innerRect.w, innerRect.h);
          g.fill(0xffffff);
        }}
      />
      {Array.from({ length: cols }, (_, c) => (
        <PixiContainer
          key={c}
          ref={(el) => {
            colContainers.current[c] = el;
          }}
          x={innerRect.x + c * cellW + cellW / 2}
          y={innerRect.y}
        >
          {Array.from({ length: stripLen }, (_, i) => (
            <PixiSprite
              key={i}
              ref={(el) => {
                (spriteRefs.current[c] ??= [])[i] = el;
              }}
              texture={placeholder}
              anchor={0.5}
              x={0}
              y={(i - BUFFER) * cellH + cellH / 2}
            />
          ))}
        </PixiContainer>
      ))}
    </PixiContainer>
  );
}

export default Reels;
