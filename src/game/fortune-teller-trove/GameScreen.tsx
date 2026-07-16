import { Assets, type Texture } from "pixi.js";
import Background from "../../components/ui/Background";
import PixiContainer from "../../components/pixi/PixiContainer";
import Header from "@/components/ui/Header";
import Controls from "@/components/ui/Controls";
import Footer from "@/components/ui/Footer";
import { useScreen } from "@/hooks/useScreen";
import { getTheme } from "../registry";
import { useGameControlsStore } from "@/store/useGameControlsStore";
import GameState from "@/components/ui/GameState";
import { PixiGameAnimation } from "@/components/pixi/PixiGameAnimation";
import { anchorToScreen } from "@/utils/cover";

const theme = getTheme("fortune-teller-trove");

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

export function GameScreen() {
  const { w, h, portrait } = useScreen();
  const balance = 100000; // TODO: from server state (React Query) once wired
  const totalBet = useGameControlsStore((s) => s.bet);

  // Anchor the flame to the candles by mapping the art fraction through the SAME cover transform
  // the Background uses, so it tracks the candles as the screen resizes. Landscape/desktop only.
  const bg = Assets.get<Texture>(theme.background_h);
  const { x, y, scale } = anchorToScreen(
    CANDLE_FX,
    CANDLE_FY,
    w,
    h,
    bg?.width ?? BG_W,
    bg?.height ?? BG_H,
  );

  return (
    <PixiContainer>
      <Background
        bgTexture={portrait ? theme.background_v : theme.background_h}
      />
      {!portrait && (
        <PixiGameAnimation
          sheet="candle_light"
          x={-(CANDLE_ART_W * scale) / 0.235 + x}
          y={-(CANDLE_ART_W * scale * CANDLE_ASPECT) / 1.1 + y}
          width={CANDLE_ART_W * scale}
          height={CANDLE_ART_W * scale * CANDLE_ASPECT}
          anchor={{ x: 0.5, y: 0.85 }} // flame base sits on the wick
          loop
          animationSpeed={0.4}
        />
      )}
      {/* Themed chrome — art comes from this game's theme descriptor */}
      <Header art={theme.header} />

      {/* Game controls: spin + bet +/- + autoplay + speed + bet-settings */}
      <Controls spin={theme.spin} />
      <Footer balance={balance} totalBet={totalBet} />
      <GameState />
    </PixiContainer>
  );
}

export default GameScreen;
