import { useEffect, useMemo, useRef, useState } from "react";
import { extend, useTick } from "@pixi/react";
import "@pixi/layout"; // enables the optional `layout` prop even if PixiLayout isn't imported
import {
  AnimatedSprite,
  Rectangle,
  Spritesheet,
  Texture,
  type ColorSource,
  type PointData,
} from "pixi.js";
import { getAsset, hasAsset } from "@/utils/assets";
import type { LayoutStyle } from "./PixiLayout";

// Register <pixiAnimatedSprite> as a JSX element (idempotent).
extend({ AnimatedSprite });

/** One frame in a custom (non-Pixi) sprite-sheet JSON: a rect into the shared PNG. */
interface CustomFrame {
  fileName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Custom sprite-sheet JSON shape (a plain PNG atlas + frame rects; not a Pixi spritesheet). */
interface CustomSheet {
  sprites: CustomFrame[];
  spriteSheetWidth: number;
  spriteSheetHeight: number;
  /**
   * TRIM metadata, written by `scripts/crop-animation-sheets.mjs` when transparent padding was stripped:
   * the cell size before cropping, and where the kept box sat inside it. Both optional — a sheet without
   * them behaves exactly as it always has.
   *
   * These exist so a crop cannot move the art on screen. A cropped frame is smaller than the cell the
   * caller sized against, so without them `width`/`height` would be applied to the trimmed box and the
   * subject would grow and shift. Pixi already does this for TexturePacker sheets via
   * `spriteSourceSize`/`sourceSize`; this is the same idea for the dialect that has no such fields.
   */
  sourceSize?: { w: number; h: number };
  offset?: { x: number; y: number };
}

/** How a cropped sheet maps the caller's requested box onto the trimmed frame actually stored. */
interface Trim {
  /** Untrimmed cell size, in the sheet's own pixel space. */
  source: { w: number; h: number };
  /** Where the kept box sits inside that cell. */
  offset: { x: number; y: number };
  /** The kept box's size. */
  kept: { w: number; h: number };
}

export interface PixiGameAnimationProps {
  /**
   * Base alias(es) of the animation. Two sources are supported:
   *  - a custom sheet: `<sheet>.json` (frame rects) + `<sheet>.png` (the atlas image), or
   *  - a standard Pixi `Spritesheet` registered under this alias.
   *
   * An ARRAY is treated as ONE sequence split across several sheets: the frames of every sheet are
   * pooled and ordered by the number at the end of each frame name, so the sheets themselves may be
   * listed in any order and a frame may live in any of them (see `orderFrames`).
   *
   * Renders nothing until the assets are loaded.
   */
  sheet: string | string[];
  /** For a standard Pixi Spritesheet only: play this named animation (else all frames in order). */
  animation?: string;

  x?: number;
  y?: number;
  /** 0..1 — a single number for both axes, or `{ x, y }`. Default 0.5 (center). */
  anchor?: number | PointData;
  /** Explicit display size in px (overrides the frame's natural size). */
  width?: number;
  height?: number;
  scale?: number | PointData;
  alpha?: number;
  tint?: ColorSource;
  visible?: boolean;

  /** Loop the animation. Default true. */
  loop?: boolean;
  /** Playback speed (frames advanced per tick). Default 0.4. Ignored when `durationMs` is given. */
  animationSpeed?: number;
  /**
   * Play the whole sequence in this many ms, whatever its frame count — the speed is derived once the
   * textures resolve. Use this when a caller owns the timing (e.g. a presentation beat of fixed length):
   * the duration stays authoritative, so re-exporting the sheet with more or fewer frames needs no code
   * change. Takes precedence over `animationSpeed`.
   */
  durationMs?: number;
  /** Auto-start on mount / when frames change. Default true. */
  autoPlay?: boolean;
  /** Change this value to restart the animation from frame 0. */
  restartKey?: string | number;

  /** Fired when a non-looping animation finishes. */
  onComplete?: () => void;
  /** Fired on each frame change: (currentFrame, totalFrames). */
  onFrameChange?: (frame: number, total: number) => void;

