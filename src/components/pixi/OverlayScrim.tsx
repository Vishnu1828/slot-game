import { extend } from "@pixi/react";
import { Graphics } from "pixi.js";
import { useScreen } from "@/hooks/useScreen";

extend({ Graphics });

export interface OverlayScrimProps {
  /** Dim opacity. Default 0 — invisible; see the note on the component. */
  alpha?: number;
  /** Dim colour (default 0x05070f). */
  color?: number;
  /** Block clicks to the game beneath (default true). */
  blockInput?: boolean;
}

/**
 * Full-screen backdrop for overlays, sized to the REAL screen (useScreen) so it covers the whole
 * viewport — including the letterbox margins around a scaled DesignStage. Pair it with a <DesignStage>
 * that holds the scaled modal/drawer content: <OverlayScrim/> then <DesignStage>…</DesignStage>.
 *
 * It draws NOTHING by default. Separating an overlay from the game is entirely `SceneBlur`'s job now;
 * all this contributes is BLOCKING INPUT to the game beneath. That still works at alpha 0 because Pixi
 * hit-tests a Graphics through `GraphicsContext.containsPoint`, which tests the geometry and never
 * looks at fill alpha — so the rect keeps catching pointers while being invisible. Do not delete it as
 * dead code: without it, taps land on the bet buttons and footer behind an open overlay.
 *
 * Pass an `alpha` only if a specific overlay needs darkening back.
 */
export function OverlayScrim({
  alpha = 0,
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
