import { Assets, Texture } from "pixi.js";
import PixiSprite from "../components/pixi/PixiSprite";
import Footer from "./hud/Footer";
import { useScreen } from "./useScreen";

/**
 * The in-game screen shown once assets are ready: an orientation-aware, cover-fit game background
 * plus the HUD Footer. (Reels/gameplay layers get added here later.)
 */
export function GameScreen() {
  const { w, h, portrait } = useScreen();
  // Desktop + mobile landscape (w > h) -> bg_horizontal; mobile portrait (h >= w) -> bg_vertical.
  const bgAlias = portrait ? "bg_vertical" : "bg_horizontal";
  const bg = Assets.get<Texture>(bgAlias);
  const scale = bg ? Math.max(w / bg.width, h / bg.height) : 1;

  // Placeholder economy values — wire to React Query (balance) + Zustand (bet) later.
  const balance = 100000;
  const totalBet = 5;

  return (
    <pixiContainer>
      {bg && (
        <PixiSprite
          texture={bg}
          anchor={0.5}
          x={w / 2}
          y={h / 2}
          scale={scale}
        />
      )}
      <Footer balance={balance} totalBet={totalBet} />
    </pixiContainer>
  );
}

export default GameScreen;
