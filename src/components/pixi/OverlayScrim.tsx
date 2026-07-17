import { extend } from "@pixi/react";
import { Graphics } from "pixi.js";
import { useScreen } from "@/hooks/useScreen";

extend({ Graphics });

export interface OverlayScrimProps {
  /** Dim opacity (default 0.6). */
  alpha?: number;
  /** Dim colour (default 0x05070f). */
  color?: number;
  /** Block clicks to the game beneath (default true). */
  blockInput?: boolean;
}

/**
 * Full-screen dim backdrop for overlays, sized to the REAL screen (useScreen) so it covers the whole
 * viewport — including the letterbox margins around a scaled DesignStage. Pair it with a <DesignStage>
 * that holds the scaled modal/drawer content: <OverlayScrim/> then <DesignStage>…</DesignStage>.
 */
export function OverlayScrim({
  alpha = 0.6,
  color = 0x05070f,
  blockInput = true,
}: OverlayScrimProps) {
  const { w, h } = useScreen();
  return (
    <pixiGraphics
      eventMode={blockInput ? "static" : "none"}
      draw={(g) => {
        g.clear();
        g.rect(0, 0, w, h).fill({ color, alpha });
      }}
    />
  );
}

export default OverlayScrim;
