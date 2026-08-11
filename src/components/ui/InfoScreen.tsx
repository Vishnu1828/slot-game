import PixiContainer from "../pixi/PixiContainer";
import PixiBitmapText from "../pixi/PixiBitmapText";
import PanelSurface from "../pixi/PanelSurface";
import DesignStage from "../pixi/DesignStage";
import IconButton from "./IconButton";
import OverlayScrim from "../pixi/OverlayScrim";
import { useScreen } from "@/hooks/useScreen";
import { useStage } from "@/hooks/useStage";
import { OVERLAY_PANEL_LABEL } from "@/hooks/useDismissOnOutsideTap";
import { commonTheme } from "@/constants/commonTheme";
import { BAR_H } from "@/constants/footer";

const CARD_RADIUS = 16;
const CARD_BG = 0x020617;
// Landscape/desktop card is slightly see-through so the game still reads behind it.
const CARD_ALPHA = 0.92;

/**
 * Per-mode sizing. `cardW`/`cardH` and the type sizes for landscape/desktop are DESIGN-canvas units —
 * <DesignStage> scales them to the real screen like the reel frame, so the card never needs
 * re-tuning per window size. Portrait is real px (full-bleed panel).
 */
const MODE = {
  portrait: { cardW: 0, cardH: 0, headerH: 65, pad: 24, close: 18, title: 22, body: 22 },
  // Design canvas 844x390; minus the footer bar that leaves 338 for the card.
  "mobile-landscape": { cardW: 440, cardH: 240, headerH: 30, pad: 18, close: 14, title: 18, body: 18 },
  // Design canvas 1280x720; minus the footer bar that leaves 668 for the card.
  desktop: { cardW: 660, cardH: 400, headerH: 65, pad: 28, close: 18, title: 22, body: 22 },
} as const;

export interface InfoScreenProps {
  onClose: () => void;
}

/**
 * Shared "GAME RULES" overlay. Portrait = a dimmed, blocking, full-screen panel on the REAL screen;
 * landscape/desktop = a centred translucent card laid out in the DESIGN canvas and uniformly scaled
 * by <DesignStage> (so it grows with the reel frame), with NO backdrop — the game stays lit and
 * playable behind it and a tap outside dismisses it (see useDismissOnOutsideTap).
 */
export function InfoScreen({ onClose }: InfoScreenProps) {
  const screen = useScreen();
  const stage = useStage();
  const { mode } = stage;
  const cfg = MODE[mode];

  // Portrait panel is full-bleed chrome → real screen coords. The card lives in the design canvas.
  const isSheet = mode === "portrait";
  const w = isSheet ? screen.w : stage.w;
  const h = isSheet ? screen.h : stage.h;

  const panelW = isSheet ? w : cfg.cardW;
  const panelH = isSheet ? h : cfg.cardH;
  const panelX = isSheet ? 0 : (w - panelW) / 2;
  // Centred in the band ABOVE the footer bar (BAR_H as design units, like the Controls cluster).
  const panelY = isSheet ? 0 : (h - BAR_H - panelH) / 2;
  const cx = panelX + panelW / 2;

  const panel = (
    <>
      {/* Panel background (blocks click-through) */}
      <PanelSurface
        x={panelX}
        y={panelY}
        width={panelW}
        height={panelH}
        radius={isSheet ? 0 : CARD_RADIUS}
        color={CARD_BG}
        alpha={isSheet ? 1 : CARD_ALPHA}
        dividerY={panelY + cfg.headerH}
      />

      {/* Header: close (top-left) + centered title */}
      <IconButton
        idle={commonTheme.overlay.close}
        size={cfg.close}
        x={panelX + cfg.pad}
        y={panelY + (cfg.headerH - cfg.close) / 2}
        onPress={onClose}
      />
      <PixiBitmapText
        text="GAME RULES"
        font={commonTheme.fonts.alexandria_semibold}
        size={cfg.title}
        tint={0xdfe3ee}
        anchor={0.5}
        x={cx}
        y={panelY + cfg.headerH / 2}
      />

      {/* Body */}
      <PixiBitmapText
        text="CONTENT TBD"
        font={commonTheme.fonts.alexandria_semibold}
        size={cfg.body}
        tint={0xcfd3de}
        anchor={0.5}
        x={cx}
        y={panelY + panelH / 2}
      />
    </>
  );

  return (
    <PixiContainer label={OVERLAY_PANEL_LABEL}>
      {/* Portrait stays modal; landscape/desktop has no backdrop. */}
      {isSheet && <OverlayScrim />}

      {isSheet ? panel : <DesignStage>{panel}</DesignStage>}
    </PixiContainer>
  );
}

export default InfoScreen;
