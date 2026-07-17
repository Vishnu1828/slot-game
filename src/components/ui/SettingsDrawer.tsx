import type { ReactNode } from "react";
import { extend } from "@pixi/react";
import { Graphics } from "pixi.js";
import PixiContainer from "../pixi/PixiContainer";
import PixiBitmapText from "../pixi/PixiBitmapText";
import { PixiNineSliceSprite } from "../pixi/PixiNineSliceSprite";
import IconButton from "./IconButton";
import Button from "./Button";
import DesignStage from "../pixi/DesignStage";
import OverlayScrim from "../pixi/OverlayScrim";
import { useStage } from "@/hooks/useStage";
import { commonTheme } from "@/constants/commonTheme";

// <pixiGraphics> for the rounded-top sheet + header divider (the backdrop is <OverlayScrim>).
extend({ Graphics });

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// Portrait bottom-sheet background: rounded TOP corners only (matches `menu_container`'s fill).
const SHEET_RADIUS = 16;
const SHEET_BG = 0x020617;

// Per-mode sizing for the shared drawer chrome + rows.
const MODE = {
  portrait: {
    pad: 50, headerH: 50, closeIconPad: 12, close: 18, title: 22,
    label: 16, controlFont: 16, rowH: 48, labelGap: 14, sectionGap: 30,
    footerH: 52, footerFont: 18,
  },
  "mobile-landscape": {
    pad: 40, headerH: 40, closeIconPad: 12, close: 14, title: 16,
    label: 13, controlFont: 13, rowH: 36, labelGap: 10, sectionGap: 18,
    footerH: 40, footerFont: 14,
  },
  desktop: {
    pad: 70, headerH: 65, closeIconPad: 12, close: 18, title: 22,
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
 * Owns ALL the chrome + layout: dim backdrop, panel background (portrait = rounded-top bottom sheet,
 * landscape/desktop = full-height right-side `menu_container` drawer), close button, title, header
 * divider, the labelled vertical stack of `sections`, and the footer button. Each section renders its
 * control into the rect this shell computes, so the screens only declare their rows + a footer.
 */
export function SettingsDrawer({
  title,
  onClose,
  sections,
  footer,
}: SettingsDrawerProps) {
  const { w, h, mode } = useStage();
  const cfg = MODE[mode];

  // Portrait = bottom sheet (full width, anchored to the bottom, sized to content);
  // landscape/desktop = full-height right-side drawer.
  const isSheet = mode === "portrait";
  const panelW = isSheet ? w : clamp(w * 0.3, 320, 460);
  const panelX = isSheet ? 0 : w - panelW;
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
  const panelH = isSheet ? contentH : h;
  const panelY = isSheet ? h - panelH : 0;

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

  return (
    <PixiContainer>
      {/* Dim backdrop (real screen) */}
      <OverlayScrim alpha={0.55} />

      {/* Scaled design-canvas content */}
      <DesignStage>
      {/* Panel background (blocks click-through). Portrait sheet is drawn `SHEET_RADIUS` taller so
          its bottom corners fall off-screen and only the top corners are rounded. */}
      {isSheet ? (
        <pixiGraphics
          eventMode="static"
          draw={(g) => {
            g.clear();
            g.roundRect(
              panelX,
              panelY,
              panelW,
              panelH + SHEET_RADIUS,
              SHEET_RADIUS,
            ).fill({ color: SHEET_BG });
          }}
        />
      ) : (
        <PixiNineSliceSprite
          texture={commonTheme.overlay.container}
          x={panelX}
          y={panelY}
          width={panelW}
          height={panelH}
          eventMode="static"
        />
      )}

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

      {/* Header divider (portrait sheet only) */}
      {isSheet && (
        <pixiGraphics
          draw={(g) => {
            g.clear();
            g.rect(panelX, panelY + cfg.headerH, panelW, 1).fill({
              color: 0xffffff,
              alpha: 0.12,
            });
          }}
        />
      )}

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
      </DesignStage>
    </PixiContainer>
  );
}

export default SettingsDrawer;
