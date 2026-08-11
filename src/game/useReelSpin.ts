import { useCallback, useEffect, useRef, useState } from "react";
import { useTick } from "@pixi/react";
import type { Ticker } from "pixi.js";
import {
  useGameControlsStore,
  type SpeedLevel,
} from "@/store/useGameControlsStore";
import { useRoundStore } from "@/store/useRoundStore";
import type { SpinResult } from "@/game/math/types";

/**
 * Beat between autoplay spins, per speed level — measured from the moment the round is fully presented
 * (reels settled AND any win presentation finished), not from the reels stopping.
 *
 * PIXI TICKER milliseconds, not wall clock, matching `constants/winPresentation.ts`. See the ticker
 * below for why that distinction has teeth here.
 */
const AUTOPLAY_GAP: Record<SpeedLevel, number> = { 1: 350, 2: 220, 3: 120 };

/** Idle stops before the first spin — random so the reels don't always open on the same window. */
const randomStops = (reelLengths: number[]): number[] =>
  reelLengths.map((len) => Math.floor(Math.random() * len));

export interface UseReelSpinOptions {
  /** Stops per reel (`MathConfig.reelLengths`) — sizes the idle/landing stop indices. */
  reelLengths: number[];
  /** Player balance, in tokens (pre-spin credit check). */
  balance: number;
  /** Current total bet, in tokens. */
  bet: number;
  /** Bet on a single line, in tokens (= total bet ÷ line count). */
  betPerLineTokens: number;
  /** Ask the engine/server for a spin result. */
  requestSpin: (betPerLineTokens: number) => Promise<SpinResult>;
  /** Called when a spin is blocked for insufficient credit. */
  onInsufficient: () => void;
  /** Called at spin start (after the credit check passes) with the total bet — deduct the stake. */
  onCommit?: (betTokens: number) => void;
  /** Called when the reels settle, with the spin result — credit the win / store the round. */
  onSettle?: (result: SpinResult) => void;
  /** Called if the spin request fails, with the total bet — refund the deducted stake. */
  onAbort?: (betTokens: number) => void;
}

export interface UseReelSpin {
  /** Increments once per spin — the animation watches this to start a new spin. */
  spinId: number;
  /** Top-visible stop index per reel the reels settle on for the current `spinId`. */
  finalStops: number[];
  /** True from a spin's start until its reels finish settling. */
  isSpinning: boolean;
  /** Manual spin trigger (spin button). No-op during autoplay or an in-flight spin. */
  spin: () => void;
  /** The reel animation calls this once the last reel has stopped. */
  handleSettled: () => void;
}

/**
 * Spin orchestration for a reel game. Owns the target stop per reel (`finalStops`) and a `spinId` the
 * animation component (`Reels`) reacts to; it does NOT animate — the reels scroll/stop themselves and
 * report back via `handleSettled`. Runs the pre-spin credit check and the autoplay loop (START
 * AUTOSPIN → `autoplay = true` runs `autospinCount` spins, then clears the flag). The stops come from
 * `requestSpin` (the math engine today, the server later), and the reels scroll their real strips, so
 * nothing about what the player sees is invented here.
 *
 * An autoplay run waits for the WIN PRESENTATION as well as the reels before spinning again, so a
 * win inside a run gets the same bounce + glow a manual spin does. Its inter-spin gap is timed on the
 * Pixi ticker, so this hook must be called from inside the `<Application>` tree (any game screen is).
 */
