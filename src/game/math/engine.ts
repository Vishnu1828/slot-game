import type {
  MathConfig,
  SpinRequest,
  SpinResult,
  SymbolId,
  WinLine,
} from "./types";

/**
 * Local slot engine — the client-side stand-in for the game server. It turns a `MathConfig` into the
 * same `SpinResult` shape the backend will return, so nothing downstream changes when the API is
 * wired (see `src/api/useSpin.ts`).
 */

/**
 * Invert each symbol's `positions` into per-reel strips (`strip[reel][stopIndex] = symbolId`), and
 * validate that every reel is an exact, gap-free partition of `[0, reelLength)`. Throws on any gap or
 * double-assignment; warns for reels flagged provisional (not yet certified).
 */
export function buildStrips(cfg: MathConfig): SymbolId[][] {
  const { reelLengths, symbols, provisionalReels, gameId } = cfg;
  const strips: SymbolId[][] = reelLengths.map((len) =>
    new Array<SymbolId>(len).fill(""),
  );
  const filled = reelLengths.map((len) => new Array<boolean>(len).fill(false));

  for (const sym of symbols) {
    sym.positions.forEach((stops, r) => {
      for (const idx of stops) {
        if (idx < 0 || idx >= reelLengths[r]) {
          throw new Error(
            `[math ${gameId}] reel ${r}: stop ${idx} out of range [0,${reelLengths[r]})`,
          );
        }
        if (filled[r][idx]) {
          throw new Error(
            `[math ${gameId}] reel ${r}: stop ${idx} assigned to more than one symbol`,
          );
        }
        strips[r][idx] = sym.id;
        filled[r][idx] = true;
      }
    });
  }

  filled.forEach((col, r) => {
    const gaps = col.filter((f) => !f).length;
    if (gaps > 0) {
      throw new Error(`[math ${gameId}] reel ${r}: ${gaps} unassigned stop(s)`);
    }
  });

  warnProvisional(gameId, provisionalReels);
  return strips;
}

/** Configs already warned about, so a remount / StrictMode's double render doesn't repeat it. */
const warnedProvisional = new Set<string>();

/**
 * Say ONCE, per config, which reels are still running uncertified strips.
 *
 * Worth keeping — shipping provisional math is a real problem — but it has to stay readable to be
 * worth anything: one line per reel per build, doubled by StrictMode, is how a warning becomes
 * wallpaper you scroll past. One line naming all of them says the same thing and stays visible.
 */
function warnProvisional(gameId: string, provisionalReels: boolean[]): void {
  const reels = provisionalReels.flatMap((p, r) => (p ? [r] : []));
  if (!reels.length) return;
  const key = `${gameId}:${reels.join(",")}`;
  if (warnedProvisional.has(key)) return;
  warnedProvisional.add(key);
  console.warn(
    `[math ${gameId}] reel ${reels.join(", ")} strip${reels.length > 1 ? "s are" : " is"} PROVISIONAL — replace with the certified data.`,
  );
}

const randInt = (n: number) => Math.floor(Math.random() * n);

/**
 * Produce one spin: RNG a stop per reel, read the 3-row window (`grid[row][reel] =
 * strip[reel][(stop + row) mod len]`), then evaluate wins. Pass prebuilt `strips` to avoid rebuilding.
 */
export function spin(
  cfg: MathConfig,
  req: SpinRequest,
  strips: SymbolId[][] = buildStrips(cfg),
): SpinResult {
  const { reels, rows } = cfg.grid;
  const stops = Array.from({ length: reels }, (_, r) =>
    randInt(cfg.reelLengths[r]),
  );
  const grid: SymbolId[][] = Array.from({ length: rows }, (_, row) =>
    Array.from(
      { length: reels },
      (_, r) => strips[r][(stops[r] + row) % cfg.reelLengths[r]],
    ),
  );
  const wins = evaluateWins(cfg, grid, req.betPerLineTokens);
  const totalWinTokens = wins.reduce((sum, w) => sum + w.amountTokens, 0);
  return { stops, grid, wins, totalWinTokens };
}

/**
 * Evaluate all paylines: left→right from reel 0, take the longest run of the same REGULAR symbol; if
 * it reaches `minMatch`, pay `pays[count] × betPerLine`. (Fortune Teller has no wilds/scatters.)
 */
export function evaluateWins(
  cfg: MathConfig,
  grid: SymbolId[][],
  betPerLineTokens: number,
): WinLine[] {
  const { reels } = cfg.grid;
  const byId = new Map(cfg.symbols.map((s) => [s.id, s]));
  const wins: WinLine[] = [];

  cfg.lines.forEach((line, lineId) => {
    const first = grid[line[0]]?.[0];
    const def = first ? byId.get(first) : undefined;
    if (!def || def.kind !== "regular") return;

    let count = 1;
    for (let r = 1; r < reels; r++) {
      if (grid[line[r]]?.[r] === first) count++;
      else break;
    }
    if (count < cfg.evaluation.minMatch) return;

    const mult = def.pays[String(count)];
    if (!mult) return;

    wins.push({
      lineId,
      symbolId: first,
      count,
      rows: line.slice(0, count),
      amountTokens: mult * betPerLineTokens,
    });
  });

  return wins;
}
