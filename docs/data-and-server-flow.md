# Data & server flow — config, spins, balance

How server data flows into the game today (local mock) and how it will flow once the backend exists.
Companion to [bet-flow.md](./bet-flow.md) (bet math) and [asset-pipeline.md](./asset-pipeline.md).

## The one rule: where state lives

| State | Owner | Why |
|---|---|---|
| Math config (symbols, reels, pays, lines) | **React Query** (`useMathConfig`) | Server-owned, **read-only** on the client. |
| Spin result (stops, grid, wins) | **React Query** mutation (`useSpin`) → then **`useRoundStore`** | Fetched via RQ; the *latest* result is mirrored into Zustand so any component can read it without prop-drilling. |
| Player balance | fetched via **React Query** (`useBalance`) → held in **`useWalletStore`** | Balance is **mutated live** on the client (deduct/credit per spin), so it lives in a store, not the RQ cache. |
| Bet / speed / autoplay / coin settings | **Zustand** (`useGameControlsStore`) | Pure UI/game state. |
| Reel animation target (`finalStops`, `spinId`) | local state in **`useReelSpin`** | Ephemeral render state for the animation only. The reels scroll the REAL per-reel strips (`buildStrips(config)`, built once in `GameScreen` and shared with `useSpin`) and land with `stops[reel]` in the top row, so the visible window equals `result.grid` by construction. |

> **Deliberate deviation:** `src/api/queryClient.ts` says "don't mirror server data into Zustand." We
> do mirror **balance** (and the last spin result) into Zustand *on purpose*, because the balance is
> updated live client-side as the player spins. Read-only server data (config) stays in RQ. This is
> the "Hybrid" model: **React Query = fetch/transport; Zustand = live client state hydrated from it.**

## Current flow (local mock)

```
                     React Query (fetch/transport)              Zustand (live client state)
  ┌───────────────┐   useMathConfig ── getMathConfig ─────────► (RQ cache, read-only)
  │  local engine │   useBalance ──── fetchBalance ──────────► useWalletStore.setBalance()  (hydrate once)
  │ math/engine.ts│   useSpin ─────── engine.spin(cfg,req) ──► SpinResult
  └───────────────┘                                             │
                                                                ├─ onCommit  → wallet.deduct(totalBet)
                                                                ├─ (reels scroll & settle)
                                                                └─ onSettle  → wallet.credit(totalWin)
                                                                             → useRoundStore.setResult()
  Footer.Balance ◄── useWalletStore.balance      GameState ◄── useRoundStore.lastResult (+ isSpinning)
```

Files:
- **Fetch seams** — [src/api/useMathConfig.ts](../src/api/useMathConfig.ts),
  [src/api/useSpin.ts](../src/api/useSpin.ts), [src/api/useBalance.ts](../src/api/useBalance.ts).
  Each has a `SWAP LATER` comment marking the exact one-line change to a real `fetch()`.
- **Engine** — [src/game/math/engine.ts](../src/game/math/engine.ts) turns a `MathConfig` into a
  `SpinResult` (the shape the server will return). See [bet-flow.md](./bet-flow.md) + the math config
  [src/game/fortune-teller/math.ts](../src/game/fortune-teller/math.ts).
- **Stores** — [src/store/useWalletStore.ts](../src/store/useWalletStore.ts) (balance),
  [src/store/useRoundStore.ts](../src/store/useRoundStore.ts) (last result).
- **Orchestration** — [src/game/useReelSpin.ts](../src/game/useReelSpin.ts) exposes `onCommit` /
  `onSettle` / `onAbort` lifecycle hooks; the money logic is wired in
  [src/game/fortune-teller/GameScreen.tsx](../src/game/fortune-teller/GameScreen.tsx).

## Balance lifecycle

1. **Hydrate** — `useBalance()` resolves the server balance (mock `5000` tokens = ₲5.000.000);
   `GameScreen` seeds `useWalletStore` once (`hydrated` guard).
2. **Deduct** — on spin start, `onCommit(totalBet)` → `wallet.deduct` (spec §6 step 1: stake removed
   before the result). The pre-spin credit check (`balance < bet`) uses this live value and opens the
   **INSUFFICIENT CREDIT** popup / stops autoplay when short.
3. **Credit** — when the reels settle, `onSettle(result)` → `wallet.credit(result.totalWinTokens)` and
   `useRoundStore.setResult(result)`. The footer balance and the GameState win line update from the
   stores.
4. **Refund** — if the spin request throws, `onAbort(totalBet)` refunds the stake.

Everything is in **tokens**; the footer/GameState render via `formatGuarani` (× ₲1.000).

> For *how the math itself works* — reels, symbol frequencies, paylines, win rules, the pay table and
> RTP, explained from scratch — see [how-the-math-works.md](./how-the-math-works.md).

## Future TODO

- [ ] **Wire the real API** — replace the three `SWAP LATER` stubs (`fetchMathConfig`, `fetchBalance`,
      `useSpin.mutationFn`) with `fetch()` calls. Nothing downstream should change.
- [ ] **Server-authoritative balance** — have the spin response carry `balanceAfter`; call
      `wallet.setBalance(balanceAfter)` on settle to reconcile against the optimistic deduct/credit
      (and drop client-side drift). Deduct/credit stays only as the optimistic in-flight display.
- [ ] **Loading / error / failure UX** — show a loading state until config + balance resolve; surface
      spin request failures (retry / toast) instead of a silent refund.
- [x] **Win presentation** — `PaylineOverlay` (rendered by `ReelFrame` via its `paylines` prop) draws
      the `payline` atlas art across the grid for each line in `useRoundStore.lastResult.wins`,
      pulsing alpha twice over ~5s then hiding. The art frame is picked from the line's full row
      pattern (`config.lines[lineId]`, **not** `WinLine.rows` — that's only a `slice(0, count)`
      prefix). Still open: no highlight behind the winning symbols (no art for it), and in autoplay
      `AUTOPLAY_GAP` (120–350ms) cuts the pulse short — a win hold would need a product decision.
- [ ] **The remaining 15 line patterns** — `BET_LINES = 20` is the stake model and stays 20, but `LINES`
      in `math.ts` only has 5 of the 20 patterns, so the stake is split 20 ways while 5 can pay. Effective
      RTP is therefore ~21.9% instead of the declared 87.5% **until the certified list lands** — adding it
      restores 87.5% with no change to the betting model. Two notes: the payline ART only covers 3 shapes
      (straight row, V, Λ), so new shapes need new frames or `resolveArt` skips them; and the game is not
      ready for real players until `config.lines.length === BET_LINES`.
- [ ] **Certified reel data** — replace the PROVISIONAL reel fill (reels 2–5) with the signed CSV. The
      per-reel symbol counts currently match the FSD `TOTALS` exactly; keep it that way (see `math.ts`).
- [ ] **Server RNG + integrity** — real CSPRNG server-side; idempotent spin / disconnection replay
      (spec §8), so a re-requested spin returns the same persisted result and never double-charges.
- [ ] **Multi-game** — one wallet is shared, but math config / round result are per game id; confirm
      store reset/scoping when switching games.
