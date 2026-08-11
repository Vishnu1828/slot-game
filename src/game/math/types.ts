/**
 * Common slot math contract — shared by every game and by the (future) server.
 *
 * A game's `MathConfig` fully describes its reels, symbols, pay table and paylines. The local engine
 * (`engine.ts`) turns a config into spin results the exact shape the real server will return, so the
 * client is written once against `SpinResult` and the backend can be swapped in behind the API seam.
 */

/** Opaque symbol key, scoped to (gameId, mathVersion). e.g. "H1".."L3", "B0". */
export type SymbolId = string;

export type SymbolKind = "regular" | "wild" | "scatter" | "bonus";

export interface SymbolDef {
  id: SymbolId;
  /** Behaviour lives here, not in the id text. Only `regular` pays on a line for Fortune Teller. */
  kind: SymbolKind;
  /** Presentation grouping + reporting only (e.g. "high" | "mid" | "low"). */
  tier: string;
  /** 1 = highest paying; unique, contiguous from 1. */
  payRank: number;
  /** key = match count as string ("3".."5"), value = × bet-per-line. */
  pays: Record<string, number>;
  /** [reelIndex][...stopIndices]; 0-based, ascending, unique. Union per reel = a full partition. */
  positions: number[][];
}

export interface MathConfig {
  gameId: string;
  /** semver; immutable once certified. */
  mathVersion: string;
  /** literal 0 — all indices are 0-based. */
  indexBase: 0;
  grid: { reels: number; rows: number };
  /** length === grid.reels. */
  reelLengths: number[];
  /** [lineIndex][reelIndex] = rowIndex (0-based). */
  lines: number[][];
  evaluation: { direction: "ltr"; longestOnly: true; minMatch: number };
  denomination: { tokensPerUnit: number; currency: string };
  betLimits: {
    perLineTokens: { min: number; max: number };
    totalBetTokens: { min: number; max: number };
  };
  exposure: {
    /** Verified by CI, not trusted. */
    declaredMaxPerSpinXPerLine: number;
    regulatoryCapUnits: number;
  };
  rtp: { declared: number; toleranceAbs: number };
  /** [] for Fortune Teller (no bonus/free-spins). */
  features: string[];
  symbols: SymbolDef[];
  /** Per-reel flag: true where the strip is NOT certified (provisional client fill). */
  provisionalReels: boolean[];
}

/* ---- server request/response contract ---- */

export interface SpinRequest {
  /** Bet on a single line, in tokens (= total bet ÷ line count). */
  betPerLineTokens: number;
}

export interface WinLine {
  /** Index into `MathConfig.lines`. */
  lineId: number;
  symbolId: SymbolId;
  /** Length of the winning run (from reel 0, left→right). */
  count: number;
  /** Row index per matched reel (a slice of the line). */
  rows: number[];
  amountTokens: number;
}

export interface SpinResult {
  /** Top-visible stop index per reel (0-based). */
  stops: number[];
  /** [row][reel] = SymbolId (the 3×5 window). */
  grid: SymbolId[][];
  wins: WinLine[];
  totalWinTokens: number;
}
