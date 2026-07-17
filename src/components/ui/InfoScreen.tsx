import PixiContainer from "../pixi/PixiContainer";
import PixiBitmapText from "../pixi/PixiBitmapText";
import IconButton from "./IconButton";
import OverlayScrim from "../pixi/OverlayScrim";
import { useScreen } from "@/hooks/useScreen";
import { commonTheme } from "@/constants/commonTheme";
import { PixiNineSliceSprite } from "../pixi/PixiNineSliceSprite";

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// Header + text sizing per layout mode (mobile-landscape is shorter/tighter than portrait/desktop).
const MODE = {
  portrait: { headerH: 65, pad: 24, close: 18, title: 22, body: 22 },
  "mobile-landscape": { headerH: 30, pad: 18, close: 14, title: 18, body: 18 },
  desktop: { headerH: 65, pad: 28, close: 18, title: 22, body: 22 },
} as const;

export interface InfoScreenProps {
  onClose: () => void;
}

/**
 * Shared "GAME RULES" overlay. Full-screen panel in portrait; a right-side drawer over a dimmed
 * game in landscape/desktop. Panel bg = `menu_container`, close = `x_button`, text in Inter Bold.
 * Header height, paddings and font sizes adapt per layout mode.
 */
export function InfoScreen({ onClose }: InfoScreenProps) {
  const { w, h, mode } = useScreen();
  const cfg = MODE[mode];

  const panelW = mode === "portrait" ? w : clamp(w * 0.3, 320, 460);
  const panelX = w - panelW;
  const cx = panelX + panelW / 2;

  return (
    <PixiContainer>
      {/* Dim backdrop (real screen) */}
      <OverlayScrim alpha={0.55} />

      {/* Panel background (blocks click-through) — full REAL screen size (not the design canvas) */}
      <PixiNineSliceSprite
        texture={commonTheme.overlay.container}
        x={panelX}
        y={0}
        width={panelW}
        height={h}
        eventMode="static"
      />

      {/* Header: close (top-left) + centered title */}
      <IconButton
        idle={commonTheme.overlay.close}
        size={cfg.close}
        x={panelX + cfg.pad}
        y={(cfg.headerH - cfg.close) / 1.7}
        onPress={onClose}
      />
      <PixiBitmapText
        text="GAME RULES"
        font={commonTheme.fonts.alexandria_semibold}
        size={cfg.title}
        tint={0xdfe3ee}
        anchor={0.5}
        x={cx}
        y={cfg.headerH / 2}
      />

      {/* Body */}
      <PixiBitmapText
        text="CONTENT TBD"
        font={commonTheme.fonts.alexandria_semibold}
        size={cfg.body}
        tint={0xcfd3de}
        anchor={0.5}
        x={cx}
        y={h / 2}
      />
    </PixiContainer>
  );
}

export default InfoScreen;
