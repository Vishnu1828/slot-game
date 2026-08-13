import { useEffect, useRef, type ReactNode } from "react";
import { useTick } from "@pixi/react";
import { BlurFilter, type Container, type Ticker } from "pixi.js";
import PixiContainer from "./PixiContainer";

/**
 * THE PERFORMANCE DIAL. The scene is drawn into an off-screen texture this many pixels per screen pixel
 * before being blurred, so cost scales with its SQUARE: 0.25 is a sixteenth of the pixels of 1.
 *
 * KEEP IT AT 1. Both other values are tempting and both are wrong:
 *
 * BELOW 1 is cheaper, but the scene is rendered small and then bilinearly UPSCALED, and that upscale
 * softness appears the instant the filter attaches — independent of strength. The transition then reads as
 * sharp -> sudden soft pop -> gradual blur, and the reverse on the way out. At 0.25 the pop is a 4x
 * magnification and is very obvious.
 *
 * ABOVE 1 supersamples, which looks fine but is the expensive direction, and it is where this started: it
 * was set to 5 as a way to WEAKEN the blur (a given strength covers proportionally less screen at a larger
 * target). At 5 the target also blew past the 4096px texture limit at every screen size
 * (1512x982 -> 7560x4910), so it was silently clamped and the arithmetic stopped describing what was drawn.
 * Measured render-target load at 60fps:
 *
 *                            resolution 5      resolution 1, quality 4
 *     phone 390x844           1.0 Gpx/s          0.16 Gpx/s
 *     retina laptop           4.5 Gpx/s          0.71 Gpx/s
 *     1080p desktop           6.2 Gpx/s          1.00 Gpx/s
 *     4K desktop             24.9 Gpx/s          3.98 Gpx/s
 *
 * A laptop integrated GPU has maybe 5-15 Gpx/s in total, so at 5 this filter alone consumed most of the
 * budget for as long as the win popup was open — which is why desktop stuttered while phones, at a
 * twentieth of the load, stayed smooth. To weaken the blur lower `BLUR_STRENGTH`; to make it cheaper lower
 * `BLUR_QUALITY`. Never move this.
 */
const BLUR_RESOLUTION = 1;
/**
 * HOW MUCH BLUR — the look dial. On-screen radius is roughly `BLUR_STRENGTH / BLUR_RESOLUTION`, so at
 * resolution 1 this is the radius in screen pixels. Turn THIS to make the blur weaker or stronger.
 */
const BLUR_STRENGTH = 2;
/**
 * Passes. A wide blur needs several, or the samples spread far enough apart to read as ghosting/banding
 * rather than a smooth blur. This is the second cost multiplier after resolution, so keep it as low as
 * still looks smooth.
 */
const BLUR_QUALITY = 1;
/** Fade in/out time (ms). Switching a filter on hard reads as a flash. */
const BLUR_RAMP_MS = 220;

export interface SceneBlurProps {
  /** Blur the children. Eases in and out; the filter is detached entirely once it reaches 0. */
  active: boolean;
  children?: ReactNode;
}

/**
 * Blurs everything inside it while `active` — the backdrop for a modal overlay, in place of a flat scrim.
 *
 * Pixi has no backdrop filter, so "blur what's behind the popup" has to be "blur the thing behind the
 * popup": wrap the scene in this and keep the overlay as a SIBLING, or the overlay blurs with it.
 *
 * The filter is attached only while it's actually visible. That is the whole reason for the ramp and the
 * `filters = null`: an attached filter forces a full-screen render target every frame, so an idle game
 * must not be paying for one. Same conventions as the reel blur in `Reels.tsx` — which wraps each column
 * rather than the screen, and so costs two orders of magnitude less than this one.
 */
export function SceneBlur({ active, children }: SceneBlurProps) {
  const ref = useRef<Container>(null);
  const filterRef = useRef<BlurFilter | null>(null);
  /** Fade position, 0..1. Exactly 0 means "detached" — that's how the attach edge is detected. */
  const progress = useRef(0);

  useTick((ticker: Ticker) => {
    const cont = ref.current;
    if (!cont) return;

    const detached = progress.current === 0;

    // LINEAR, not exponential. An exponential ease never actually arrives, so it needs a "close enough"
    // threshold to snap and detach on — and the time to reach that threshold scales with BLUR_STRENGTH,
    // which made raising the strength silently stretch the fade-out into a slow crawl. A linear ramp takes
    // exactly BLUR_RAMP_MS in both directions whatever the strength, so the transition is predictable and
    // symmetric.
    const step = ticker.deltaMS / BLUR_RAMP_MS;
    progress.current = Math.max(
      0,
      Math.min(1, progress.current + (active ? step : -step)),
    );

    if (progress.current === 0) {
      // Fully faded out — drop the render target so an idle game pays nothing for this.
      if (!detached) cont.filters = null;
      return;
    }

    const f = (filterRef.current ??= new BlurFilter({
      strength: 0,
      quality: BLUR_QUALITY,
      resolution: BLUR_RESOLUTION,
    }));
    f.strength = progress.current * BLUR_STRENGTH;
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
