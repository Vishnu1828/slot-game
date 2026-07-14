import { useState } from "react";
import { extend } from "@pixi/react";
import { Container, Graphics } from "pixi.js";
import PixiBitmapText from "../pixi/PixiBitmapText";
import { commonTheme } from "@/constants/commonTheme";

// Raw <pixiContainer> (for event handlers PixiContainer doesn't forward) + <pixiGraphics> (pill).
extend({ Container, Graphics });

export type ButtonVariant = "primary" | "secondary";

export interface PixiButtonProps {
  label: string;
  /** Top-left position and size in px (drawn from 0,0 inside its own container). */
  x: number;
  y: number;
  width: number;
  height: number;
  onPress?: () => void;
  /** `primary` = solid light pill; `secondary` = darker pill (e.g. "NO"/cancel). */
  variant?: ButtonVariant;
  textSize?: number;
  disabled?: boolean;
}

// Pill fills per variant/state. No art needed — the button is fully code-drawn (rounded rect +
// white outline), so it themes with the rest of the UI without any asset.
const FILLS: Record<ButtonVariant, { idle: number; hover: number; press: number }> = {
  primary: { idle: 0x8f929c, hover: 0xa3a6af, press: 0x7a7d87 },
  secondary: { idle: 0x6d707c, hover: 0x808391, press: 0x5b5e69 },
};

/**
 * Reusable code-drawn pill button for @pixi/react (no texture required). Rounded-rect body with a
 * white outline + centered bitmap label, and idle/hover/pressed states. Position/size are explicit
 * so callers (e.g. PopupModal) can lay out one or more in a row.
 */
export function PixiButton({
  label,
  x,
  y,
  width,
  height,
  onPress,
  variant = "primary",
  textSize = 16,
  disabled = false,
}: PixiButtonProps) {
  const [hover, setHover] = useState(false);
  const [held, setHeld] = useState(false);

  const c = FILLS[variant];
  const color = disabled ? 0x555762 : held ? c.press : hover ? c.hover : c.idle;
  const radius = height / 2;

  return (
    <pixiContainer
      x={x}
      y={y}
      alpha={disabled ? 0.6 : 1}
      eventMode={disabled ? "none" : "static"}
      cursor={disabled ? "default" : "pointer"}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => {
        setHover(false);
        setHeld(false);
      }}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerUpOutside={() => setHeld(false)}
      onPointerTap={disabled ? undefined : () => onPress?.()}
    >
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.roundRect(0, 0, width, height, radius)
            .fill({ color })
            .stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
        }}
      />
      <PixiBitmapText
        text={label}
        font={commonTheme.fonts.bold}
        size={textSize}
        tint={0xffffff}
        anchor={0.5}
        x={width / 2}
        y={height / 2}
      />
    </pixiContainer>
  );
}

export default PixiButton;
