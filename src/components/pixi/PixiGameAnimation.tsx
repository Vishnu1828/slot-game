import { useEffect, useMemo, useRef } from "react";
import { extend } from "@pixi/react";
import "@pixi/layout"; // enables the optional `layout` prop even if PixiLayout isn't imported
import {
  AnimatedSprite,
  Rectangle,
  Spritesheet,
  Texture,
  type ColorSource,
  type PointData,
} from "pixi.js";
import { getAsset } from "@/utils/assets";
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

  // The JSON coords are in the ORIGINAL sheet's pixel space, but AssetPack may have served a
  // downscaled tier (@0.5x/@0.25x). Scale every rect by the loaded texture's real pixel size so
  // the frames line up on any resolution.
  const k = atlas.source.pixelWidth / json.spriteSheetWidth;
  const frames = json.sprites.map((f) => ({
    name: f.fileName,
    texture: new Texture({
      source: atlas.source,
      frame: new Rectangle(f.x * k, f.y * k, f.width * k, f.height * k),
    }),
  }));
  return { frames, ordered: true, owned: frames.map((f) => f.texture) };
}

/** Resolve one or more sheets into a single ordered frame sequence. */
function resolveFrames(
  sheets: string[],
  animation?: string,
): FrameSet | undefined {
  const sources = sheets
    .map((s) => resolveSheet(s, animation))
    .filter((s): s is SheetFrames => s !== undefined);
  if (!sources.length) return undefined;
  return {
    textures: orderFrames(sources),
    owned: sources.flatMap((s) => s.owned),
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
  const frames = useMemo(
    () => resolveFrames(sheetKey.split("\n"), animation),
    [sheetKey, animation],
  );
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

  return (
    <pixiAnimatedSprite
      ref={spriteRef}
      textures={textures}
      x={x}
      y={y}
      anchor={anchor}
      width={width}
      height={height}
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
