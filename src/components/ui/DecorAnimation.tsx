import type { PointData } from "pixi.js";
import { PixiGameAnimation } from "../pixi/PixiGameAnimation";
import { useScreen } from "@/hooks/useScreen";

export interface DecorAnimationProps {
  /** Animation sheet alias (see PixiGameAnimation). */
  sheet: string;
  /** Center x as a fraction of screen width (0..1). */
  xFrac: number;
  /** Top-reference y as a fraction of screen height. Default 0; negative = above the top edge. */
  yFrac?: number;
  /** Frame aspect ratio = width / height (keeps the art undistorted). */
  aspect: number;
  /** Size by width (fraction of screen width). Takes precedence over `heightFrac`. */
  widthFrac?: number;
  /** Size by height (fraction of screen height). */
  heightFrac?: number;
  /** Default `{ x: 0.5, y: 0 }` (top-center — hangs from the top). */
  anchor?: number | PointData;
  loop?: boolean;
  animationSpeed?: number;
}

/**
 * Places a decorative sprite-sheet animation by SCREEN fractions (not background-art coordinates) —
 * for overlays that hang from the viewport itself (chandelier, lanterns) and should stay put and
 * proportional at any size. Size it by `widthFrac` OR `heightFrac`; `aspect` derives the other axis
 * so it never distorts. Gate the layout mode at the call site, e.g. `{portrait && <DecorAnimation …/>}`.
 *
 * @example
 * <DecorAnimation sheet="chandelier" xFrac={0.5} yFrac={0.05} widthFrac={0.6} aspect={674/620} />
 * <DecorAnimation sheet="hanging_lamps" xFrac={0.85} yFrac={-0.08} heightFrac={0.65} aspect={600/1167} />
 */
export function DecorAnimation({
  sheet,
  xFrac,
  yFrac = 0,
  aspect,
  widthFrac,
  heightFrac,
  anchor = { x: 0.5, y: 0 },
  loop = true,
  animationSpeed = 0.4,
}: DecorAnimationProps) {
  const { w, h } = useScreen();

  // Size by width if given, else by height; the other axis comes from `aspect` (= width/height).
  const width = widthFrac != null ? widthFrac * w : (heightFrac ?? 0) * h * aspect;
  const height = width / aspect;

  return (
    <PixiGameAnimation
      sheet={sheet}
      x={xFrac * w}
      y={yFrac * h}
      width={width}
      height={height}
      anchor={anchor}
      loop={loop}
      animationSpeed={animationSpeed}
    />
  );
}

export default DecorAnimation;
