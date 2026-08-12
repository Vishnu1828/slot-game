import { makeTheme } from "@/game/theme";

// Loose images (header, backgrounds, reel frame/bg) are auto-scoped to games/fortune-teller/… by
// makeTheme; defaults already match this game's layout. We only override the reel corners: a
// `gem_shine` glow on the TOP two gems (bl/br omitted → no bottom glow). `sheet` is a bare animation
// alias (not game-scoped). Tune sizeFrac (glow size) / inset (sit it on the gem).
export default makeTheme("fortune-teller", {
  // Reel symbols: math SymbolId → all of that symbol's art. Keys MUST match the ids in
  // `fortune-teller/math.ts` so an engine result grid maps straight to art.
  //   `asset`            bare atlas FRAME name from symbols{tps} — the still symbol the reels scroll.
  //   `bounce`/`winning` sheet base names under win/fortune-teller-win/ — game-scoped by makeTheme.
  // The animation base names deliberately do NOT match the atlas frame names (the artist names by
  // subject, the atlas by pay tier), which is exactly why they're listed explicitly rather than derived.
  // Sheets are authored at 308/391 px against the 280 px still symbol, hence the sizeFracs.
  symbols: {
    H1: {
      asset: "character_high", // Fortune Teller
      bounce: "fortune_teller_bounce",
      winning: "fortune_teller_winning",
    },
    H2: {
      asset: "low_crystals", // Crystal
      bounce: "crystal_bounce",
      winning: "crystal_winning",
    },
    M1: {
      asset: "medium_tome",
      bounce: "tome_bounce",
      winning: "tome_winning",
    },
    M2: {
      asset: "low_potion",
      bounce: "potion_bounce",
      winning: "potion_winning",
    },
    L1: {
      asset: "medium_cards",
      bounce: "cards_bounce",
      winning: "cards_winning",
    },
    L2: { asset: "low_keys", bounce: "keys_bounce", winning: "keys_winning" },
    L3: {
      asset: "low_candle",
      bounce: "candle_bounce",
      winning: "candle_winning",
    },
    // B0 sits on ZERO reel stops (see BONUS_PROVISIONAL in math.ts), so its sheets are unreachable —
    // listed for completeness only. Note they still LOAD, since memory follows bundle membership, not
    // theme references; deleting the files is the only way to reclaim that ~58 MB.
    B0: {
      asset: "bonus_ball",
      bounce: "bonus_bounce",
      winning: "bonus_winning",
    },
  },
  reel: {
    corners: {
      perCorner: {
        tl: {
          sheet: "gem_shine",
          sizeFrac: 0.1,
          inset: 0.05,
          animationSpeed: 0.5,
        },
        tr: {
          sheet: "gem_shine",
          sizeFrac: 0.1,
          inset: 0.05,
          animationSpeed: 0.5,
        },
        bl: {
          sheet: "gem_shine",
          sizeFrac: 0.1,
          inset: 0.05,
          animationSpeed: 0.5,
        },
        br: {
          sheet: "gem_shine",
          sizeFrac: 0.1,
          inset: 0.05,
          animationSpeed: 0.5,
        },
      },
    },
  },

  // Win-screen celebration: the fortune teller reading her cards, behind the win frame. The 80 frames
  // ship as win-0 … win-9 (8 per sheet, scattered and out of order) — the player pools all ten and
  // sorts by the number at the end of each frame name, so only the sheet COUNT lives here.
  // aspect is the frames' 867x527 sourceSize; widthFrac/offsetYFrac place her over the frame.
  winAnimation: {
    sheet: "win",
    sheets: 10,
    aspect: 867 / 527,
    widthFrac: 0.95,
    offsetYFrac: -1,
    durationMs: 3000,
  },
});
