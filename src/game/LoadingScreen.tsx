import { extend } from "@pixi/react";
import { Container, Graphics } from "pixi.js";
import PixiBitmapText from "../components/pixi/PixiBitmapText";
import { useScreen } from "../hooks/useScreen";

extend({ Container, Graphics });

// Bitmap font shown on the loading screen (loaded up front by GameShell). Must match the .fnt face.
export const LOADING_FONT = "Inter_Regular";

export interface LoadingScreenProps {
  /** 0..1 load progress for the bar. */
  progress: number;
}

/**
 * The loading screen: an orientation-aware, cover-fit scenario background with a "Loading..."
 * caption and a progress bar. Shown by GameShell while the game bundle streams in.
 */
export function LoadingScreen({ progress }: LoadingScreenProps) {
  const { w, h } = useScreen();

  const barW = Math.min(w * 0.6, 640);
  const barH = 14;
  const barX = (w - barW) / 2;
  const barY = h * 0.88;

  return (
    <pixiContainer>
      {/* {tex && (
        <PixiSprite
          texture={tex}
          anchor={0.5}
          x={w / 2}
          y={h / 2}
          scale={scale}
        />
      )} */}
      <PixiBitmapText
        text="Loading..."
        font={LOADING_FONT}
        size={34}
        align="center"
        anchor={0.5}
        x={w / 2}
        y={h / 2}
      />
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.roundRect(barX, barY, barW, barH, barH / 2).fill({
            color: 0x000000,
            alpha: 0.45,
          });
          g.roundRect(barX, barY, barW * progress, barH, barH / 2).fill({
            color: 0xffd21e,
          });
        }}
      />
    </pixiContainer>
  );
}

export default LoadingScreen;
