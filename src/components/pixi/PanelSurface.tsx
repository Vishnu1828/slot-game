import { extend } from "@pixi/react";
import { Graphics, type EventMode } from "pixi.js";

// Register <pixiGraphics> as a JSX element (idempotent).
extend({ Graphics });

export interface PanelSurfaceProps {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius (default 16). */
  radius?: number;
  /** Fill colour (default 0x020617). */
  color?: number;
  /** Fill opacity — < 1 lets the game read through the card (default 1). */
  alpha?: number;
  /** Y (in the same space as `y`) for the 1px header divider. Omit for no divider. */
  dividerY?: number;
  /** Default "static" so taps on the card don't fall through to the game beneath. */
  eventMode?: EventMode;
}

/**
 * Rounded card background for the settings/rules overlays — the fill plus the optional 1px header
 * divider, drawn in one Graphics. Sized/positioned in REAL screen coords by the caller (the overlays
 * lay out with useScreen, not the design canvas).
 */
export function PanelSurface({
  x,
  y,
  width,
  height,
  radius = 16,
  color = 0x020617,
  alpha = 1,
  dividerY,
  eventMode = "static",
}: PanelSurfaceProps) {
  return (
    <pixiGraphics
      eventMode={eventMode}
      draw={(g) => {
        g.clear();
        g.roundRect(x, y, width, height, radius).fill({ color, alpha });
        if (dividerY != null) {
          g.rect(x, dividerY, width, 1).fill({ color: 0xffffff, alpha: 0.12 });
        }
      }}
    />
  );
}

export default PanelSurface;
