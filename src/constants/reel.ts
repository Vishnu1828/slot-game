import type { LayoutMode } from "@/hooks/useScreen";

/**
 * Per-mode sizing POLICY for the reel frame (how big on each device — not which art). The frame is
 * fit inside a `widthFrac × heightFrac` box of the screen, preserving its texture aspect (like
 * Header), then centered at `x = w/2`, `y = centerYFrac * h`. Tune per mode.
 */
export interface ReelSizing {
  widthFrac: number; // max frame width as a fraction of screen width
  heightFrac: number; // max frame height as a fraction of screen height
  centerYFrac: number; // vertical center as a fraction of screen height
}

export const REEL: Record<LayoutMode, ReelSizing> = {
  desktop: { widthFrac: 0.7, heightFrac: 0.7, centerYFrac: 0.5 },
  "mobile-landscape": { widthFrac: 0.5, heightFrac: 0.7, centerYFrac: 0.5 },
  portrait: { widthFrac: 0.96, heightFrac: 0.5, centerYFrac: 0.48 },
};
