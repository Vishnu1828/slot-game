import { useScreen } from "@/hooks/useScreen";
import PixiContainer from "../pixi/PixiContainer";
import PixiSprite from "../pixi/PixiSprite";
import { Assets, type Texture } from "pixi.js";

import type { BackgroundTypes } from "@/types/backgroundTypes";

const Background = ({ bgTexture }: BackgroundTypes) => {
  const { w, h } = useScreen();
  const bg = Assets.get<Texture>(bgTexture);
  const scale = bg ? Math.max(w / bg.width, h / bg.height) : 1;
  return (
    <PixiContainer>
      {bg && (
        <PixiSprite
          texture={bg}
          anchor={0.5}
          x={w / 2}
          y={h / 2}
          scale={scale}
        />
      )}
    </PixiContainer>
  );
};
export default Background;
