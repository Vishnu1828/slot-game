import type { LayoutMode } from "@/hooks/useScreen";

/**
 * DESIGN CANVAS — the fixed coordinate space the UI is laid out in, per orientation. The whole scene
 * is authored once at these sizes (matching the Figma / iPhone 12 Pro reference) and then uniformly
 * SCALED to fit any real screen (see useStage + DesignStage). Because every device renders a
 * proportionally-identical copy of this canvas, elements can never collide regardless of screen size.
 *
 * Only the ASPECT RATIO matters — the absolute px just define the coordinate space UI components use.
 * Set `desktop` to the designer's actual desktop frame size if it isn't 16:9.
 */
export const DESIGN: Record<LayoutMode, { w: number; h: number }> = {
  portrait: { w: 390, h: 844 }, // iPhone 12 Pro portrait (designer's reference)
  "mobile-landscape": { w: 844, h: 390 }, // iPhone 12 Pro landscape
  desktop: { w: 1280, h: 720 }, // fixed 16:9 desktop frame
};
