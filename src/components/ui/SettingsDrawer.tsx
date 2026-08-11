import type { ReactNode } from "react";
import PixiContainer from "../pixi/PixiContainer";
import PixiBitmapText from "../pixi/PixiBitmapText";
import PanelSurface from "../pixi/PanelSurface";
import DesignStage from "../pixi/DesignStage";
import IconButton from "./IconButton";
import Button from "./Button";
import OverlayScrim from "../pixi/OverlayScrim";
import { useScreen } from "@/hooks/useScreen";
import { useStage } from "@/hooks/useStage";
import { OVERLAY_PANEL_LABEL } from "@/hooks/useDismissOnOutsideTap";
import { commonTheme } from "@/constants/commonTheme";
import { BAR_H } from "@/constants/footer";

const SHEET_RADIUS = 16;
const SHEET_BG = 0x020617;
// Landscape/desktop card is slightly see-through so the game still reads behind it.
const CARD_ALPHA = 0.92;

/**
 * Per-mode chrome + row sizing. Landscape/desktop values are DESIGN-canvas units (see DESIGN in
 * constants/design.ts) — <DesignStage> scales them to the real screen exactly like the reel frame,
 * so the card is proportionally identical on every window size and nothing needs re-tuning per
 * breakpoint. `cardW` is the card's fixed design width. Portrait values are real px (full-bleed sheet).
 */
const MODE = {
  portrait: {
    cardW: 0, // unused — the sheet is full-bleed
    pad: 50, headerH: 50, closeIconPad: 12, close: 18, title: 22,
    label: 16, controlFont: 16, rowH: 48, labelGap: 14, sectionGap: 30,
    footerH: 52, footerFont: 18,
  },
  // Design canvas 844x390; minus the footer bar that leaves 338 for the card.
  "mobile-landscape": {
    cardW: 320,
    pad: 28, headerH: 36, closeIconPad: 12, close: 14, title: 16,
    label: 13, controlFont: 13, rowH: 36, labelGap: 8, sectionGap: 12,
    footerH: 36, footerFont: 14,
  },
  // Design canvas 1280x720; minus the footer bar that leaves 668 for the card.
  desktop: {
    cardW: 360,
    pad: 56, headerH: 65, closeIconPad: 12, close: 18, title: 22,
    label: 16, controlFont: 16, rowH: 48, labelGap: 18, sectionGap: 30,
    footerH: 52, footerFont: 18,
  },
} as const;

/** The rect (and derived font) a section should render its control into. */
export interface DrawerRect {
  x: number;
  y: number;
  width: number;
  height: number;
  textSize: number;
}

export interface DrawerSection {
  label: string;
  /** Row height; defaults to the mode's `rowH`. */
  height?: number;
  render: (rect: DrawerRect) => ReactNode;
}

export interface SettingsDrawerProps {
  title: string;
  onClose: () => void;
  sections: DrawerSection[];
  footer: { label: string; onPress: () => void };
}

/**
 * Shared settings-drawer shell for AutospinScreen / BettingScreen (and future settings panels).
 * Owns ALL the chrome + layout: panel background (portrait = dimmed, blocking, rounded-top bottom
 * sheet on the REAL screen; landscape/desktop = a centred, translucent, NON-blocking card laid out in
 * the DESIGN canvas and uniformly scaled by <DesignStage>, so it grows and shrinks with the reel frame
 * — see useDismissOnOutsideTap), close button, title, header divider, the labelled vertical stack of
 * `sections`, and the footer button. Each section renders its control into the rect this shell
 * computes, so the screens only declare their rows + a footer.
 */
