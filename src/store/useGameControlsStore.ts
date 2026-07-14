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

interface GameControlsState {
  /** Current bet amount (whole units); also feeds the footer's "Total Bet". */
  bet: number;
  /** Spin speed level 1..3. */
  speed: SpeedLevel;
  /** Auto-play engaged. */
  autoplay: boolean;
  /** Raise the bet by one step (clamped to MAX_BET); toasts when it changes. */
  increaseBet: () => void;
  /** Lower the bet by one step (clamped to MIN_BET); toasts when it changes. */
  decreaseBet: () => void;
  /** Cycle speed 1 → 2 → 3 → 1; toasts the new level. */
  cycleSpeed: () => void;
  /** Toggle auto-play on/off. */
  toggleAutoplay: () => void;
}

const toast = (message: string) => useToastStore.getState().showToast(message);

export const useGameControlsStore = create<GameControlsState>((set, get) => ({
  bet: DEFAULT_BET,
  speed: DEFAULT_SPEED,
  autoplay: false,

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

  toggleAutoplay: () => set((s) => ({ autoplay: !s.autoplay })),
}));