  layout?: LayoutStyle;
  label?: string;
}

interface FrameSet {
  textures: Texture[];
  /** The Texture objects WE created (custom sheets) and must destroy on cleanup. */
  owned: Texture[];
  /** Set only for a cropped custom sheet; see `applyTrim`. */
  trim?: Trim;
}

/** A frame plus the name it was exported under — the name is what the ordering below sorts on. */
interface NamedFrame {
  name: string;
  texture: Texture;
}

interface SheetFrames {
  frames: NamedFrame[];
  /** True when this source's frames already came out in playback order (named animation / custom sheet). */
  ordered: boolean;
  owned: Texture[];
  trim?: Trim;
}

/**
 * Re-place a cropped frame so it lands exactly where the untrimmed art would have.
 *
 * The caller sized and positioned against the FULL cell, so `width`/`height` describe the `sourceSize`
 * box. The stored frame is the kept sub-box, so it has to be drawn proportionally smaller and shifted by
 * where that box sat — with the caller's own anchor still applied to the smaller size.
 *
 * Returns nothing when there is no trim, or when the caller left the size implicit: with no requested box
 * there is nothing to map onto, and the natural-size behaviour is already what such a caller expects.
 */
function applyTrim(
  trim: Trim | undefined,
  x: number | undefined,
  y: number | undefined,
  width: number | undefined,
  height: number | undefined,
  anchor: number | PointData,
): { x?: number; y?: number; width: number; height: number } | undefined {
  if (!trim || width == null || height == null) return undefined;

  const ax = typeof anchor === "number" ? anchor : anchor.x;
  const ay = typeof anchor === "number" ? anchor : anchor.y;

  const sx = width / trim.source.w;
  const sy = height / trim.source.h;
  const w = trim.kept.w * sx;
  const h = trim.kept.h * sy;

  // Full box's top-left, then into it by the crop offset, then back out by the anchor on the NEW size.
  return {
    x: x == null ? undefined : x - ax * width + trim.offset.x * sx + ax * w,
    y: y == null ? undefined : y - ay * height + trim.offset.y * sy + ay * h,
    width: w,
    height: h,
  };
}

/** Trailing frame number, ignoring an optional file extension: `walk_07.png` → 7, `anim13` → 13. */
const FRAME_NO = /(\d+)(?:\.\w+)?$/;
const frameNo = (name: string): number | undefined => {
  const m = FRAME_NO.exec(name);
  return m ? Number(m[1]) : undefined;
};

/**
 * Put the pooled frames into playback order.
 *
 * Sheets that already yield ordered frames (a named `animations` entry, or the custom dialect's
 * `sprites` array) are concatenated as-is. Otherwise the only reliable ordering is the number at the
 * end of each frame name: a standard Pixi Spritesheet exposes `textures` in JSON key order, which some
 * exporters scramble, and across several sheets that order is meaningless anyway — the win-screen art,
 * for one, spreads frames 0-79 over ten sheets with each sheet's own keys out of sequence.
 */
function orderFrames(sources: SheetFrames[]): Texture[] {
  const pooled = sources.flatMap((s) => s.frames);
  if (sources.every((s) => s.ordered)) return pooled.map((f) => f.texture);

  const numbered = pooled.map((f) => ({ f, n: frameNo(f.name) }));
  if (numbered.some((e) => e.n === undefined))
    return pooled.map((f) => f.texture);
  return numbered.sort((a, b) => a.n! - b.n!).map((e) => e.f.texture);
}

/** Frames of a standard Pixi Spritesheet — the named animation if asked for, else every frame. */
function sheetFrames(s: Spritesheet, animation?: string): SheetFrames {
  const named = animation ? s.animations?.[animation] : undefined;
  if (named)
    return {
      frames: named.map((texture, i) => ({ name: String(i), texture })),
      ordered: true,
      owned: [],
    };
  return {
    frames: Object.entries(s.textures).map(([name, texture]) => ({
      name,
      texture,
    })),
    ordered: false,
    owned: [],
  };
}

/** Resolve one sheet — either a standard Pixi Spritesheet or a custom `<sheet>` pair. */
function resolveSheet(
  sheet: string,
  animation?: string,
): SheetFrames | undefined {
  // Standard Pixi Spritesheet registered under the alias?
  const direct = getAsset(sheet);
  if (direct instanceof Spritesheet) {
    const s = sheetFrames(direct, animation);
    return s.frames.length ? s : undefined;
  }

  // ...or under `<sheet>.json`. Animation sheets get EXTENSION-QUALIFIED aliases only (there is no
  // extension-trimmed shortcut, because the .json and .png would both claim it), so a caller passing a
  // bare base name lands here. Checking both means the caller never has to know which exporter produced
  // a sheet — this repo ships both TexturePacker sheets and the custom dialect below.
  const asSheet = getAsset(`${sheet}.json`);
  if (asSheet instanceof Spritesheet) {
    const s = sheetFrames(asSheet, animation);
    return s.frames.length ? s : undefined;
  }

  // Custom sheet: <sheet>.json (frame rects) + <sheet>.png (atlas image). Use extension-qualified
  // aliases — the bare `<sheet>` shortcut may resolve to either the png or json (name collision).
  const json = getAsset(`${sheet}.json`) as CustomSheet | undefined;
  const atlas = getAsset<Texture>(`${sheet}.png`);
  if (!json?.sprites?.length || !atlas) return undefined;

  // Map the JSON's coordinates into the space `Texture.frame` is measured in.
  //
  // Use the source's LOGICAL width (`width`), never `pixelWidth`. A tier is served as `<sheet>@0.5x.png`,
  // and Pixi stamps `resolution: 0.5` on it from that filename (`loadTextures` -> `getResolutionOfUrl`).
  // `TextureSource.width` is `pixelWidth / resolution`, so a 1000px tier still measures 2000 logically —
  // and a `Texture` frame is in those logical units (Pixi's own Spritesheet divides raw sheet rects by the
  // resolution for exactly this reason). Using `pixelWidth` made `k` come out at 1 for a tiered sheet, so
  // every frame was cut from the top-left QUARTER of the atlas at four times its intended area: the
  // animation played visibly wrong. It looked correct only because untiered sheets have resolution 1,
  // where the two are identical.
  //
  // This also covers a tier PNG paired with a full-resolution JSON: logical width equals the original
  // width, so `k` is 1 and the untouched coordinates are already right.
  const k = atlas.source.width / json.spriteSheetWidth;
  const frames = json.sprites.map((f) => ({
    name: f.fileName,
    texture: new Texture({
      source: atlas.source,
      frame: new Rectangle(f.x * k, f.y * k, f.width * k, f.height * k),
    }),
  }));

  // Ratios, not pixels: `k` above already absorbs the tier, so a cropped sheet stays correctly placed at
  // any resolution without the trim values needing to know which tier was served.
  const first = json.sprites[0];
  const trim =
    json.sourceSize && json.offset
      ? {
          source: json.sourceSize,
          offset: json.offset,
          kept: { w: first.width, h: first.height },
        }
      : undefined;

  return { frames, ordered: true, owned: frames.map((f) => f.texture), trim };
}

/** Resolve one or more sheets into a single ordered frame sequence. */
/**
 * Is this sheet loaded enough to slice? Lookup only — allocates nothing, so it is safe to call on every
 * tick while waiting for demand-loaded art (see the poll in the component).
 *
 * Mirrors `resolveSheet`'s requirements EXACTLY, per dialect. It must not be optimistic: the poll below
 * treats a `true` here as "resolution will now succeed", so a false positive would leave `frames`
 * undefined while the readiness check kept saying yes — a re-render every frame. A TexturePacker sheet
 * carries its atlas internally, but the custom dialect needs BOTH halves and its frame rects.
 */
function sheetReady(s: string): boolean {
  if (getAsset(s) instanceof Spritesheet) return true;

  const json = getAsset(`${s}.json`);
  if (json instanceof Spritesheet) return true;

  const custom = json as CustomSheet | undefined;
  return !!custom?.sprites?.length && hasAsset(`${s}.png`);
}

const sheetsReady = (sheets: string[]): boolean => sheets.every(sheetReady);

function resolveFrames(
  sheets: string[],
  animation?: string,
): FrameSet | undefined {
  // ALL OR NOTHING. An array of sheets is ONE sequence split across files, so a subset is not a shorter
  // animation — it is a broken one. `durationMs` divides the beat by however many frames were found, so
  // 3 of the 10 win-popup sheets play 24 scattered poses stretched over the full 3s at ~8fps: it reads as
  // a hang, at a perfectly healthy 60 FPS, and used to be what a first win looked like on a slow
  // connection. Rendering nothing is the documented degradation; rendering this is not.
  if (!sheets.length || !sheetsReady(sheets)) return undefined;

  const sources = sheets
    .map((s) => resolveSheet(s, animation))
    .filter((s): s is SheetFrames => s !== undefined);
  if (sources.length !== sheets.length) return undefined;
  return {
    textures: orderFrames(sources),
    owned: sources.flatMap((s) => s.owned),
    // Trim belongs to a sheet, and the multi-sheet form is one sequence split across sheets cropped
    // together, so they share it.
    trim: sources.find((s) => s.trim)?.trim,
  };
}

/**
 * Reusable AnimatedSprite for @pixi/react. Plays either a custom PNG+JSON sprite sheet (this game's
 * animation pipeline) or a standard Pixi Spritesheet. Renders nothing until the assets are loaded.
 *
 * Speed/loop update in place; only `restartKey` (or a new frame-set) restarts playback. Callbacks
 * live in refs so changing them never restarts the animation. For custom sheets, the per-frame
 * Texture wrappers we create are destroyed on change/unmount (the shared GPU source is preserved).
 *
 * @example
 * <PixiGameAnimation sheet="candle_light" x={cx} y={cy} loop animationSpeed={0.4} />
 * // one sequence split across ten sheets, played once over 2s whatever its frame count:
 * <PixiGameAnimation sheet={["win-0", …, "win-9"]} loop={false} durationMs={2000} />
 */
export function PixiGameAnimation({
  sheet,
  animation,
  x,
  y,
  anchor = 0.5,
  width,
  height,
  scale,
  alpha,
  tint,
  visible,
  loop = true,
  animationSpeed = 0.4,
  durationMs,
  autoPlay = true,
  restartKey,
  onComplete,
  onFrameChange,
  layout,
  label,
}: PixiGameAnimationProps) {
  const spriteRef = useRef<AnimatedSprite | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onFrameChangeRef = useRef(onFrameChange);

  // Keep callback refs current without re-binding / restarting the sprite.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    onFrameChangeRef.current = onFrameChange;
  }, [onFrameChange]);

  // Key on the joined names, not the array itself: a caller passing an inline `[...]` would otherwise
  // hand us a new identity every render and restart the animation on each one.
  const sheetKey = Array.isArray(sheet) ? sheet.join("\n") : sheet;
  // Bumped once when demand-loaded art finishes arriving, to re-run the resolve below.
  const [arrived, setArrived] = useState(0);
  const frames = useMemo(
    () => resolveFrames(sheetKey.split("\n"), animation),
    // `arrived` looks unused to the linter because `resolveFrames` reads Pixi's asset cache — state this
    // hook cannot see. It is load-bearing: bumping it is the ONLY thing that re-resolves a sheet that
    // finished downloading after mount. Removing it silently reinstates "a late sheet never plays".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheetKey, animation, arrived],
  );

  // Win-presentation art is fetched per spin and can land AFTER this mounts. Without this the sheet is
  // resolved once at mount and a late arrival is ignored for the whole presentation, so the effect never
  // plays — and the reel-stop hold that covers the download is CAPPED, so late arrivals are expected by
  // design rather than exceptional.
  //
  // EDGE-TRIGGERED on purpose. `setArrived` must fire only on the false->true transition, never on every
  // frame that readiness happens to be true: if `sheetsReady` ever disagreed with what `resolveFrames`
  // needs, a level-triggered version would re-render on every tick forever. Belt and braces with
  // `sheetReady` mirroring the resolver — cheap, and this component renders on every win.
  const wasReady = useRef(false);
  useEffect(() => {
    wasReady.current = false; // a new sheet has to be re-observed from scratch
  }, [sheetKey, animation]);

  useTick(() => {
    if (frames) return; // already resolved — nothing to watch
    const ready = sheetsReady(sheetKey.split("\n"));
    if (ready && !wasReady.current) setArrived((n) => n + 1);
    wasReady.current = ready;
  });
  const textures = frames?.textures;
  // Destroy only the Textures WE created (custom sheets); keep the shared GPU source (`false`).
  useEffect(() => {
    const created = frames?.owned;
    if (!created?.length) return;
    return () => {
      for (const t of created) t.destroy(false);
    };
  }, [frames]);

  // Bind the sprite's native callbacks once per frame-set (they read the live refs).
  useEffect(() => {
    const sprite = spriteRef.current;
    if (!sprite) return;
    sprite.onComplete = () => onCompleteRef.current?.();
    sprite.onFrameChange = (frame) =>
      onFrameChangeRef.current?.(frame, sprite.totalFrames);
  }, [textures]);

  // Start / restart. Speed & loop are applied as props, so changing them does NOT restart; only a
  // new frame-set, autoPlay, or restartKey does.
  useEffect(() => {
    const sprite = spriteRef.current;
    if (!sprite || !textures?.length) return;
    if (autoPlay) sprite.gotoAndPlay(0);
    else sprite.gotoAndStop(0);
  }, [textures, autoPlay, restartKey]);

  if (!textures?.length) return null;

  // Pixi advances `animationSpeed * deltaTime` per tick, and `deltaTime` is normalised against a fixed
  // 60fps reference (Ticker.targetFPMS) — so frames-per-second is `60 * animationSpeed` on any display,
  // and this makes the sequence take `durationMs` regardless of frame count or refresh rate.
  const speed =
    durationMs != null && durationMs > 0
      ? textures.length / ((durationMs / 1000) * 60)
      : animationSpeed;

  // A cropped sheet stores less than the caller sized against, so its position and size are remapped to
  // keep the art exactly where it was. Untouched sheets fall straight through.
  const placed = applyTrim(frames?.trim, x, y, width, height, anchor);

  return (
    <pixiAnimatedSprite
      ref={spriteRef}
      textures={textures}
      x={placed?.x ?? x}
      y={placed?.y ?? y}
      anchor={anchor}
      width={placed?.width ?? width}
      height={placed?.height ?? height}
      scale={scale}
      alpha={alpha}
      tint={tint}
      visible={visible}
      loop={loop}
      animationSpeed={speed}
      layout={layout}
      label={label}
    />
  );
}

export default PixiGameAnimation;
