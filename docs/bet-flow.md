# Bet flow — coins per line, coin value & total bet

How the betting math works in this project, where it lives, and how the UI stays consistent. The
model follows the **Fortune Teller Functional Spec v2.1 (PYG)**; that spec is the source of truth.

> This doc covers what the player **stakes**. For what the player **wins** — reels, symbol
> frequencies, paylines, win rules, the pay table and RTP — see
> [how-the-math-works.md](./how-the-math-works.md).
>
> **`BET_LINES` is 20 and stays 20** — that is the stake model, and every number below derives from it.
> Separately, only **5 of the 20 line patterns** are implemented in `math.ts` so far, so the engine
> evaluates 5 while the player pays for 20. Nothing in this doc changes when the other 15 land; see
> [how-the-math-works.md §10](./how-the-math-works.md#10-active-pay-lines-vs-implemented-patterns).

- **Store / formula:** [`src/store/useGameControlsStore.ts`](../src/store/useGameControlsStore.ts)
- **Money formatting:** [`src/utils/format.ts`](../src/utils/format.ts) (`formatGuarani`)
- **Bet settings UI (overlay):** [`src/components/ui/BettingScreen.tsx`](../src/components/ui/BettingScreen.tsx)
- **Spin-side +/- buttons:** [`src/components/ui/Controls.tsx`](../src/components/ui/Controls.tsx)
- **Footer display:** [`src/components/ui/Footer.tsx`](../src/components/ui/Footer.tsx)
- **Spin credit check + popup:** [`src/game/fortune-teller/GameScreen.tsx`](../src/game/fortune-teller/GameScreen.tsx) → [`src/navigation/PixiNavigation.tsx`](../src/navigation/PixiNavigation.tsx)

---

## 1. Units & the core formula

Everything internal is counted in **tokens** (betting credits). Money is only converted to Guaraní
(₲) for display.

| Symbol         | Meaning                                | Range (spec)              |
| -------------- | -------------------------------------- | ------------------------- |
| `DENOM_GS`     | ₲ per token — **1 token = ₲1.000**     | fixed                     |
| `BET_LINES`    | active pay lines (charged for)         | **20**                    |
| `coinsPerLine` | coins wagered on each line             | **1 … 10**                |
| `coinValue`    | value of one coin, in tokens           | **1 … 6** (`COIN_VALUES`) |
| `betPerLine`   | bet on a single line                   | derived → **1 … 60**      |
| `bet`          | total bet (what the player is staking) | derived → **20 … 1200**   |

```
betPerLine = coinValue × coinsPerLine            // tokens, 1..60
bet        = betPerLine × BET_LINES              // tokens, 20..1200   (= coinValue × coinsPerLine × 20)
displayGs  = tokens × DENOM_GS                    // ₲, e.g. 1200 → ₲1.200.000
```

Because `coinValue` maxes at 6 and `coinsPerLine` at 10, the per-line bet is **always** in `1..60`
and the total in `20..1200` — the min (₲20.000) and max (₲1.200.000) fall straight out of the
formula, so no separate clamping of the product is needed. `6 × 10 = 60`, `60 × 20 = 1200`. ✓

### Bounds (derived, not hand-typed)

```ts
MIN_BET = totalBetTokens(MIN_COIN_VALUE, MIN_COINS_PER_LINE); // 1 × 1 × 20  = 20   (₲20.000)
MAX_BET = totalBetTokens(MAX_COIN_VALUE, MAX_COINS_PER_LINE); // 6 × 10 × 20 = 1200 (₲1.200.000)
```

---

## 2. Canonical state vs. derived values

The store keeps **`coinValue` and `coinsPerLine` as the canonical state**. `bet` (the total) is
**derived** and recomputed after _every_ mutation via `totalBetTokens(coinValue, coinsPerLine)`.

This is the key invariant: the three numbers the player sees (Coins per line, Coin value, Total bet)
are all functions of the same two inputs, so **they can never disagree**. There is no separately
stored "total" that could drift out of sync.

Mutators that recompute `bet`:

| Action                                          | Effect                                                         |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `increaseCoinsPerLine` / `decreaseCoinsPerLine` | `coinsPerLine ± 1` (clamped 1..10), then `bet = cv × cpl × 20` |
| `increaseCoinValue` / `decreaseCoinValue`       | `coinValue ± 1` (clamped 1..6), then `bet = cv × cpl × 20`     |
| `betMax`                                        | `coinValue = 6`, `coinsPerLine = 10` → `bet = 1200`            |
| `increaseBet` / `decreaseBet`                   | walk the **ladder** (next section)                             |

---

## 3. The bet ladder (how Total-bet +/- works)

Coin value and coins-per-line each step by 1 within their own range — simple. But the **Total bet**
control (both the spin-side +/- buttons and the overlay's Total-bet stepper) needs to move up/down
across the _whole_ range while keeping `coinValue`/`coinsPerLine` consistent.

Not every total in `20..1200` is reachable (e.g. `betPerLine` of 11, 13, 17… have no `cv × cpl`
factorisation with `cv ≤ 6`, `cpl ≤ 10`). So the store precomputes **`BET_LADDER`**: every reachable
total, sorted ascending, each carrying a canonical `(coinValue, coinsPerLine)` pair. When more than
one pair yields the same total, the one with the **larger coins-per-line** (lower coin value) wins.

```ts
BET_LADDER: {
  (total, coinValue, coinsPerLine);
}
[]; // 32 steps, ascending
```

`increaseBet()` finds the current total's index (`ladderIndex`, with a nearest-step fallback) and
moves to `index + 1`; `decreaseBet()` moves to `index - 1`. Each step sets `bet`, `coinValue` **and**
`coinsPerLine` together — so nudging the total from the footer keeps the overlay's coin steppers
correct, and vice-versa.

### The full ladder (32 steps)

| #   | Total (₲)  | Total (tok) | Coin value | Coins/line | Bet/line |
| --- | ---------- | ----------- | ---------- | ---------- | -------- |
| 0   | ₲20.000    | 20          | 1          | 1          | 1        |
| 1   | ₲40.000    | 40          | 1          | 2          | 2        |
| 2   | ₲60.000    | 60          | 1          | 3          | 3        |
| 3   | ₲80.000    | 80          | 1          | 4          | 4        |
| 4   | ₲100.000   | 100         | 1          | 5          | 5        |
| 5   | ₲120.000   | 120         | 1          | 6          | 6        |
| 6   | ₲140.000   | 140         | 1          | 7          | 7        |
| 7   | ₲160.000   | 160         | 1          | 8          | 8        |
| 8   | ₲180.000   | 180         | 1          | 9          | 9        |
| 9   | ₲200.000   | 200         | 1          | 10         | 10       |
| 10  | ₲240.000   | 240         | 2          | 6          | 12       |
| 11  | ₲280.000   | 280         | 2          | 7          | 14       |
| 12  | ₲300.000   | 300         | 3          | 5          | 15       |
| 13  | ₲320.000   | 320         | 2          | 8          | 16       |
| 14  | ₲360.000   | 360         | 2          | 9          | 18       |
| 15  | ₲400.000   | 400         | 2          | 10         | 20       |
| 16  | ₲420.000   | 420         | 3          | 7          | 21       |
| 17  | ₲480.000   | 480         | 3          | 8          | 24       |
| 18  | ₲500.000   | 500         | 5          | 5          | 25       |
| 19  | ₲540.000   | 540         | 3          | 9          | 27       |
| 20  | ₲560.000   | 560         | 4          | 7          | 28       |
| 21  | ₲600.000   | 600         | 3          | 10         | 30       |
| 22  | ₲640.000   | 640         | 4          | 8          | 32       |
| 23  | ₲700.000   | 700         | 5          | 7          | 35       |
| 24  | ₲720.000   | 720         | 4          | 9          | 36       |
| 25  | ₲800.000   | 800         | 4          | 10         | 40       |
| 26  | ₲840.000   | 840         | 6          | 7          | 42       |
| 27  | ₲900.000   | 900         | 5          | 9          | 45       |
| 28  | ₲960.000   | 960         | 6          | 8          | 48       |
| 29  | ₲1.000.000 | 1000        | 5          | 10         | 50       |
| 30  | ₲1.080.000 | 1080        | 6          | 9          | 54       |
| 31  | ₲1.200.000 | 1200        | 6          | 10         | 60       |

> Note: the ladder is generated from the formula at module load — the table above is a snapshot for
> reference. If `COIN_VALUES` / `MAX_COINS_PER_LINE` / `BET_LINES` change, the ladder changes with
> them; do not hard-code these values elsewhere.

---

## 4. Which control does what

| Control                                      | Calls                                           | Behaviour                                                                         |
| -------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| **+/- next to the spin button** (`Controls`) | `increaseBet()` / `decreaseBet()`               | Walk the ladder; **show a "BET INCREASED / REDUCED" toast**. Disabled at min/max. |
| **Total bet** stepper (overlay)              | `increaseBet(true)` / `decreaseBet(true)`       | Walk the ladder **silently** (no toast). Disabled at min/max.                     |
| **Coins per line** stepper (overlay)         | `increaseCoinsPerLine` / `decreaseCoinsPerLine` | `± 1`, recompute total. Disabled at 1 / 10.                                       |
| **Coin value** stepper (overlay)             | `increaseCoinValue` / `decreaseCoinValue`       | `± 1`, recompute total. Disabled at 1 / 6.                                        |
| **BET MAX** (overlay footer)                 | `betMax`                                        | Jump to ₲1.200.000.                                                               |

The `silent` flag on `increaseBet` / `decreaseBet` is why the toast appears only for the spin-side
buttons and not when editing the Total bet inside the bet-settings overlay.

---

## 5. Display formatting

All money is rendered by **`formatGuarani(tokens)`** — it multiplies by `DENOM_GS` and formats with a
`.` thousands separator (Paraguayan convention), e.g. `1200 → "₲1.200.000"`. Used by the footer
(Balance + Total Bet), the overlay steppers (Coin value + Total bet), and the bet toasts.

`formatMoney(amount)` still exists for already-Guaraní amounts (no `×1000`); prefer `formatGuarani`
for anything counted in tokens.

---

## 6. Spin → credit check → popup

Per spec §6 Step 1, the bet is validated **before** anything else. In `GameScreen`:

```ts
const onSpin = () => {
  if (balance < totalBet) {
    // both in tokens
    showOverlay("repeat-insufficient"); // blocking popup
    return;
  }
  // funded → proceed (real reel/spin flow not built yet)
};
```

- `balance` is currently a **token placeholder** (`100000`) in `GameScreen`, pending real server
  state via React Query (`CLAUDE.md`: React Query owns balance; do not mirror it into Zustand).
- The **insufficient-credit popup** is the `repeat-insufficient` overlay in `PixiNavigation`, using
  the shared `PopupModal`. It blocks input until the player acknowledges.
- The separate `balance` overlay remains available for a true zero-balance state.

---

## 7. Worked examples

| Coins/line | Coin value | Bet/line (tok) | Total (tok) | Displayed  |
| ---------: | ---------: | -------------: | ----------: | ---------- |
|          1 |          1 |              1 |          20 | ₲20.000    |
|          5 |          1 |              5 |         100 | ₲100.000   |
|         10 |          2 |             20 |         400 | ₲400.000   |
|          8 |          6 |             48 |         960 | ₲960.000   |
|         10 |          6 |             60 |        1200 | ₲1.200.000 |

---

## 8. Changing the model later

Because everything derives from three constants, adjusting limits is a one-line change in
`useGameControlsStore.ts` — the ladder, bounds, UI clamps and displays all follow:

- Denomination: `DENOM_GS`
- Pay lines: `BET_LINES`
- Coins per line: `MIN_COINS_PER_LINE` / `MAX_COINS_PER_LINE`
- Coin values: the `COIN_VALUES` array

Do **not** re-hardcode `MIN_BET` / `MAX_BET` or ladder values in components — always import them from
the store so a spec change stays consistent everywhere.
