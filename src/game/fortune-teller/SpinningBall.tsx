import { PixiGameAnimation } from "@/components/pixi/PixiGameAnimation";
import { useStage } from "@/hooks/useStage";
import { reelFrameRect } from "@/utils/reelCells";
import type { ReelArt } from "@/types/theme";
import {
  BALL_X_FRAC,
  BALL_Y_FRAC_H,
  BALL_Y_FRAC_V,
  BALL_WIDTH_FRAC,
  BALL_SPEED,
} from "./constant";

export interface SpinningBallProps {
  reel: ReelArt;
  spinning: boolean;
}

export function SpinningBall({ reel, spinning }: SpinningBallProps) {
  const { w, h, mode, portrait } = useStage();

  const rect = reelFrameRect(reel, mode, portrait, w, h);
  if (!rect) return null; // frame texture not loaded yet — nothing to sit on

  const size = BALL_WIDTH_FRAC * rect.w;
  return (
    <PixiGameAnimation
      sheet="spinning_ball"
      x={rect.x + BALL_X_FRAC * rect.w}
      y={rect.y + (portrait ? BALL_Y_FRAC_V : BALL_Y_FRAC_H) * rect.h}
      width={size}
      height={size} // the sheet's frames are square (269x269)
      anchor={0.5}
      loop
      animationSpeed={BALL_SPEED}
      autoPlay={spinning}
    />
  );
}

export default SpinningBall;
