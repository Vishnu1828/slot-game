import { Assets, type Texture } from "pixi.js";
import Background from "../../components/ui/Background";
import PixiContainer from "../../components/pixi/PixiContainer";
import Header from "@/components/ui/Header";
import Controls from "@/components/ui/Controls";
import Footer from "@/components/ui/Footer";
import { useScreen } from "@/hooks/useScreen";
import { useGameControlsStore } from "@/store/useGameControlsStore";
import GameState from "@/components/ui/GameState";
import { PixiGameAnimation } from "@/components/pixi/PixiGameAnimation";
import DecorAnimation from "@/components/ui/DecorAnimation";
import ReelFrame from "@/components/ui/ReelFrame";
import DesignStage from "@/components/pixi/DesignStage";
import { anchorToScreen } from "@/utils/cover";
import {
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
  theme,
} from "./constant";

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
      {/* Hanging lanterns — landscape/desktop (hung from the top-right). */}
      {!portrait && (
        <DecorAnimation
          sheet="hanging_lamps"
          xFrac={LAMP_X_FRAC}
          yFrac={LAMP_Y_FRAC}
          heightFrac={LAMP_H_FRAC}
          aspect={LAMP_ASPECT}
        />
      )}
      {/* Chandelier — portrait (hung from the top-center). */}
      {portrait && (
        <DecorAnimation
          sheet="chandelier"
          xFrac={CHANDELIER_X_FRAC}
          yFrac={CHANDELIER_Y_FRAC}
          heightFrac={CHANDELIER_H_FRAC}
          aspect={CHANDELIER_ASPECT}
          animationSpeed={0.7}
        />
      )}
      {/* UI cluster — laid out in the fixed DESIGN canvas (useStage) and uniformly scaled to fit.
          Background + decor above stay at REAL screen size so art fills any letterbox margins. */}
      <DesignStage>
        {/* Slot playfield: frame + reel bg + symbol grid + theme-driven decor animations. */}
        <ReelFrame reel={theme.reel} />

        {/* Themed chrome — art comes from this game's theme descriptor */}
        <Header art={theme.header} />

        {/* Game controls: spin + bet +/- + autoplay + speed + bet-settings */}
        <Controls spin={theme.spin} />
      </DesignStage>

      {/* Footer bar — full REAL screen width, pinned to the real bottom (chrome, not letterboxed). */}
      <Footer balance={balance} totalBet={totalBet} />
      <GameState />
    </PixiContainer>
  );
}

export default GameScreen;
