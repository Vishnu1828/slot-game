import { useEffect, useMemo, useRef } from "react";
import { extend } from "@pixi/react";
import "@pixi/layout"; // enables the optional `layout` prop even if PixiLayout isn't imported
import {
  AnimatedSprite,
  Assets,
  Rectangle,
  Spritesheet,
  Texture,
  type ColorSource,
  type PointData,
} from "pixi.js";
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
   * Base alias of the animation. Two sources are supported:
   *  - a custom sheet: `<sheet>.json` (frame rects) + `<sheet>.png` (the atlas image), or
   *  - a standard Pixi `Spritesheet` registered under this alias.
   * Renders nothing until the assets are loaded.
   */
  sheet: string;
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
  /** Playback speed (frames advanced per tick). Default 0.4. */
  animationSpeed?: number;
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
  /** True when WE created the Texture objects (custom sheet) and must destroy them on cleanup. */
  owned: boolean;
}

/** Resolve the frame textures for either a standard Pixi Spritesheet or a custom `<sheet>` pair. */
function resolveFrames(sheet: string, animation?: string): FrameSet | undefined {
  // Standard Pixi Spritesheet registered under the alias?
  const direct = Assets.get(sheet);
  if (direct instanceof Spritesheet) {
    const frames =
      animation && direct.animations?.[animation]
        ? direct.animations[animation]
        : Object.values(direct.textures);
    return frames.length ? { textures: frames, owned: false } : undefined;
  }

  // Custom sheet: <sheet>.json (frame rects) + <sheet>.png (atlas image). Use extension-qualified
  // aliases — the bare `<sheet>` shortcut may resolve to either the png or json (name collision).
  const json = Assets.get(`${sheet}.json`) as CustomSheet | undefined;
  const atlas = Assets.get<Texture>(`${sheet}.png`);
  if (!json?.sprites?.length || !atlas) return undefined;

  // The JSON coords are in the ORIGINAL sheet's pixel space, but AssetPack may have served a
  // downscaled tier (@0.5x/@0.25x). Scale every rect by the loaded texture's real pixel size so
  // the frames line up on any resolution.
  const k = atlas.source.pixelWidth / json.spriteSheetWidth;
  const textures = json.sprites.map(
    (f) =>
      new Texture({
        source: atlas.source,
        frame: new Rectangle(f.x * k, f.y * k, f.width * k, f.height * k),
      }),
  );
  return { textures, owned: true };
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

  const frames = useMemo(
    () => resolveFrames(sheet, animation),
    [sheet, animation],
  );
  const textures = frames?.textures;

  // Destroy only the Textures WE created (custom sheets); keep the shared GPU source (`false`).
  useEffect(() => {
    if (!frames?.owned) return;
    const created = frames.textures;
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
      animationSpeed={animationSpeed}
      layout={layout}
      label={label}
    />
  );
}

export default PixiGameAnimation;
