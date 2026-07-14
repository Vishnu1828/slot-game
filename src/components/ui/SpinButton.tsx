import { useState } from "react";
import { Assets, Texture } from "pixi.js";
import type { LayoutStyle } from "../pixi/PixiLayout";
import type { SpinButtonArt } from "@/types/theme";
import { PixiSprite } from "../pixi/PixiSprite";

export interface SpinButtonProps {
  /** The theme's spin-button state textures. */
  art: SpinButtonArt;
  onPress?: () => void;
  /** Auto-spin engaged → show the `active` texture persistently. */
  active?: boolean;
  /** Spin in progress / not allowed → show `disabled` texture, ignore taps. */
  disabled?: boolean;
  /** Square display size in px. */
  size?: number;
  x?: number;
  y?: number;
  layout?: LayoutStyle;
  label?: string;
}

const resolveTex = (a?: string): Texture | undefined =>
  a ? Assets.get<Texture>(a) : undefined;

/**
 * Generic spin button with four theme-driven states (idle / active / pressed / disabled). Each
 * state falls back to `idle` when its texture isn't provided; renders nothing until `idle` loads.
 * Theme-agnostic: pass any game's `theme.spin`.
 */
export function SpinButton({
  art,
  onPress,
  active = false,
  disabled = false,
  size,
  x,
  y,
  layout,
  label,
}: SpinButtonProps) {
  const [held, setHeld] = useState(false);

  const idle = resolveTex(art.idle);
  const tex = disabled
    ? (resolveTex(art.disabled) ?? idle)
    : held
      ? (resolveTex(art.pressed) ?? idle)
      : active
        ? (resolveTex(art.active) ?? idle)
        : idle;
  if (!tex) return null;

  const dims = size != null ? { width: size, height: size } : {};

  return (
    <PixiSprite
      texture={tex}
      {...dims}
      x={x}
      y={y}
      layout={layout}
      label={label}
      anchor={0.5}
      alpha={disabled ? 0.6 : 1}
      eventMode={disabled ? "none" : "static"}
      cursor={disabled ? "default" : "pointer"}
      onPointerTap={disabled ? undefined : () => onPress?.()}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerUpOutside={() => setHeld(false)}
      onPointerOut={() => setHeld(false)}
    />
  );
}

export default SpinButton;
