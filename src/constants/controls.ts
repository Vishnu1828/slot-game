import type { LayoutMode } from "@/hooks/useScreen";

/** Sizes (px) for the control cluster, per layout mode. Tune to match the mockups. */
export interface ControlsSizing {
  /** Spin orb diameter. */
  spinSize: number;
  /** Bet +/- circular button diameter. */
  betBtnSize: number;
  smallBtnWidth: number;
  smallBtnHeight: number;
  /** Gap between adjacent buttons in a cluster (incl. spin → bet +/- row). */
  gap: number;
  /** Vertical gap between the bet +/- row and the small-button row (slightly larger than `gap`). */
  rowGap: number;
  /** Inset from the screen's right edge (landscape/desktop right cluster). */
  marginX: number;
  /** Inset from the screen's bottom edge. */
  marginBottom: number;
  /** Spin orb vertical center as a fraction of screen height (landscape/desktop only). */
  spinTopFactor: number;
}

export const CONTROLS: Record<LayoutMode, ControlsSizing> = {
  desktop: {
    spinSize: 150,
    betBtnSize: 54,
    smallBtnWidth: 56,
    smallBtnHeight: 44,
    gap: 18,
    rowGap: 24,
    marginX: 44,
    marginBottom: 75,
    spinTopFactor: 0.65,
  },
  "mobile-landscape": {
    spinSize: 104,
    betBtnSize: 40,
    smallBtnWidth: 40,
    smallBtnHeight: 32,
    gap: 12,
    rowGap: 16,
    marginX: 22,
    marginBottom: 50,
    spinTopFactor: 0.42,
  },
  portrait: {
    spinSize: 132,
    betBtnSize: 40,
    smallBtnWidth: 40,
    smallBtnHeight: 32,
    gap: 16,
    rowGap: 16,
    marginX: 24,
    marginBottom: 65,
    spinTopFactor: 0.3,
  },
};
