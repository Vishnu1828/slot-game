import { DESIGN } from "@/constants/design";
import { useScreen, type LayoutMode } from "./useScreen";

export interface Stage {
  /** DESIGN-space width (the fixed canvas), NOT the real screen width. */
  w: number;
  /** DESIGN-space height (the fixed canvas). */
  h: number;
  portrait: boolean;
  landscape: boolean;
  mode: LayoutMode;
  /** Uniform scale applied to the design canvas so it fits the real screen (letterboxed). */
  scale: number;
  /** Centering offset (real px) — the top-left of the scaled canvas on the real screen. */
  offsetX: number;
  offsetY: number;
}

/**
 * Design-canvas layout hook. Everything inside a <DesignStage> should size/position itself in the
 * FIXED design space (DESIGN[mode]) via the `w`/`h` returned here — NOT the live window size. The
 * stage container applies `scale` + `offsetX/Y` so the whole canvas fits the real screen uniformly,
 * which means every device shows a proportionally-identical copy of the design and elements can never
 * collide. `mode`/`portrait`/`landscape` still reflect the real screen (which orientation to show).
 *
 * Use useScreen() directly (not this) for things pinned to the REAL screen — the cover-fit background,
 * background decor, and overlay scrims.
 */
export function useStage(): Stage {
  const { w, h, mode, portrait, landscape } = useScreen();
  const d = DESIGN[mode];
  const scale = Math.min(w / d.w, h / d.h);
  return {
    w: d.w,
    h: d.h,
    mode,
    portrait,
    landscape,
    scale,
    offsetX: (w - d.w * scale) / 2,
    offsetY: (h - d.h * scale) / 2,
  };
}
