import { makeTheme } from "@/game/theme";

// Loose images (header, backgrounds, reel frame/bg) are auto-scoped to games/fortune-teller/… by
// makeTheme; defaults already match this game's layout. We only override the reel corners: a
// `gem_shine` glow on the TOP two gems (bl/br omitted → no bottom glow). `sheet` is a bare animation
// alias (not game-scoped). Tune sizeFrac (glow size) / inset (sit it on the gem).
export default makeTheme("fortune-teller", {
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
});
