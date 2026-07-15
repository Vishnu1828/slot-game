import { create } from "zustand";
import { useToastStore } from "./useToastStore";

/** Bet the game starts at (in whole currency units). */
export const DEFAULT_BET = 5;
export const MIN_BET = 1;
export const MAX_BET = 100;
export const BET_STEP = 1;

export type SpeedLevel = 1 | 2 | 3;
/** Spin speed the game starts at (1 = normal, 2 = fast, 3 = extra fast). */
export const DEFAULT_SPEED: SpeedLevel = 1;

/** Number of autospins (autospin settings). */
export const DEFAULT_AUTOSPIN_COUNT = 10;
export const MIN_AUTOSPIN = 1;
export const MAX_AUTOSPIN = 100;
export const AUTOSPIN_STEP = 1;

interface GameControlsState {
  /** Current bet amount (whole units); also feeds the footer's "Total Bet". */
  bet: number;
  /** Spin speed level 1..3. */
  speed: SpeedLevel;
  /** Auto-play engaged. */
  autoplay: boolean;
  /** Number of autospins to run (autospin settings). */
  autospinCount: number;
  /** Skip win/feature screens during autospin. */
  skipScreens: boolean;
  /** Raise the bet by one step (clamped to MAX_BET); toasts when it changes. */
  increaseBet: () => void;
  /** Lower the bet by one step (clamped to MIN_BET); toasts when it changes. */
  decreaseBet: () => void;
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
}

const toast = (message: string) => useToastStore.getState().showToast(message);

export const useGameControlsStore = create<GameControlsState>((set, get) => ({
  bet: DEFAULT_BET,
  speed: DEFAULT_SPEED,
  autoplay: false,
  autospinCount: DEFAULT_AUTOSPIN_COUNT,
  skipScreens: false,

  increaseBet: () => {
    const bet = Math.min(get().bet + BET_STEP, MAX_BET);
    if (bet === get().bet) return; // already at max
    set({ bet });
    toast(`BET INCREASED TO $${bet}`);
  },

  decreaseBet: () => {
    const bet = Math.max(get().bet - BET_STEP, MIN_BET);
    if (bet === get().bet) return; // already at min
    set({ bet });
    toast(`BET REDUCED TO $${bet}`);
  },

  cycleSpeed: () => {
    const speed = ((get().speed % 3) + 1) as SpeedLevel;
    set({ speed });
    toast(`SPEED ${speed} ENABLED`);
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
}));
