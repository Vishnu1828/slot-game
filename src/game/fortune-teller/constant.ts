import { getTheme } from "../registry";

const theme = getTheme("fortune-teller");

// Candle flame overlay, positioned over the candles in `bg_horizontal` (landscape/desktop art).
// Values are FRACTIONS of that art (0..1) — tune by eye. CANDLE_ART_W is the flame width in art
// pixels; multiplying by the cover scale keeps it proportional to the background at any size.
const CANDLE_FX = 0.44;
const CANDLE_FY = 0.33;
const CANDLE_ART_W = 360;
const CANDLE_ASPECT = 196 / 254; // candle_light frame is 254×196
// Fallback intrinsic size of bg_horizontal (used only until its texture is available).
const BG_W = 3840;
const BG_H = 2160;

// Hanging lamps: decorative lanterns NOT baked into the bg — they hang from the top edge of the
// viewport. Screen-anchored (not art-anchored) because the art's top is cropped on wide screens,
// which would push art-anchored lamps off-screen. Position/size are fractions of the screen, so they
// adapt across desktop and landscape. Frame is 582×1167 (tall).
const LAMP_X_FRAC = 0.85; // horizontal center, fraction of screen width (right side)
const LAMP_H_FRAC = 0.65; // cluster height, fraction of screen height
const LAMP_Y_FRAC = -0.08; // vertical offset from the top, fraction of height (negative = above)
const LAMP_ASPECT = 600 / 1167; // width / height

// Chandelier: hung from the top-center in PORTRAIT (screen-anchored, like the lamps).
const CHANDELIER_X_FRAC = 0.5;
const CHANDELIER_Y_FRAC = 0.02;
const CHANDELIER_H_FRAC = 0.25; // width as a fraction of screen width
const CHANDELIER_ASPECT = 674 / 620; // width / height

// Spinning ball: sits ON the orb painted into the reel frame's top-centre scrollwork. Unlike the decor
// above these are fractions of the FRAME RECT, not the screen, so the ball stays glued to the frame at
// any size (see SpinningBall.tsx — it derives that rect from the same helper ReelFrame does).
//
// Measured off the frame art: the orb is a 269px circle centred at (1810, 163) in 3632px-wide art, and
// the sheet's frames are 269x269 filling 99.6% — so WIDTH_FRAC maps 1:1 with no fudge factor. Y differs
// per orientation ONLY because the two frames differ in height; the orb is at the same absolute spot.
const BALL_X_FRAC = 0.4983; // 1810 / 3632
const BALL_Y_FRAC_H = 0.0718; // 163 / 2270 — landscape frame is 3632x2270
const BALL_Y_FRAC_V = 0.0608; // 163 / 2680 — portrait frame is 3632x2680
const BALL_WIDTH_FRAC = 0.0741; // 269 / 3632
// 48 frames / 60fps ≈ 0.8s per rotation. The 0.4 default would be 2.0s — longer than a whole fast spin
// (~490ms), so the ball would barely turn a quarter before stopping.
const BALL_SPEED = 1;

export {
  theme,
  CANDLE_FX,
  CANDLE_FY,
  CANDLE_ART_W,
  CANDLE_ASPECT,
  BG_W,
  BG_H,
  LAMP_X_FRAC,
  LAMP_H_FRAC,
  LAMP_Y_FRAC,
  LAMP_ASPECT,
  CHANDELIER_X_FRAC,
  CHANDELIER_Y_FRAC,
  CHANDELIER_H_FRAC,
  CHANDELIER_ASPECT,
  BALL_X_FRAC,
  BALL_Y_FRAC_H,
  BALL_Y_FRAC_V,
  BALL_WIDTH_FRAC,
  BALL_SPEED,
};
