import { create } from "zustand";
import { useToastStore } from "./useToastStore";
import { commonTheme } from "@/constants/commonTheme";
import { formatGuarani } from "@/utils/format";

/* ------------------------------------------------------------------ *
 * Betting model — Fortune Teller Functional Spec v2.1 (PYG).
 *
 *   1 token (credit) = ₲1.000            (display ₲ = tokens × DENOM_GS)
 *   20 fixed pay lines
 *   coins per line ∈ 1..10
 *   coin value     ∈ 1..6  tokens
 *   betPerLine = coinValue × coinsPerLine        → 1..60   tokens
 *   totalBet   = betPerLine × BET_LINES          → 20..1200 tokens (₲20.000..₲1.200.000)
 *
 * `coinValue` and `coinsPerLine` are the CANONICAL state; `bet` (total tokens) is derived and kept
 * in sync after every mutation so the three displayed values can never disagree.
 * ------------------------------------------------------------------ */

/** ₲ per token (1 token = ₲1.000). */
export const DENOM_GS = 1000;

/**
 * Active pay lines the player is charged for — **20, per the spec.** This is the stake model and does
 * not change: `betPerLineTokens = bet / BET_LINES` (see `GameScreen`), and the bet range
 * ₲20.000..₲1.200.000 falls out of it.
 *
 * ⚠️ Only **5** of the 20 line PATTERNS are implemented in `math.ts` (`LINES`) so far, so the engine
 * currently evaluates 5 while the player pays for 20. That is a known, temporary development state: it
 * makes the effective return ~21.9% instead of the declared 87.5%, and it resolves itself once the
 * remaining 15 certified patterns are added to `LINES` — no change is needed here. Do not ship to real
 * players until `MathConfig.lines.length === BET_LINES`.
 */
export const BET_LINES = 20;

export const MIN_COINS_PER_LINE = 1;
export const MAX_COINS_PER_LINE = 10;

/** Selectable coin values, in tokens. Contiguous, so +/- steps by 1. */
export const COIN_VALUES = [1, 2, 3, 4, 5, 6] as const;
export const MIN_COIN_VALUE = COIN_VALUES[0];
export const MAX_COIN_VALUE = COIN_VALUES[COIN_VALUES.length - 1];

export const DEFAULT_COIN_VALUE = MIN_COIN_VALUE;
export const DEFAULT_COINS_PER_LINE = MIN_COINS_PER_LINE;

/** Total bet (tokens) for a coin value + coins-per-line pair. */
export const totalBetTokens = (coinValue: number, coinsPerLine: number) =>
  coinValue * coinsPerLine * BET_LINES;

/** Total bet bounds, in tokens (20 and 1200). */
export const MIN_BET = totalBetTokens(MIN_COIN_VALUE, MIN_COINS_PER_LINE);
export const MAX_BET = totalBetTokens(MAX_COIN_VALUE, MAX_COINS_PER_LINE);

/** Bet the game starts at (in tokens) — the spec minimum, ₲20.000. */
export const DEFAULT_BET = totalBetTokens(
  DEFAULT_COIN_VALUE,
  DEFAULT_COINS_PER_LINE,
);

export interface BetStep {
  /** Total bet in tokens. */
  total: number;
  coinValue: number;
  coinsPerLine: number;
}

/**
 * Monotonic ladder of every reachable total bet with a canonical (coinValue, coinsPerLine) pair,
 * sorted ascending. The footer +/- and the Total-bet stepper walk this so they traverse the full
 * 20..1200 range smoothly and always leave coin value / coins-per-line consistent. When several
 * pairs land on the same total, prefer the one with more coins per line (lower coin value).
 */
export const BET_LADDER: BetStep[] = (() => {
  const byTotal = new Map<number, BetStep>();
  for (const coinValue of COIN_VALUES) {
    for (let cpl = MIN_COINS_PER_LINE; cpl <= MAX_COINS_PER_LINE; cpl++) {
      const total = totalBetTokens(coinValue, cpl);
      const existing = byTotal.get(total);
      if (!existing || cpl > existing.coinsPerLine) {
        byTotal.set(total, { total, coinValue, coinsPerLine: cpl });
      }
    }
  }
  return [...byTotal.values()].sort((a, b) => a.total - b.total);
})();

/** Ladder index for a total bet (nearest step if not exact). */
const ladderIndex = (total: number) => {
  const exact = BET_LADDER.findIndex((s) => s.total === total);
  if (exact !== -1) return exact;
  let nearest = 0;
  for (let i = 1; i < BET_LADDER.length; i++) {
    if (
      Math.abs(BET_LADDER[i].total - total) <
      Math.abs(BET_LADDER[nearest].total - total)
    )
      nearest = i;
  }
  return nearest;
};

export type SpeedLevel = 1 | 2 | 3;
/** Spin speed the game starts at (1 = normal, 2 = fast, 3 = extra fast). */
export const DEFAULT_SPEED: SpeedLevel = 1;

/** Number of autospins (autospin settings). */
export const DEFAULT_AUTOSPIN_COUNT = 10;
export const MIN_AUTOSPIN = 1;
export const MAX_AUTOSPIN = 100;
export const AUTOSPIN_STEP = 1;

