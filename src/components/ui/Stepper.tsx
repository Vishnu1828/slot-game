import PixiContainer from "../pixi/PixiContainer";
import { PixiSprite } from "../pixi/PixiSprite";
import PixiBitmapText from "../pixi/PixiBitmapText";
import IconButton from "./IconButton";
import { commonTheme } from "@/constants/commonTheme";

export interface StepperProps {
  value: number | string;
  onDecrease: () => void;
  onIncrease: () => void;
  /** Top-left of the row. */
  x: number;
  y: number;
  /** Total row width and height. */
  width: number;
  height: number;
  /** +/- button size (square); defaults to `height`. */
  btnSize?: number;
  /** Gap between the buttons and the value box. */
  gap?: number;
  decDisabled?: boolean;
  incDisabled?: boolean;
  font?: string;
  textSize?: number;
}

/**
 * Reusable [ − ] [ value ] [ + ] stepper. The +/- are `IconButton`s (bet minus/plus art), the value
 * sits in a plain (stretched) `box_middle` container. Buttons are top-left anchored; the value box
 * fills the remaining middle span. Purely presentational — parent supplies value + handlers.
 */
export function Stepper({
  value,
  onDecrease,
  onIncrease,
  x,
  y,
  width,
  height,
  btnSize,
  gap = 20,
  decDisabled = false,
  incDisabled = false,
  font = commonTheme.fonts.alexandria_semibold,
  textSize = 18,
}: StepperProps) {
  const bs = btnSize ?? height;
  const boxX = bs + gap;
  const boxW = Math.max(0, width - 2 * (bs + gap));

  return (
    <PixiContainer x={x} y={y}>
      <IconButton
        idle={commonTheme.buttons.betMinus.idle}
        size={bs}
        x={0}
        y={(height - bs) / 2}
        disabled={decDisabled}
        onPress={onDecrease}
      />

      <PixiSprite
        texture={commonTheme.tabs.middle.idle}
        x={boxX}
        y={0}
        width={boxW}
        height={height}
      />
      <PixiBitmapText
        text={value}
        font={font}
        size={textSize}
        tint={0xffffff}
        anchor={0.5}
        x={boxX + boxW / 2}
        y={height / 2}
      />

      <IconButton
        idle={commonTheme.buttons.betPlus.idle}
        size={bs}
        x={width - bs}
        y={(height - bs) / 2}
        disabled={incDisabled}
        onPress={onIncrease}
      />
    </PixiContainer>
  );
}

export default Stepper;
