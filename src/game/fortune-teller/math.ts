import type { MathConfig, SymbolDef, SymbolId } from "@/game/math/types";

/**
 * Fortune Teller math config — Functional Spec v2.1 (PYG).
 *
 * 5 reels (50/55/60/55/55), 3 rows, 5 fixed lines, 7 pay symbols. Reel 1 is the FSD's exact certified
 * strip; reels 2–5 encode the published first-20 stops and fill the rest PROVISIONALLY from the FSD
 * per-reel totals. Because those totals sum to exactly each reel's length, that fill is fully
 * determined — nothing is invented, and no stop is left for the (removed) bonus, so `B0` appears on no
 * reel; see `BONUS_PROVISIONAL`. Replace `KNOWN`/`TOTALS` with the signed CSV when it arrives, and
 * everything downstream (grid, wins) stays the same.
 */

const GAME_ID = "fortune-teller";
const REELS = 5;
const ROWS = 3;
const REEL_LENGTHS = [50, 55, 60, 55, 55];

// Fill/pay ordering. Pay symbols first (rank order), bonus last.
const PAY_SYMBOLS: SymbolId[] = ["H1", "H2", "M1", "M2", "L1", "L2", "L3"];
const SYMBOL_ORDER: SymbolId[] = [...PAY_SYMBOLS, "B0"];

// Known stop positions per reel (0-based). Reel 1 (index 0) is COMPLETE & certified (FSD §1.3);
// reels 2–5 list only the published FIRST-20 stops — the rest is provisional fill (see below).
const KNOWN: Record<SymbolId, number[]>[] = [
  {
    // Reel 1 — exact (partition of [0,50))
    H1: [10, 16],
    H2: [9, 13, 28],
    M1: [5, 30, 33, 41],
    M2: [2, 12, 23, 26, 35],
    L1: [1, 3, 6, 25, 38, 39, 42, 45, 48],
    L2: [0, 11, 18, 19, 21, 24, 27, 29, 43, 47, 49],
    L3: [4, 7, 8, 14, 15, 17, 20, 22, 31, 32, 34, 36, 37, 40, 44, 46],
    B0: [],
  },
  {
    // Reel 2 — first 20 (indices 0–19); 20–54 provisional
    H1: [0],
    H2: [3, 4, 8],
    M1: [19],
    M2: [6, 9],
    L1: [10, 11, 14, 17],
    L2: [12, 13, 15, 16],
    L3: [1, 2, 5, 7, 18],
    B0: [],
  },
  {
    // Reel 3 — first 20 (indices 0–19); 20–59 provisional
    H1: [],
    H2: [],
    M1: [3, 5, 7, 12],
    M2: [],
    L1: [8, 9, 15, 16],
    L2: [1, 2, 6, 11, 17, 18],
    L3: [0, 4, 10, 13, 14, 19],
    B0: [],
  },
  {
    // Reel 4 — first 20 (indices 0–19); 20–54 provisional
    H1: [9],
    H2: [16],
    M1: [1, 14, 15],
    M2: [8],
    L1: [4, 7, 11],
    L2: [3, 10, 12, 19],
    L3: [0, 2, 5, 6, 13, 17, 18],
    B0: [],
  },
  {
    // Reel 5 — first 20 (indices 0–19); 20–54 provisional
    H1: [19],
    H2: [5, 12, 15],
    M1: [9],
    M2: [0, 2, 18],
    L1: [11, 13, 14],
    L2: [4, 8],
    L3: [1, 3, 6, 7, 10, 16, 17],
    B0: [],
  },
];

// Certified per-reel TOTAL counts for the 7 pay symbols (FSD table "Counts R1–R5").
const TOTALS: Record<SymbolId, number[]> = {
  H1: [2, 2, 2, 2, 2],
  H2: [3, 3, 3, 3, 3],
  M1: [4, 5, 5, 5, 4],
  M2: [5, 6, 6, 6, 5],
  L1: [9, 10, 11, 10, 10],
  L2: [11, 12, 14, 12, 12],
  L3: [16, 17, 19, 17, 19],
};

/**
 * Bonus stops per reel — ZERO everywhere, and it must stay that way unless the reel lengths change.
 * The certified `TOTALS` for the 7 pay symbols already sum to EXACTLY each reel's length
 * (50/55/60/55/55), so there is no spare stop: a bonus can only exist by taking one from a pay symbol.
 * This used to be `[0, 1, 1, 1, 1]`, which carved a stop out of L3 and left L3 one short of its
 * certified count on reels 2–5 — worth ~7.4pp of RTP (80.1% measured vs 87.5% declared), because a
 * `B0` landing mid-line truncates an otherwise winning run.
 *
 * It can never compensate for that: spec v2.1 removed the bonus mechanic, so `B0` is `kind: "bonus"`
 * with an empty `pays` and `evaluateWins` only pays `kind === "regular"`. If a bonus feature returns,
 * give it real positions AND either lengthen the reels or reduce a pay symbol's certified count
 * deliberately — don't let it silently displace one.
 */
const BONUS_PROVISIONAL = [0, 0, 0, 0, 0];

