import { create } from "zustand";
import type { SpinResult } from "@/game/math/types";

/** Where the win presentation has got to. See `useWinPresentation` for the transitions. */
export type WinPhase =
  /** Idle — nothing being presented. The spin button is live. */
  | "none"
  /** The winning symbols hitting as they land, before the lines are drawn. */
  | "bounce"
  /** Winning lines glowing over the reels, winning symbols animating. */
  | "paylines"
  /** Win screen up, counting the amount. */
  | "popup";

/**
 * The most recent spin result plus how far through presenting it we are, stored so any component can
 * read them without prop-drilling (the GameState win line, the payline overlay, the win screen).
 *
 * `lastResult` is set on settle and then deliberately KEPT — `reset()` clears only the phase, so
 * win-line highlighting and any future "last win" UI still have the data. Consumers that must not show
 * a stale win (e.g. the status line) gate on `phase` instead.
 */
interface RoundState {
  lastResult: SpinResult | null;
  phase: WinPhase;
  /** Store a settled result and start presenting it (or stay idle if it didn't pay). */
  settleRound: (result: SpinResult) => void;
  /** Bounce beat finished — hand off to the lines. */
  endBounce: () => void;
  /** Payline beat finished — hand off to the win screen. */
  openWinScreen: () => void;
  /** Presentation over (dismissed, superseded by a new spin, or no screen mounted). */
  reset: () => void;
}

export const useRoundStore = create<RoundState>((set) => ({
  lastResult: null,
  phase: "none",

  // Result and phase in ONE set, so no render can ever pair a new phase with the previous spin's
  // result. `phase` is written unconditionally: a losing spin must clear any phase left over from the
  // spin before it.
  settleRound: (result) =>
    set({
      lastResult: result,
      // Entering "bounce" only on a paying spin is what leaves a LOSING spin at "none" with the spin
      // button live the instant the reels stop — no decorative beat on the ~78% of spins that don't win.
      phase: result.totalWinTokens > 0 ? "bounce" : "none",
    }),

  // Both transitions are guarded on their source phase, so a late or duplicated tick can't advance the
  // presentation out of order (e.g. re-opening the win screen after a new spin already reset us).
  endBounce: () => set((s) => (s.phase === "bounce" ? { phase: "paylines" } : s)),

  openWinScreen: () =>
    set((s) => (s.phase === "paylines" ? { phase: "popup" } : s)),

  reset: () => set({ phase: "none" }),
}));
