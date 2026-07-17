import { Assets, Texture } from "pixi.js";
import PixiSprite from "../pixi/PixiSprite";
import { useStage } from "@/hooks/useStage";

export interface HeaderProps {
  /** Header/logo art alias (from the active theme). */
  art: string;
  alpha?: number;
  visible?: boolean;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Generic theme header, placed in the same common spot for every game: horizontally centered at the
 * top. Width + top offset adapt per layout mode (desktop / mobile-landscape / portrait); height is
 * derived from the texture aspect so the logo never distorts. Renders nothing until it's loaded.
 */
export function Header({ art, alpha, visible }: HeaderProps) {
  const { w, h, mode } = useStage();
  const tex = Assets.get<Texture>(art);
  if (!tex) return null;

  // Target width (as a fraction of the viewport, clamped) + top offset, per layout mode.
  const width =
    mode === "portrait"
      ? clamp(w * 0.8, 220, 460)
      : mode === "mobile-landscape"
        ? clamp(w * 0.35, 200, 380)
        : clamp(w * 0.5, 280, 500); // desktop
  const top = mode === "portrait" ? h * 0.2 : 0;
  const height = (width * tex.height) / tex.width; // preserve aspect

  return (
    <PixiSprite
      texture={tex}
      anchor={{ x: 0.5, y: 0 }} // top-center
      x={w / 2}
      y={top}
      width={width}
      height={height}
      alpha={alpha}
      visible={visible}
    />
  );
}

export default Header;