/**
 * Build complete `positions[reel][]` per symbol: seed the known stops, then fill each reel's free
 * indices with its remaining symbols (round-robin so they spread out). Reel 1 has no free indices, so
 * it stays exactly as authored. Any count mismatch surfaces as a gap in `buildStrips` validation.
 */
function buildPositions(): Record<SymbolId, number[][]> {
  const out: Record<SymbolId, number[][]> = Object.fromEntries(
    SYMBOL_ORDER.map((id) => [id, REEL_LENGTHS.map(() => [] as number[])]),
  );

  for (let r = 0; r < REELS; r++) {
    const len = REEL_LENGTHS[r];
    const known = KNOWN[r];

    const used = new Set<number>();
    for (const id of SYMBOL_ORDER) {
      out[id][r] = [...(known[id] ?? [])];
      for (const p of known[id] ?? []) used.add(p);
    }

    const free: number[] = [];
    for (let i = 0; i < len; i++) if (!used.has(i)) free.push(i);
    if (free.length === 0) continue; // reel fully specified (reel 1)

    // Remaining counts to place across `free`.
    const remaining: Record<string, number> = {};
    for (const id of PAY_SYMBOLS) {
      remaining[id] = TOTALS[id][r] - (known[id]?.length ?? 0);
    }
    remaining.L3 -= BONUS_PROVISIONAL[r];
    remaining.B0 = BONUS_PROVISIONAL[r];

    // Round-robin sequence so symbols interleave rather than clump.
    const seq: SymbolId[] = [];
    const left = { ...remaining };
    let placed = true;
    while (placed) {
      placed = false;
      for (const id of SYMBOL_ORDER) {
        if ((left[id] ?? 0) > 0) {
          seq.push(id);
          left[id]--;
          placed = true;
        }
      }
    }

    for (let k = 0; k < free.length && k < seq.length; k++) {
      out[seq[k]][r].push(free[k]);
    }
    for (const id of SYMBOL_ORDER) out[id][r].sort((a, b) => a - b);
  }

  return out;
}

const POS = buildPositions();

const pays = (three: number, four: number, five: number) => ({
  "3": three,
  "4": four,
  "5": five,
});

const SYMBOLS: SymbolDef[] = [
  {
    id: "H1",
    kind: "regular",
    tier: "high",
    payRank: 1,
    pays: pays(100, 500, 2497),
    positions: POS.H1,
  },
  {
    id: "H2",
    kind: "regular",
    tier: "high",
    payRank: 2,
    pays: pays(61, 299, 1401),
    positions: POS.H2,
  },
  {
    id: "M1",
    kind: "regular",
    tier: "mid",
    payRank: 3,
    pays: pays(38, 180, 850),
    positions: POS.M1,
  },
  {
    id: "M2",
    kind: "regular",
    tier: "mid",
    payRank: 4,
    pays: pays(25, 120, 480),
    positions: POS.M2,
  },
  {
    id: "L1",
    kind: "regular",
    tier: "low",
    payRank: 5,
    pays: pays(12, 48, 190),
    positions: POS.L1,
  },
  {
    id: "L2",
    kind: "regular",
    tier: "low",
    payRank: 6,
    pays: pays(8, 28, 115),
    positions: POS.L2,
  },
  {
    id: "L3",
    kind: "regular",
    tier: "low",
    payRank: 7,
    pays: pays(5, 18, 70),
    positions: POS.L3,
  },
  // Bonus — kept in play, no line pay (spec v2.1 removed the bonus mechanic).
  {
    id: "B0",
    kind: "bonus",
    tier: "bonus",
    payRank: 8,
    pays: {},
    positions: POS.B0,
  },
];

// The 5 paylines for the 3×5 grid (0-based rows). Order matches the payline art frames: lines 1-3 are
// the straight rows (`line123`), line 4 the V (`line4`), line 5 the Λ (`line5`).
const LINES: number[][] = [
  [0, 0, 0, 0, 0], // line 1 — top row
  [1, 1, 1, 1, 1], // line 2 — middle row
  [2, 2, 2, 2, 2], // line 3 — bottom row
  [0, 1, 2, 1, 0], // line 4 — V  (down to the centre, back up)
  [2, 1, 0, 1, 2], // line 5 — Λ  (up to the centre, back down)
];

export const fortuneTellerMath: MathConfig = {
  gameId: GAME_ID,
  mathVersion: "2.1.0-client",
  indexBase: 0,
  grid: { reels: REELS, rows: ROWS },
  reelLengths: REEL_LENGTHS,
  lines: LINES,
  evaluation: { direction: "ltr", longestOnly: true, minMatch: 3 },
  denomination: { tokensPerUnit: 1000, currency: "PYG" },
  betLimits: {
    perLineTokens: { min: 1, max: 60 },
    totalBetTokens: { min: 20, max: 1200 },
  },
  exposure: { declaredMaxPerSpinXPerLine: 2675, regulatoryCapUnits: 25000 },
  rtp: { declared: 0.875, toleranceAbs: 0.001 },
  features: [],
  symbols: SYMBOLS,
  provisionalReels: [false, true, true, true, true],
};

export default fortuneTellerMath;
