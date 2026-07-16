/**
 * Cover-fit helpers — the transform the game Background uses to fill the screen with its art.
 *
 * "Cover" means: scale the art uniformly so it fills the viewport (cropping the overflowing axis),
 * with the art's CENTER pinned to the screen center. `Background.tsx` renders the bg sprite exactly
 * this way, so to pin an overlay (a flame, a table prop, a win effect) onto a fixed spot in the art,
 * map that spot through the SAME transform with `anchorToScreen`.
 */

/** Uniform cover scale: the larger of the two axis ratios (fills + crops the other axis). */
export const coverScale = (
  w: number,
  h: number,
  texW: number,
  texH: number,
): number => Math.max(w / texW, h / texH);

/**
 * Map a point given as a FRACTION of the art (0..1, top-left origin) to on-screen pixels under the
 * cover transform, and return the `scale` too (handy for sizing the overlay proportionally to the
 * art, e.g. `overlayWidth = artWidth * scale`).
 */
export function anchorToScreen(
  fx: number,
  fy: number,
  w: number,
  h: number,
  texW: number,
  texH: number,
): { x: number; y: number; scale: number } {
  const scale = coverScale(w, h, texW, texH);
  return {
    scale,
    x: w / 2 + (fx - 0.5) * texW * scale,
    y: h / 2 + (fy - 0.5) * texH * scale,
  };
}
