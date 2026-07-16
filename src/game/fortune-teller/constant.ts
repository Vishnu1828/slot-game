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
};
