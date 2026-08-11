import { useEffect, useRef } from "react";
import { useTick } from "@pixi/react";
import type { Ticker } from "pixi.js";
import { useRoundStore, type WinPhase } from "@/store/useRoundStore";
import { useGameControlsStore } from "@/store/useGameControlsStore";
import { BOUNCE_MS, PAYLINE_MS } from "@/constants/winPresentation";
import type { ThemeAssets } from "@/types/theme";
import {
  bounceSheets,
  ensureSheets,
  releaseSheets,
  winPopupSheets,
  winningSheets,
  winningSheetsFor,
} from "./winAssets";

/**
 * How long each timed beat lasts. A phase absent here is not timed by this hook: "none" is idle, and
 * "popup" times itself (`WinPopup` calls `onDone` off its own ticker).
 */
const BEAT_MS: Partial<Record<WinPhase, number>> = {
  bounce: BOUNCE_MS,
  paylines: PAYLINE_MS,
};

export interface UseWinPresentation {
  /** Current beat. Gate the payline overlay, the win screen and the spin button on this. */
  phase: WinPhase;
  /** End the presentation now (the win screen's own dismiss/tap-to-skip calls this). */
  dismiss: () => void;
}

/**
 * The post-spin win presentation, in one place:
 *
 * ```
 * settle → bounce (BOUNCE_MS) → paylines (PAYLINE_MS) → popup → none
 * ```
 *
 * A losing spin never leaves `"none"`. The phase itself lives in `useRoundStore` so any component can
 * read it; this hook owns the *transitions*.
 *
 * Every game screen gets the whole flow from a single call — nothing to re-implement per game:
 *
 * ```ts
 * const { phase, dismiss } = useWinPresentation(isSpinning, theme);
 * ```
 *
 * Passing the theme also puts this hook in charge of the celebration art's MEMORY: those sheets are
 * the largest thing a slot loads and they are excluded from the game bundle, so something has to fetch
 * them per win and free them per beat. This hook already owns the beat boundaries, so it does it —
 * see `winAssets.ts` for why, and note it is all derived from the theme, so no game writes any of it.
 *
 * The timing lives here rather than in the store to match how this repo works (stores are pure state;
 * `useReelSpin` and `Toast` own their own timing) and because React effects give cleanup for free.
 *
 * Beat timing runs on the **Pixi ticker**, not `setTimeout`, so it shares one clock with the animations
 * it sequences. Consequence: this hook must be called from inside the `<Application>` tree (any game
 * screen is), and the presentation freezes and resumes with the rest of the game rather than running on
 * independently.
 *
 * **Invariant:** `phase !== "none"` is only ever entered by a mounted screen, and every entry has an
 * exit driven by the same ticker the game itself runs on — so the presentation can only ever be stuck if
 * the whole game is (in which case `isSpinning` would already be stuck too, since the reels settle from
 * their own tick).
 */
