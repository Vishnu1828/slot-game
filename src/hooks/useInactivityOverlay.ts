import { useEffect } from "react";
import { useNavigationStore } from "@/store/useNavigationStore";

/** How long the user can be idle before the "ARE YOU STILL THERE" popup shows. Tune as needed. */
export const INACTIVITY_MS = 3 * 60_000;

// User-activity signals that reset the idle timer.
const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
] as const;

/**
 * Shows the `inactive` overlay after `timeoutMs` of no user activity, and resets the countdown on
 * any activity. The timer only runs while NO overlay is open, so it never stacks on top of another
 * popup or fires while the user is mid-decision; closing the inactive popup (CONTINUE PLAYING →
 * `activeOverlay = "none"`) re-arms it automatically.
 *
 * Call once from a component that's mounted during gameplay (e.g. PixiNavigation).
 */
export function useInactivityOverlay(timeoutMs = INACTIVITY_MS) {
  const showOverlay = useNavigationStore((s) => s.showOverlay);
  const activeOverlay = useNavigationStore((s) => s.activeOverlay);

  useEffect(() => {
    // Pause the idle timer whenever any overlay is open; re-arm when it closes (dep on activeOverlay).
    if (activeOverlay !== "none") return;

    let timer = window.setTimeout(() => showOverlay("inactive"), timeoutMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => showOverlay("inactive"), timeoutMs);
    };

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, reset, { passive: true }),
    );

    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [activeOverlay, showOverlay, timeoutMs]);
}
