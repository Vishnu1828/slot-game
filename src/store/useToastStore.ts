import { create } from "zustand";

export interface ToastData {
  /** Unique per show() call — used as a React key so re-showing restarts the fade animation. */
  id: number;
  message: string;
  /** Optional icon alias. Shown only when provided (otherwise the toast is text-only). */
  icon?: string;
  /** Visible hold time (ms) before fading out. */
  durationMs?: number;
}

interface ToastState {
  toast: ToastData | null;
  showToast: (
    message: string,
    opts?: { icon?: string; durationMs?: number },
  ) => void;
  clearToast: () => void;
}

let seq = 0;

/**
 * Transient toast messages (e.g. "BET INCREASED TO $3", "SPEED 2 ENABLED"). Call `showToast(...)`
 * from anywhere; a single `<Toast />` (mounted in PixiNavigation) renders the current one and calls
 * `clearToast` when it finishes fading. Only one toast shows at a time — a new one replaces it.
 *
 * @example
 * useToastStore.getState().showToast("BET INCREASED TO $3", { icon: "chip_icon" });
 */
export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  showToast: (message, opts) =>
    set({
      toast: {
        id: ++seq,
        message,
        icon: opts?.icon,
        durationMs: opts?.durationMs ?? 2000,
      },
    }),
  clearToast: () => set({ toast: null }),
}));