export function useWinPresentation(
  isSpinning: boolean,
  theme: ThemeAssets,
): UseWinPresentation {
  // `phase` is subscribed (callers render off it); the transition actions are read from the store inside
  // the tick instead, so the tick callback can't act on a stale snapshot.
  const phase = useRoundStore((s) => s.phase);
  const reset = useRoundStore((s) => s.reset);
  const lastResult = useRoundStore((s) => s.lastResult);

  // --- celebration art: fetch per win, free per beat (see winAssets.ts) ---

  // Warm the bounce sheets once, in the background. They are the only beat with a deadline too tight
  // to fetch against — at "extra fast" the reels land ~490ms after the result is known — and they are
  // also by far the smallest, so they are the one set worth holding for the session.
  useEffect(() => {
    void ensureSheets(bounceSheets(theme));
  }, [theme]);

  // A win moves phase off "none", which is also the earliest this hook can know WHICH symbols paid.
  // Fetch only their glows, plus the popup sheets; the popup is ~4s away (bounce + glow), so it has a
  // comfortable window even if the glow itself doesn't make it.
  useEffect(() => {
    if (phase === "none" || !lastResult?.wins.length) return;
    void ensureSheets([
      ...winningSheetsFor(theme, lastResult.wins),
      ...winPopupSheets(theme),
    ]);
  }, [phase, lastResult, theme]);

  // The beats never overlap, so peak memory is one beat's art rather than all of it: the glows are done
  // by the time the popup opens, and the popup's sheets are dead once the presentation ends. Freeing
  // ALL the glow sheets (not just this spin's) also sweeps up any left by earlier spins.
  useEffect(() => {
    if (phase === "popup") void releaseSheets(winningSheets(theme));
  }, [phase, theme]);

  useEffect(() => {
    if (phase === "none")
      void releaseSheets([...winningSheets(theme), ...winPopupSheets(theme)]);
  }, [phase, theme]);

  // Declared FIRST so on mount it runs before the hand-off effect below.
  //
  // No mounted screen means no presentation. The phase lives in a module-level store, so without this a
  // remount (game switch, HMR, Suspense) would inherit whatever phase was left behind — leaving the spin
  // button disabled forever, and since `lastResult` also survives, potentially opening game A's win
  // screen inside game B.
  useEffect(() => {
    reset();
    return reset;
  }, [reset]);

  // A new spin wipes whatever is still on screen. Driven off `isSpinning` rather than the game's
  // `onCommit` so it covers manual AND autoplay spins with nothing to wire up per game.
  useEffect(() => {
    if (isSpinning) reset();
  }, [isSpinning, reset]);

  // paylines -> win screen, timed on the PIXI TICKER rather than a wall clock, so the hand-off shares
  // one clock with everything it hands off between: `PaylineOverlay`'s glow accumulates `deltaMS` the
  // same way, so the glow finishing and the screen opening cannot drift apart. It also means the whole
  // presentation pauses and resumes cleanly when the tab is backgrounded (rAF stops, so the ticker
  // stops) instead of a timer firing against a frozen glow. Future animations added to any beat get the
  // same clock for free.
  //
  // `phase` and the actions are read from the store INSIDE the tick rather than captured from render, so
  // the callback can never act on a stale phase.
  //
  // During autoplay the next spin is only 120-350ms away, so skip the screen entirely and let the glow
  // be cut short — the intended fast-autoplay feel. `autoplay` is likewise read at fire time, so the
  // last autospin being a win doesn't restart the beat.
  //
  // TODO: honour `useGameControlsStore.skipScreens` here instead of the bare autoplay flag. It already
  // exists and is wired to the Autospin drawer but nothing reads it; switching is a product decision
  // (autoplay would show win screens by default), so it is left explicit rather than changed silently.
  const elapsed = useRef(0);
  const lastPhase = useRef<WinPhase>("none");
  useTick((ticker: Ticker) => {
    const round = useRoundStore.getState();

    // Restart the clock whenever the beat changes. Without this the bounce's leftover `elapsed` would
    // carry into the payline beat and cut the glow short by however long the bounce ran.
    if (round.phase !== lastPhase.current) {
      lastPhase.current = round.phase;
      elapsed.current = 0;
    }

    const beat = BEAT_MS[round.phase];
    if (beat == null) {
      elapsed.current = 0; // "none" / "popup" — nothing timed here (the win screen times itself)
      return;
    }
    elapsed.current += ticker.deltaMS;
    if (elapsed.current < beat) return;
    elapsed.current = 0;

    if (round.phase === "bounce") {
      round.endBounce();
      return;
    }
    if (useGameControlsStore.getState().autoplay) round.reset();
    else round.openWinScreen();
  });

  // The "popup" beat needs no timer here: `WinPopup` runs its own `useTick` and calls `onDone` (wired to
  // `dismiss` below) when it finishes or is tapped — the same clock again.

  return { phase, dismiss: reset };
}

export default useWinPresentation;
