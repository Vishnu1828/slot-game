# How the slot machine works — the math, in plain language

This explains how Fortune Teller decides what symbols to show and how much a spin pays. It starts
from zero, so **no programming or gambling-industry knowledge is needed**. Numbers in this doc were
computed from the actual game data, not estimated.

One thing to get straight early: the game charges for **20 active pay lines**, but only **5 line
patterns** are implemented so far. Those are two different numbers —
[§10](#10-active-pay-lines-vs-implemented-patterns) explains what that means and why it resolves itself.

**Where the data lives:** [`src/game/fortune-teller/math.ts`](../src/game/fortune-teller/math.ts) —
symbols, reels and pay table. **Where the logic lives:**
[`src/game/math/engine.ts`](../src/game/math/engine.ts) — spin and win evaluation. Money handling is a
separate topic, covered in [bet-flow.md](./bet-flow.md).

---

## 1. The mental model: five lists of symbols

Forget spinning wheels for a moment. Inside the game, **each reel is simply a list of slots, and every
slot holds one symbol.** Like five separate decks of cards laid out in a row.

The five lists have different lengths:

| Reel                | 1   | 2   | 3   | 4   | 5   |
| ------------------- | --- | --- | --- | --- | --- |
| **Number of slots** | 50  | 55  | 60  | 55  | 55  |

Reel 1 might begin like this (these are its real first six slots):

```
slot:    0       1       2        3       4        5
       Keys   Cards  Potion   Cards  Candle   Tome  ...  (50 slots total)
```

**To spin, the game picks one random slot number per reel, then shows that slot and the next two.**
That's it. That's the whole spinning mechanism.

So if reel 1 picks slot 3, the player sees slots 3, 4 and 5 — Cards, Candle, Tome — stacked in that
column. Five reels × 3 visible slots = the **3-row by 5-column grid** the player looks at.

> Picking "the next two" wraps around the end of the list, so the last slot is followed by the first.
> The list behaves like a loop — which is exactly what a physical reel is.

Because each reel is picked independently, the number of different spin results is:

```
50 × 55 × 60 × 55 × 55  =  499,125,000 possible outcomes
```

Everything below — every probability, the entire return percentage — is just arithmetic over those
499 million outcomes.

---

## 2. The eight symbols

Seven symbols pay money. They're grouped into tiers: rarer symbols pay more.

| Tier | Symbol         | Code | Rough character             |
| ---- | -------------- | ---- | --------------------------- |
| High | Fortune Teller | `H1` | rarest, biggest prize       |
| High | Crystals       | `H2` |                             |
| Mid  | Tome (book)    | `M1` |                             |
| Mid  | Potion         | `M2` |                             |
| Low  | Tarot cards    | `L1` |                             |
| Low  | Keys           | `L2` |                             |
| Low  | Candle         | `L3` | most common, smallest prize |

There is also a **Bonus** symbol (`B0`, the crystal ball). It pays nothing and currently appears on no
reel at all — see [§9](#9-the-bonus-symbol-and-why-it-appears-nowhere).

### How often each symbol appears

This is the heart of the design. Rarity is controlled purely by **how many slots each symbol occupies**.
On reel 1 (50 slots):

| Symbol         | Slots on reel 1 | Chance of landing in a given position |
| -------------- | --------------- | ------------------------------------- |
| Fortune Teller | 2               | 4%                                    |
| Crystals       | 3               | 6%                                    |
| Tome           | 4               | 8%                                    |
| Potion         | 5               | 10%                                   |
| Tarot cards    | 9               | 18%                                   |
| Keys           | 11              | 22%                                   |
| Candle         | **16**          | **32%**                               |
|                | **50 total**    | **100%**                              |

So nearly a third of reel 1 is candles, and only 2 slots in 50 are the Fortune Teller. That single
table is what makes the game feel the way it feels.

The other reels use the same idea with their own counts (all listed in `TOTALS` in `math.ts`). The
candle, for example:

|              | Reel 1  | Reel 2  | Reel 3  | Reel 4  | Reel 5    |
| ------------ | ------- | ------- | ------- | ------- | --------- |
| Candle slots | 16 / 50 | 17 / 55 | 19 / 60 | 17 / 55 | 19 / 55   |
| Chance       | 32.0%   | 30.9%   | 31.7%   | 30.9%   | **34.5%** |

---

## 3. Where the reel data comes from

Two ingredients, both in `math.ts`:

**`KNOWN`** — exact slot positions. For **reel 1** all 50 slots are listed; this is the certified strip
from the spec, used as-is. For **reels 2–5** only the first 20 slots are published.

**`TOTALS`** — how many of each symbol each reel must contain in total.

The code fills in reels 2–5's unlisted slots to satisfy `TOTALS`. This is not guesswork, because the
totals add up to exactly the reel length. Reel 2:

```
Fortune Teller 2 + Crystals 3 + Tome 5 + Potion 6 + Cards 10 + Keys 12 + Candle 17  =  55
                                                                       reel 2 length =  55
```

Your first 20 slots already place 20 of those. What remains is:

```
symbols still to place:  1 + 0 + 4 + 4 + 6 + 8 + 12  =  35
empty slots (20…54):                                     35
```

**35 symbols into 35 slots — a perfect fit, with nothing left over.** The only freedom is the _order_
they're placed in, and the code spreads them round-robin so they don't clump. The _counts_ — which is
all that affects the odds — are fully determined by your own totals.

> **Important consequence:** there is no spare slot anywhere. Adding any new symbol to a reel means
> taking a slot away from a paying symbol, which changes the payout percentage. This is what went wrong
> with the bonus ([§9](#9-the-bonus-symbol-and-why-it-appears-nowhere)).

When the signed data arrives, replace `KNOWN`/`TOTALS` and nothing else changes.

---

## 4. Paylines — the shapes that can win

A win isn't "three candles anywhere". The symbols have to sit on one of a fixed set of **paths across
the grid**, called paylines. Each payline picks exactly one row from each of the five columns.

The game is played on **20 active pay lines**, but only **5 of those patterns are built so far**
(the rest are pending the certified list — see [§10](#10-active-pay-lines-vs-implemented-patterns)).
These are the 5. Rows are numbered 0 (top), 1 (middle), 2 (bottom):

| Line | Path            | Shape                                        |
| ---- | --------------- | -------------------------------------------- |
| 1    | `0, 0, 0, 0, 0` | straight across the top                      |
| 2    | `1, 1, 1, 1, 1` | straight across the middle                   |
| 3    | `2, 2, 2, 2, 2` | straight across the bottom                   |
| 4    | `0, 1, 2, 1, 0` | a **V** — down to the bottom middle, back up |
| 5    | `2, 1, 0, 1, 2` | a **Λ** — up to the top middle, back down    |

Drawn on the grid, line 4 looks like this (`●` = the cells this line checks):

```
        reel1  reel2  reel3  reel4  reel5
row 0     ●      ·      ·      ·      ●
row 1     ·      ●      ·      ●      ·
row 2     ·      ·      ●      ·      ·
```

**Every payline is bet on, on every spin.** The player doesn't choose lines. Each built pattern is
checked independently, and a single spin can win on several at once.

When a line wins, the game draws that glowing line over the reels — the art is picked from the line's
shape (straight / V / Λ). See [data-and-server-flow.md](./data-and-server-flow.md).

---

## 5. How a win is decided

Four rules, applied to each payline separately:

1. **Start at reel 1 and go right.** A run must begin on the leftmost reel. Three candles on reels
   2, 3 and 4 pay **nothing** — reel 1 has to be part of it.
2. **Count how far the same symbol continues.** Stop at the first reel that doesn't match.
3. **You need at least 3.** Runs of 1 or 2 pay nothing.
4. **Only the longest run counts.** One line pays once, for its best run — never twice.

### Worked example

Here is a grid the engine really produced (from stops `21, 52, 59, 23, 39`):

```
row 0    Keys     Candle   Candle   Potion   Keys
row 1 →  Candle   Candle   Candle   Cards    Candle   ← line 2 looks at this row
row 2    Potion   Candle   Keys     Keys     Cards
```

Checking **line 2** (the middle row), walking left to right: Candle, Candle, Candle, then
**Cards — stop.**

That's a run of **3 candles**, paying **5× the line bet**.

Two things to notice:

- **The candle on reel 5 is ignored entirely.** The run was already broken at reel 4, so it counts for
  nothing. This is the rule people find most surprising, and it's a big part of why the payout
  percentage isn't higher.
- **No other line wins**, even though there are 7 candles on screen. Line 1 (top row) starts with Keys;
  line 3 (bottom) starts with Potion; both V lines start with Keys or Potion too. Rule 1 — must start on
  reel 1 — eliminates all of them.

That's the whole evaluation. It runs once per payline, and the results are added together.

---

## 6. The pay table

Multipliers of the **line bet** (not the total bet — that distinction is in [§7](#7-how-money-is-counted)):

| Symbol         | 3 in a row | 4 in a row | 5 in a row |
| -------------- | ---------- | ---------- | ---------- |
| Fortune Teller | 100×       | 500×       | **2497×**  |
| Crystals       | 61×        | 299×       | 1401×      |
| Tome           | 38×        | 180×       | 850×       |
| Potion         | 25×        | 120×       | 480×       |
| Tarot cards    | 12×        | 48×        | 190×       |
| Keys           | 8×         | 28×        | 115×       |
| Candle         | 5×         | 18×        | 70×        |

The pattern: rarer symbol → bigger multiplier, and each extra matching reel raises the prize steeply.
Five Fortune Tellers is the top prize at 2497×.

---

## 7. How money is counted

Internally the game counts **tokens**, never Guaraní. **1 token = ₲1.000.** Guaraní is only for display.

The player sets two things (via the bet buttons):

```
coin value      1 … 6   tokens
coins per line  1 … 10

line bet   = coin value × coins per line          →  1 … 60 tokens
total bet  = line bet × 20 active pay lines       →  20 … 1200 tokens (₲20.000 … ₲1.200.000)
```

**Wins are multiples of the line bet, not the total bet.** So with a line bet of 2 tokens, three
candles (5×) pays 10 tokens = ₲10.000. If two lines win, the payouts add up.

Full detail — the bet ladder, the +/- buttons, rounding — is in [bet-flow.md](./bet-flow.md).

---

## 8. The odds, and where the 87.5% comes from

### How likely is a win?

| Event                                          | Chance                                 |
| ---------------------------------------------- | -------------------------------------- |
| One particular payline wins                    | **5.04%**                              |
| A spin wins on **at least one** of the 5 built patterns | **22.44%** — roughly **1 spin in 4.5** |
| Three candles on a line (the most common win)  | 2.16%                                  |
| Four candles on a line                         | 1 in 158                               |
| Five candles on a line                         | 1 in 299                               |
| **Five Fortune Tellers on a line**             | **1 in 15,597,656**                    |

The per-line figures are properties of the reels and the pay table, so they don't change as more line
patterns are added. Only the "at least one" row does: with all 20 patterns built, more spins produce a
win. Everything else in this section stays exactly as listed.

The three-candle figure is just multiplication — the per-reel chances from [§2](#how-often-each-symbol-appears):

```
reel1 32.0%  ×  reel2 30.9%  ×  reel3 31.7%  ×  reel4 must NOT be a candle (69.1%)
= 2.16%
```

That last term is rule 4 from [§5](#5-how-a-win-is-decided) at work: for the run to be _exactly_ three,
reel 4 has to break it.

### Return to Player (RTP)

**RTP is the share of all money staked that comes back to players as winnings, over a very long time.**
An RTP of 87.5% means that across millions of spins, ₲87.500 is paid out for every ₲100.000 staked. It
says nothing about a single spin or a single session — that's where luck lives.

RTP is calculated, not measured: for every symbol and every run length, multiply _how likely it is_ by
_what it pays_, then add everything up.

| Symbol         | Chance per line | Its share of RTP  |
| -------------- | --------------- | ----------------- |
| Candle         | 3.132%          | **45.64%**        |
| Keys           | 1.120%          | 18.49%            |
| Tarot cards    | 0.600%          | 13.94%            |
| Potion         | 0.109%          | 4.25%             |
| Tome           | 0.061%          | 3.35%             |
| Crystals       | 0.016%          | 1.26%             |
| Fortune Teller | 0.005%          | 0.57%             |
|                |                 | **87.500% total** |

This lands on **exactly** the 87.5% the spec declares. That's not a coincidence and it's a useful
health check: the pay table was designed against these precise slot counts, so **if the counts drift,
this number stops matching, and something is wrong.**

Notice the shape of that table: the common, cheap candle delivers nearly **half** of everything paid
out, while the Fortune Teller — the exciting one — contributes barely half a percent. Slots pay
players mostly in small frequent wins; the top prize is advertising.

---

## 9. The bonus symbol, and why it appears nowhere

The `B0` crystal ball is defined in the code but sits on **zero slots**, so it can never be drawn.
That's deliberate.

Spec v2.1 removed the bonus feature. `B0` has an empty pay table and the win engine only pays symbols
marked "regular", so it can never win anything. Meanwhile [§3](#3-where-the-reel-data-comes-from)
showed there are no spare slots — so putting a bonus on a reel means **taking a slot from a paying
symbol**.

That's what used to happen. A setting placed one bonus on each of reels 2–5, each taking a slot from
the candle. The damage:

|                         | With the bonus    | Without it (now)                         |
| ----------------------- | ----------------- | ---------------------------------------- |
| Candle slots, reels 2–5 | 16 / 18 / 16 / 18 | **17 / 19 / 17 / 19** ✅ match certified |
| RTP                     | **80.1%** ❌      | **87.5%** ✅ matches declared            |

A bonus ball landing mid-line **breaks the run** — it could turn five candles into two. It cost 7.4
percentage points of RTP and gave nothing back. Hence `BONUS_PROVISIONAL = [0, 0, 0, 0, 0]`.

**If a bonus feature ever returns**, it needs real positions _and_ either longer reels or a deliberate
reduction in some paying symbol's count — decided on purpose, not absorbed silently.

---

## 10. Active pay lines vs. implemented patterns

Two different numbers are easy to confuse, so this section separates them.

| | Number | Meaning | Where |
|---|---|---|---|
| **Active pay lines** | **20** | What the player is **charged for**. Fixed by the spec, and the reason the total bet is `line bet × 20` (₲20.000–₲1.200.000). | `BET_LINES` in [`useGameControlsStore.ts`](../src/store/useGameControlsStore.ts) |
| **Implemented patterns** | **5** | The line **shapes** the engine can currently check — the 3 straight rows plus the V and Λ from [§4](#4-paylines--the-shapes-that-can-win). | `LINES` in [`math.ts`](../src/game/fortune-teller/math.ts) |

Active pay lines stays at 20. The 5 is temporary: the remaining 15 certified patterns simply haven't
been added yet.

### What that means while it's 5

The stake is divided across 20 lines, but only 5 shapes can pay:

```
staked per spin      = line bet × 20
expected return      = line bet × 0.875 × 5 patterns   = line bet × 4.375

return to player     = 4.375 / 20  =  21.9%     (during development)
```

So the payout percentage is temporarily about a quarter of the declared 87.5%. **This is a development
state, not a math error** — the reel data, pay table and per-line RTP are all correct and verified
([§8](#8-the-odds-and-where-the-875-comes-from)). Nothing needs fixing in the betting model.

### It resolves itself

Adding the remaining 15 patterns to `LINES` restores the full **87.5%** automatically:

```
20 patterns × 0.875 × line bet  ÷  (line bet × 20)  =  87.5%   ✓
```

No change to `BET_LINES`, the bet ladder, the bet range or the reel data. Two things to keep in mind
when those lines arrive:

- **Artwork.** The payline art only covers three shapes — a straight bar, a V and a Λ. Any new shape
  needs new art, or it silently draws no line (the win still pays; see `resolveArt` in
  `PaylineOverlay.tsx`).
- **Sanity check.** Once `LINES` has 20 entries, `MathConfig.lines.length` should equal `BET_LINES`.
  Until it does, treat the game as not ready for real players.

---

## 11. Quick reference for developers

| What                                       | Where                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Symbols, pay table, reel data, paylines    | [`src/game/fortune-teller/math.ts`](../src/game/fortune-teller/math.ts)                         |
| Turn positions into reel strips + validate | `buildStrips` in [`engine.ts`](../src/game/math/engine.ts)                                      |
| Pick stops, read the grid                  | `spin` in [`engine.ts`](../src/game/math/engine.ts)                                             |
| Apply the 4 win rules                      | `evaluateWins` in [`engine.ts`](../src/game/math/engine.ts)                                     |
| Shared data shapes                         | [`src/game/math/types.ts`](../src/game/math/types.ts)                                           |
| Bet/coin/total-bet model                   | [`useGameControlsStore.ts`](../src/store/useGameControlsStore.ts), [bet-flow.md](./bet-flow.md) |
| Result → reels → win display               | [data-and-server-flow.md](./data-and-server-flow.md)                                            |

A few things worth knowing before changing any of it:

- **`buildStrips` is a safety net.** It refuses to build if a reel has an unassigned slot or a slot
  claimed by two symbols. A bad `TOTALS` edit fails loudly instead of quietly shifting the RTP.
- **Reels 2–5 print a "PROVISIONAL" warning** in the console. That's expected until the signed data
  lands; reel 1 is already certified and silent.
- **`grid` is row-major:** `grid[row][reel]`, not `grid[reel][row]`.
- **`WinLine.rows` is a partial list.** It's `line.slice(0, count)`, so a 3-symbol win on line 4 carries
  `[0, 1, 2]`, not the full `[0, 1, 2, 1, 0]`. To identify a line's _shape_, read
  `config.lines[lineId]` instead.
- **`SpinResult.stops`** is the chosen slot number per reel. The reels scroll their real strips and land
  on it, which is why what the player sees always matches what the engine paid.
- **The engine is a stand-in for the server.** It produces exactly the response shape the backend will
  return, so this math moves server-side later without changing anything downstream. Real money play
  requires a server-side RNG; the browser's `Math.random` is not suitable.

---

## Summary in six lines

1. Each reel is a fixed list of slots (50/55/60/55/55); a spin picks one random slot per reel and shows 3.
2. Rarity is set by how many slots a symbol occupies — the candle has ~1 in 3, the Fortune Teller 2 in 50.
3. Wins must start on reel 1, run left to right, and be at least 3 long.
4. Pay lines are fixed paths across the grid; every one is bet on each spin, and one spin can win several.
5. Per line, the math returns **87.5%** — exactly as declared, with the candle alone nearly half of it.
6. **20 active pay lines are charged for, but only 5 patterns are built**, so the payout is temporarily
   ~21.9%. Adding the other 15 to `LINES` restores 87.5% with no other change.