export function useReelSpin(opts: UseReelSpinOptions): UseReelSpin {
  const { reelLengths } = opts;

  const [spinId, setSpinId] = useState(0);
  const [finalStops, setFinalStops] = useState<number[]>(() =>
    randomStops(reelLengths),
  );
  const [isSpinning, setSpinning] = useState(false);

  const autoplay = useGameControlsStore((s) => s.autoplay);
  // The win presentation's beat. Subscribed (not read at fire time) because the autoplay chain below
  // is gated on it returning to "none" — see that effect for why.
  const phase = useRoundStore((s) => s.phase);

  // Latest opts for use inside timers / callbacks (dodges stale closures).
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const busyRef = useRef(false); // a spin is in flight (animating)
  const autoRef = useRef(false); // autoplay loop is active
  const remainingRef = useRef(0); // autospins left this run
  const lastResultRef = useRef<SpinResult | null>(null); // result for the in-flight spin

  // The gap countdown to the next autospin, accumulated on the Pixi ticker (see below).
  const gapArmed = useRef(false);
  const gapElapsed = useRef(0);

  // Kick off one spin: deduct the stake, request a result, set its stops as the landing target, then
  // bump spinId (the animation reacts). `isSpinning` flips on immediately so the button disables even
  // during request latency.
  const beginSpin = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSpinning(true);
    const { bet, betPerLineTokens, requestSpin, onCommit, onAbort } =
      optsRef.current;
    onCommit?.(bet); // deduct the stake at spin start (spec §6, step 1)
    try {
      const result = await requestSpin(betPerLineTokens);
      lastResultRef.current = result;
      setFinalStops(result.stops);
      setSpinId((n) => n + 1);
    } catch {
      // Result never arrived → refund the stake and abort cleanly (don't leave the reels stuck).
      onAbort?.(bet);
      busyRef.current = false;
      setSpinning(false);
    }
  }, []);

  const stopAuto = useCallback(() => {
    autoRef.current = false;
    useGameControlsStore.getState().setAutoplay(false);
  }, []);

  // One iteration of the autoplay loop: credit-check, then spin (or stop).
  const autoStep = useCallback(() => {
    if (!autoRef.current) return;
    if (remainingRef.current <= 0) {
      stopAuto();
      return;
    }
    const { balance, bet, onInsufficient } = optsRef.current;
    if (balance < bet) {
      onInsufficient();
      stopAuto();
      return;
    }
    remainingRef.current -= 1;
    void beginSpin();
  }, [beginSpin, stopAuto]);

  // Manual spin: credit-check, then one spin. Ignored during autoplay / mid-spin.
  const spin = useCallback(() => {
    if (autoRef.current || busyRef.current) return;
    const { balance, bet, onInsufficient } = optsRef.current;
    if (balance < bet) {
      onInsufficient();
      return;
    }
    void beginSpin();
  }, [beginSpin]);

  // Called by the animation when the last reel stops. Credits the win and ends the spin; chaining the
  // next autospin is the effect below's job, because it has to wait for the win presentation too.
  const handleSettled = useCallback(() => {
    if (!busyRef.current) return;
    busyRef.current = false;
    setSpinning(false);
    const result = lastResultRef.current;
    if (result) optsRef.current.onSettle?.(result);
  }, []);

  // Autoplay controller — arms/disarms a run off the store's `autoplay` flag. It deliberately does NOT
  // spin: the chain effect below owns every dispatch, so the first spin of a run goes through the same
  // guards as the rest (notably "not already spinning", which previously ate a count when START was
  // pressed mid-spin). Re-reading `autospinCount` on each false→true is what makes a fresh START run
  // the full count again rather than the leftover of a stopped run.
  useEffect(() => {
    if (!autoplay) {
      autoRef.current = false; // external stop ends the loop after the current spin
      return;
    }
    if (autoRef.current) return; // already looping
    autoRef.current = true;
    remainingRef.current = useGameControlsStore.getState().autospinCount;
  }, [autoplay]);

  // Chain the next autospin — after the reels have settled AND the win presentation has finished.
  //
  // Waiting on `phase` is the whole point: chaining off the settle callback alone gave the celebration
  // only AUTOPLAY_GAP (350/220/120ms) before the new spin wiped it, which is less than BOUNCE_MS, so
  // the payline glow never got to mount at all. A losing spin is already back at "none" when it
  // settles, so its pacing is unchanged — only wins take longer, which is the intent.
  //
  // Driving this from state rather than from `handleSettled` also means a spin that never settles
  // (a failed request clears `isSpinning` in its catch) re-arms instead of stalling the run forever.
  useEffect(() => {
    gapArmed.current = autoplay && !isSpinning && phase === "none";
    gapElapsed.current = 0;
  }, [autoplay, isSpinning, phase]);

  // The gap runs on the PIXI TICKER, not `setTimeout`, so the whole round shares one clock with the
  // reels and the win presentation (same rule as `useWinPresentation`). That matters beyond tidiness:
  // rAF stops in a backgrounded tab but timers keep firing, so a wall-clock gap would dispatch the next
  // autospin — DEDUCTING THE STAKE via `onCommit` — while the reels are frozen and the player can't see
  // anything. On the ticker a backgrounded run simply pauses and resumes where it left off.
  //
  // Consequence: this hook must be called from inside the `<Application>` tree (any game screen is).
  //
  // `speed` is read at fire time rather than subscribed, so changing it mid-gap takes effect on the
  // next spin without restarting the countdown.
  useTick((ticker: Ticker) => {
    if (!gapArmed.current) return;
    gapElapsed.current += ticker.deltaMS;
    if (gapElapsed.current < AUTOPLAY_GAP[useGameControlsStore.getState().speed])
      return;
    gapArmed.current = false;
    autoStep();
  });

  return { spinId, finalStops, isSpinning, spin, handleSettled };
}