interface GameControlsState {
  /** Current TOTAL bet (tokens); derived from coinValue × coinsPerLine × BET_LINES. Feeds the footer. */
  bet: number;
  /** Spin speed level 1..3. */
  speed: SpeedLevel;
  /** Auto-play engaged. */
  autoplay: boolean;
  /** Number of autospins to run (autospin settings). */
  autospinCount: number;
  /** Skip win/feature screens during autospin. */
  skipScreens: boolean;
  /** Coins wagered per line (1..10). */
  coinsPerLine: number;
  /** Value of one coin, in tokens (1..6). */
  coinValue: number;
  /**
   * Raise the total bet to the next ladder step (clamped to MAX_BET). Toasts the new bet unless
   * `silent` is set — the spin-side +/- buttons toast; the bet-settings overlay stepper does not.
   */
  increaseBet: (silent?: boolean) => void;
  /** Lower the total bet to the previous ladder step (clamped to MIN_BET). See `increaseBet` re: `silent`. */
  decreaseBet: (silent?: boolean) => void;
  /** Cycle speed 1 → 2 → 3 → 1; toasts the new level (footer speed button). */
  cycleSpeed: () => void;
  /** Set the speed level directly (autospin settings 3-way picker). */
  setSpeed: (level: SpeedLevel) => void;
  /** Raise/lower the autospin count by one step (clamped). */
  increaseAutospin: () => void;
  decreaseAutospin: () => void;
  /** Set the skip-screens flag. */
  setSkipScreens: (v: boolean) => void;
  /** Toggle auto-play on/off. */
  toggleAutoplay: () => void;
  /** Set auto-play on/off directly (e.g. START AUTOSPIN). */
  setAutoplay: (v: boolean) => void;
  /** Betting settings steppers (clamped); each recomputes the derived total bet. */
  increaseCoinsPerLine: () => void;
  decreaseCoinsPerLine: () => void;
  increaseCoinValue: () => void;
  decreaseCoinValue: () => void;
  /** Max out coins/value → total bet = MAX_BET. */
  betMax: () => void;
}

const toast = (
  message: string,
  options?: { icon?: string; durationMs?: number },
) => useToastStore.getState().showToast(message, options);

export const useGameControlsStore = create<GameControlsState>((set, get) => ({
  bet: DEFAULT_BET,
  speed: DEFAULT_SPEED,
  autoplay: false,
  autospinCount: DEFAULT_AUTOSPIN_COUNT,
  skipScreens: false,
  coinsPerLine: DEFAULT_COINS_PER_LINE,
  coinValue: DEFAULT_COIN_VALUE,

  increaseBet: (silent) => {
    const i = ladderIndex(get().bet);
    if (i >= BET_LADDER.length - 1) return; // already at max
    const step = BET_LADDER[i + 1];
    set({
      bet: step.total,
      coinValue: step.coinValue,
      coinsPerLine: step.coinsPerLine,
    });
    if (!silent)
      toast(`BET INCREASED TO ${formatGuarani(step.total)}`, {
        icon: commonTheme.buttonIcons.coins,
      });
  },

  decreaseBet: (silent) => {
    const i = ladderIndex(get().bet);
    if (i <= 0) return; // already at min
    const step = BET_LADDER[i - 1];
    set({
      bet: step.total,
      coinValue: step.coinValue,
      coinsPerLine: step.coinsPerLine,
    });
    if (!silent)
      toast(`BET REDUCED TO ${formatGuarani(step.total)}`, {
        icon: commonTheme.buttonIcons.coins,
      });
  },

  cycleSpeed: () => {
    const speed = ((get().speed % 3) + 1) as SpeedLevel;
    set({ speed });
    toast(`SPEED ${speed} ENABLED`, {
      icon: commonTheme.buttonIcons[`speed_${speed}`],
    });
  },

  setSpeed: (level) => set({ speed: level }),

  increaseAutospin: () =>
    set((s) => ({
      autospinCount: Math.min(s.autospinCount + AUTOSPIN_STEP, MAX_AUTOSPIN),
    })),
  decreaseAutospin: () =>
    set((s) => ({
      autospinCount: Math.max(s.autospinCount - AUTOSPIN_STEP, MIN_AUTOSPIN),
    })),

  setSkipScreens: (v) => set({ skipScreens: v }),

  toggleAutoplay: () => set((s) => ({ autoplay: !s.autoplay })),
  setAutoplay: (v) => set({ autoplay: v }),

  increaseCoinsPerLine: () =>
    set((s) => {
      const coinsPerLine = Math.min(s.coinsPerLine + 1, MAX_COINS_PER_LINE);
      return { coinsPerLine, bet: totalBetTokens(s.coinValue, coinsPerLine) };
    }),
  decreaseCoinsPerLine: () =>
    set((s) => {
      const coinsPerLine = Math.max(s.coinsPerLine - 1, MIN_COINS_PER_LINE);
      return { coinsPerLine, bet: totalBetTokens(s.coinValue, coinsPerLine) };
    }),
  increaseCoinValue: () =>
    set((s) => {
      const coinValue = Math.min(s.coinValue + 1, MAX_COIN_VALUE);
      return { coinValue, bet: totalBetTokens(coinValue, s.coinsPerLine) };
    }),
  decreaseCoinValue: () =>
    set((s) => {
      const coinValue = Math.max(s.coinValue - 1, MIN_COIN_VALUE);
      return { coinValue, bet: totalBetTokens(coinValue, s.coinsPerLine) };
    }),

  betMax: () =>
    set({
      coinsPerLine: MAX_COINS_PER_LINE,
      coinValue: MAX_COIN_VALUE,
      bet: MAX_BET,
    }),
}));
