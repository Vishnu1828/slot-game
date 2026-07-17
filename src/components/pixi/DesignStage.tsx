import type { ReactNode } from "react";
import PixiContainer from "./PixiContainer";
import { useStage } from "@/hooks/useStage";

export interface DesignStageProps {
  children?: ReactNode;
}

/**
 * Scales + centers its children from the fixed DESIGN canvas onto the real screen (letterboxed).
 * Wrap any UI laid out in design coordinates (via useStage) in this so it renders proportionally
 * identical on every device. Pixi propagates the transform to hit-testing, so buttons inside stay
 * clickable with no extra work.
 *
 * NOTE: children must size themselves with useStage() (design space), not useScreen() (real screen).
 * Keep full-screen art/scrims OUTSIDE this (they use useScreen so they cover the real screen).
 */
export function DesignStage({ children }: DesignStageProps) {
  const { scale, offsetX, offsetY } = useStage();
  return (
    <PixiContainer x={offsetX} y={offsetY} scale={scale}>
      {children}
    </PixiContainer>
  );
}

export default DesignStage;