export function SettingsDrawer({
  title,
  onClose,
  sections,
  footer,
}: SettingsDrawerProps) {
  const screen = useScreen();
  const stage = useStage();
  const { mode } = stage;
  const cfg = MODE[mode];

  // Portrait sheet is full-bleed chrome → real screen coords. The card lives in the design canvas.
  const isSheet = mode === "portrait";
  const w = isSheet ? screen.w : stage.w;
  const h = isSheet ? screen.h : stage.h;

  const panelW = isSheet ? w : cfg.cardW;
  const panelX = isSheet ? 0 : (w - panelW) / 2;
  const innerX = panelX + cfg.pad;
  const innerW = panelW - 2 * cfg.pad;
  const cx = panelX + panelW / 2;

  const topGap = cfg.sectionGap / 2;
  const bottomGap = cfg.sectionGap;
  const rowHeights = sections.map((s) => s.height ?? cfg.rowH);
  const stackH = rowHeights.reduce(
    (sum, rh) => sum + cfg.label + cfg.labelGap + rh + cfg.sectionGap,
    0,
  );
  const contentH =
    cfg.headerH + topGap + stackH + cfg.footerH + bottomGap;
  const panelH = contentH;
  // Sheet sits on the bottom edge. The card centres in the band ABOVE the footer bar (BAR_H is
  // treated as design units here, same as the Controls cluster does).
  const panelY = isSheet ? h - panelH : (h - BAR_H - panelH) / 2;

  // Lay out the labelled rows top→bottom (cy accumulates through the map).
  let cy = panelY + cfg.headerH + topGap;
  const sectionEls = sections.map((s, i) => {
    const labelY = cy;
    cy += cfg.label + cfg.labelGap;
    const rect: DrawerRect = {
      x: innerX,
      y: cy,
      width: innerW,
      height: rowHeights[i],
      textSize: cfg.controlFont,
    };
    cy += rowHeights[i] + cfg.sectionGap;
    return (
      <PixiContainer key={s.label}>
        <PixiBitmapText
          text={s.label}
          font={commonTheme.fonts.alexandria_regular}
          size={cfg.label}
          tint={0xcfd3de}
          anchor={{ x: 0, y: 0 }}
          x={innerX}
          y={labelY}
        />
        {s.render(rect)}
      </PixiContainer>
    );
  });
  const footerY = cy + cfg.footerH / 2;

  const panel = (
    <>
      {/* Panel background (blocks click-through). The portrait sheet is drawn `SHEET_RADIUS` taller
          so its bottom corners fall off-screen and only the top corners round. */}
      <PanelSurface
        x={panelX}
        y={panelY}
        width={panelW}
        height={isSheet ? panelH + SHEET_RADIUS : panelH}
        radius={SHEET_RADIUS}
        color={SHEET_BG}
        alpha={isSheet ? 1 : CARD_ALPHA}
        dividerY={panelY + cfg.headerH}
      />

      {/* Header: close (top-left) + centered title */}
      <IconButton
        idle={commonTheme.overlay.close}
        size={cfg.close}
        x={panelX + cfg.closeIconPad}
        y={panelY + (cfg.headerH - cfg.close) / 2}
        onPress={onClose}
      />
      <PixiBitmapText
        text={title}
        font={commonTheme.fonts.alexandria_semibold}
        size={cfg.title}
        tint={0xdfe3ee}
        anchor={0.5}
        x={cx}
        y={panelY + cfg.headerH / 2}
      />

      {/* Body rows */}
      {sectionEls}

      <Button
        label={footer.label}
        x={cx}
        y={footerY}
        height={cfg.footerH}
        minWidth={innerW}
        textSize={cfg.footerFont}
        onPress={footer.onPress}
      />
    </>
  );

  return (
    <PixiContainer label={OVERLAY_PANEL_LABEL}>
      {/* Portrait stays modal: dim + block the game behind the sheet. Landscape/desktop has no
          backdrop at all — the game stays lit and playable underneath. */}
      {isSheet && <OverlayScrim />}

      {isSheet ? panel : <DesignStage>{panel}</DesignStage>}
    </PixiContainer>
  );
}

export default SettingsDrawer;
