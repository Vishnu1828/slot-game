import { useEffect } from "react";
import { useApplication } from "@pixi/react";
import {
  Rectangle,
  type Container,
  type FederatedPointerEvent,
} from "pixi.js";
import { useScreen } from "./useScreen";

/** Put this `label` on an overlay's root container — taps inside it never dismiss. */
export const OVERLAY_PANEL_LABEL = "overlay-panel";
/** Put this `label` on the button that opens an overlay, so its own toggle closes it (no re-open). */
export const OVERLAY_OPENER_LABEL = "overlay-opener";

/**
 * Dismiss a non-blocking overlay when the user taps the game behind it — without stealing the tap, so
 * the control under the pointer still fires (tap SPIN → card closes AND the reels spin).
 *
 * Listens on the Pixi stage: pointer events bubble from the hit target up to the root, so one listener
 * sees every tap and only observes it. Empty background art isn't a hit target, so the stage gets a
 * full-screen `hitArea` for as long as the overlay is open (both are restored on cleanup).
 */
export function useDismissOnOutsideTap(enabled: boolean, onDismiss: () => void) {
  const { app } = useApplication();
  const { w, h } = useScreen();

  useEffect(() => {
    if (!enabled || !app?.stage) return;
    const stage = app.stage;

    const prevMode = stage.eventMode;
    const prevHitArea = stage.hitArea;
    stage.eventMode = "static";
    stage.hitArea = new Rectangle(0, 0, w, h);

    const onDown = (e: FederatedPointerEvent) => {
      for (let n = e.target as Container | null; n && n !== stage; n = n.parent) {
        if (n.label === OVERLAY_PANEL_LABEL || n.label === OVERLAY_OPENER_LABEL)
          return;
      }
      // No stopPropagation: the game control under the pointer still gets its event.
      onDismiss();
    };

    stage.on("pointerdown", onDown);
    return () => {
      stage.off("pointerdown", onDown);
      stage.eventMode = prevMode;
      stage.hitArea = prevHitArea;
    };
  }, [app, enabled, w, h, onDismiss]);
}

export default useDismissOnOutsideTap;
