import { useState } from "react";
import { extend } from "@pixi/react";
import "@pixi/layout"; // enables the optional `layout` prop
import { Assets, Sprite, Texture } from "pixi.js";
import type { LayoutStyle } from "../pixi/PixiLayout";
import { PixiSprite } from "../pixi/PixiSprite";

// Register <pixiSprite> as a JSX element (idempotent).
extend({ Sprite });

export interface IconButtonProps {
  idle: string | Texture;
  hover?: string | Texture;
  pressed?: string | Texture;
  disabledTexture?: string | Texture;
  active?: boolean;
  onPress?: () => void;
  size?: number;
  disabled?: boolean;
  x?: number;
  y?: number;
  layout?: LayoutStyle;
  label?: string;
  width?: number;
  height?: number;
}

function resolveTex(tex?: string | Texture): Texture | undefined {
  if (!tex) return undefined;
  return typeof tex === "string" ? Assets.get<Texture>(tex) : tex;
}

export function IconButton({
  idle,
  hover,
  pressed,
  disabledTexture,
  active = false,
  onPress,
  size,
  width,
  height,
  disabled = false,
  x,
  y,
  layout,
  label,
}: IconButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [held, setHeld] = useState(false);

  const idleTex = resolveTex(idle);
  const hoverTex = resolveTex(hover) ?? idleTex;
  const pressedTex = resolveTex(pressed) ?? hoverTex;
  const disabledTex = resolveTex(disabledTexture) ?? idleTex;

  const showPressed = held || active;
  const tex = disabled
    ? disabledTex
    : showPressed
      ? pressedTex
      : hovered
        ? hoverTex
        : idleTex;
  if (!tex) return null;

  const dims =
    width != null && height != null
      ? { width, height }
      : size != null
        ? { width: size, height: size }
        : {};

  return (
    <PixiSprite
      texture={tex}
      {...dims}
      x={x}
      y={y}
      layout={layout}
      label={label}
      alpha={disabled ? 0.4 : 1}
      eventMode={disabled ? "none" : "static"}
      cursor={disabled ? "default" : "pointer"}
      onPointerTap={disabled ? undefined : () => onPress?.()}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => {
        setHovered(false);
        setHeld(false);
      }}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerUpOutside={() => setHeld(false)}
    />
  );
}

export default IconButton;
