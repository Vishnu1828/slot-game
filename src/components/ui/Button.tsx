import { useState } from "react";
import { extend } from "@pixi/react";
import { Assets, Container, Texture } from "pixi.js";
import PixiContainer from "../pixi/PixiContainer";
import PixiBitmapText from "../pixi/PixiBitmapText";
import { PixiNineSliceSprite } from "../pixi/PixiNineSliceSprite";
import { commonTheme } from "@/constants/commonTheme";
import {
  measureButtonWidth,
  BUTTON_DEFAULT_TEXT_SIZE,
  BUTTON_DEFAULT_PADDING_X,
  BUTTON_DEFAULT_FONT,
} from "@/utils/buttonMetrics";

// Raw <pixiContainer> for event handlers PixiContainer doesn't forward.
extend({ Container });

export interface ButtonProps {
  label: string;
  /** Center position. */
  x: number;
  y: number;
  /** Button height in px; width auto-fits the label. */
  height: number;
  onPress?: () => void;
  disabled?: boolean;
  textSize?: number;
  paddingX?: number;
  minWidth?: number;
  font?: string;
}

/**
 * Reusable pill button backed by the `popupButton` atlas (`button_idle` / `button_pressed`). The
 * width auto-fits the label; only the middle stretches (horizontal 3-slice) while the rounded caps
 * scale uniformly, so the pill never distorts at any width/height. Center-anchored (place by x/y).
 */
export function Button({
  label,
  x,
  y,
  height,
  onPress,
  disabled = false,
  textSize = BUTTON_DEFAULT_TEXT_SIZE,
  paddingX = BUTTON_DEFAULT_PADDING_X,
  minWidth,
  font = BUTTON_DEFAULT_FONT,
}: ButtonProps) {
  const [held, setHeld] = useState(false);

  const width = measureButtonWidth(label, {
    textSize,
    paddingX,
    minWidth,
    height,
    font,
  });

  const art = commonTheme.buttons.popup;
  const tex = Assets.get<Texture>(held ? art.pressed : art.idle);
  if (!tex) return null; // art not loaded yet

  const srcH = tex.height;
  const cap = Math.ceil(srcH / 2.5);
  const scale = height / srcH;

  return (
    <pixiContainer
      x={x - width / 2}
      y={y - height / 2}
      alpha={disabled ? 0.5 : 1}
      eventMode={disabled ? "none" : "static"}
      cursor={disabled ? "default" : "pointer"}
      onPointerTap={disabled ? undefined : () => onPress?.()}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerUpOutside={() => setHeld(false)}
      onPointerOut={() => setHeld(false)}
    >
      {/* Scaled wrapper: caps scale uniformly with height; nine-slice stretches only the middle. */}
      <PixiContainer scale={scale}>
        <PixiNineSliceSprite
          texture={tex}
          width={width / scale}
          height={srcH}
          leftWidth={cap}
          rightWidth={cap}
          topHeight={0}
          bottomHeight={0}
        />
      </PixiContainer>

      <PixiBitmapText
        text={label}
        font={font}
        size={textSize}
        tint={0xffffff}
        anchor={0.5}
        x={width / 2}
        y={height / 2}
      />
    </pixiContainer>
  );
}

export default Button;
