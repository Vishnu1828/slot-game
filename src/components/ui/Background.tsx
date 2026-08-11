import { useScreen } from "@/hooks/useScreen";
import PixiContainer from "../pixi/PixiContainer";
import PixiSprite from "../pixi/PixiSprite";
import { type Texture } from "pixi.js";
import { getAsset } from "@/utils/assets";
import { coverScale } from "@/utils/cover";

import type { BackgroundTypes } from "@/types/backgroundTypes";

const Background = ({ bgTexture }: BackgroundTypes) => {
  const { w, h } = useScreen();
  const bg = getAsset<Texture>(bgTexture);
  // Cover-fit the art (see utils/cover). Overlays pinned to the bg use the same transform.
  const scale = bg ? coverScale(w, h, bg.width, bg.height) : 1;
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
