import { useEffect, useRef, type ReactNode } from "react";
import { useTick } from "@pixi/react";
import { BlurFilter, type Container, type Ticker } from "pixi.js";
import PixiContainer from "./PixiContainer";

/**
 * HOW MUCH BLUR. This is the dial to turn — with the scrim fully transparent, the blur is the only
 * thing separating an overlay from the game behind it.
 *
 * Units: FILTER-TARGET pixels (the shader steps its samples this many texels apart). The target is
 * scaled by `BLUR_RESOLUTION`, so the on-screen radius is roughly `BLUR_STRENGTH / BLUR_RESOLUTION`.
 * Raising the resolution therefore makes the blur look WEAKER — turn this number, not that one.
 */
const BLUR_STRENGTH = 0.8;
/** Fade in/out time (ms). Switching a filter on hard reads as a flash. */
const BLUR_RAMP_MS = 220;
/**
 * PERFORMANCE dial, not a look dial. The size of the off-screen texture the scene is drawn into before
 * blurring, so cost scales with its SQUARE: 0.5 is a quarter of the pixels of 1, and 4 is sixty-four
 * times 0.5. This filter covers the whole screen and runs every frame, so it is the expensive setting.
 *
 * Pixi's own `FilterOptions` doc says "consider lowering this for things like blurs filters" — on
 * something being blurred anyway the downsample costs nothing you can see, and `App.tsx` already runs
 * the renderer at `min(devicePixelRatio, 2)`, so the target is 2x on retina before this is applied.
 *
 * Values below 1 make the blur look STRONGER for the same `BLUR_STRENGTH`; values above 1 weaken it.
 */
const BLUR_RESOLUTION = 5;
/**
 * One pass. The default is 4; a full-screen filter runs every frame, so the passes are the expensive
 * part. At this strength, plus the half-res downsample, extra passes buy nothing you can see.
 */
const BLUR_QUALITY = 1;
/** Below this the blur reads as nothing — snap to 0 and detach. */
const BLUR_MIN = 0.05;

export interface SceneBlurProps {
  /** Blur the children. Eases in and out; the filter is detached entirely once it reaches 0. */
  active: boolean;
  children?: ReactNode;
}

/**
 * Blurs everything inside it while `active` — the backdrop for a modal overlay, in place of a flat grey
 * scrim.
 *
 * Pixi has no backdrop filter, so "blur what's behind the popup" has to be "blur the thing behind the
 * popup": wrap the scene in this and keep the overlay as a SIBLING, or the overlay blurs with it.
 *
 * The filter is attached only while it's actually visible. That is the whole reason for the ramp and the
 * `filters = null`: an attached filter forces a full-screen render target every frame, so an idle game
 * must not be paying for one. Same conventions as the reel blur in `Reels.tsx`.
 */
export function SceneBlur({ active, children }: SceneBlurProps) {
  const ref = useRef<Container>(null);
  const filterRef = useRef<BlurFilter | null>(null);
  /** Current eased strength. Exactly 0 means "detached" — that's how the attach edge is detected. */
  const strength = useRef(0);

  useTick((ticker: Ticker) => {
    const cont = ref.current;
    if (!cont) return;

    const detached = strength.current === 0;
    const ease = Math.min(1, ticker.deltaMS / BLUR_RAMP_MS);
    strength.current +=
      ((active ? BLUR_STRENGTH : 0) - strength.current) * ease;

    if (!active && strength.current < BLUR_MIN) {
      if (!detached) {
        strength.current = 0;
        cont.filters = null; // nothing to blur — drop the render target
      }
      return;
    }

    const f = (filterRef.current ??= new BlurFilter({
      strength: 0,
      quality: BLUR_QUALITY,
      resolution: BLUR_RESOLUTION,
    }));
    f.strength = strength.current;
    // Attach on the edge only: the `filters` setter rebuilds the FilterEffect on every assignment.
    if (detached) cont.filters = f;
  });

  // The filter lives in a ref, so it outlives re-renders and has to be destroyed with the component.
  useEffect(
    () => () => {
      filterRef.current?.destroy();
      filterRef.current = null;
    },
    [],
  );

  return <PixiContainer ref={ref}>{children}</PixiContainer>;
}

export default SceneBlur;
