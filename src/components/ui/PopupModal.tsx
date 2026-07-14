import { useMemo } from "react";
import { extend } from "@pixi/react";
import { Graphics } from "pixi.js";
import PixiContainer from "../pixi/PixiContainer";
import PixiBitmapText from "../pixi/PixiBitmapText";
import { PixiNineSliceSprite } from "../pixi/PixiNineSliceSprite";
import PixiButton, { type ButtonVariant } from "./PixiButton";
import { useScreen } from "@/hooks/useScreen";
import { commonTheme } from "@/constants/commonTheme";
import { measureBitmapText } from "@/utils/measureBitmapText";

// <pixiGraphics> for the dim backdrop only (the panel is now the `popup_message_container` asset).
extend({ Graphics });

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export interface PopupButton {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
}

export interface PopupModalProps {
  title: string;
  /** Optional supporting line under the title. */
  message?: string;
  /** One or more actions, laid out in a single centered row. */
  buttons: PopupButton[];
}

// Per-mode sizing. `wFactor/wMin/wMax` size the panel width; the rest drive text/padding/buttons.
const MODE = {
  portrait: {
    titleSize: 16,
    bodySize: 14,
    btnH: 52,
    btnFont: 16,
    padX: 16,
    padTop: 16,
    padBottom: 16,
    titleGap: 12,
    btnGap: 18,
    btnRowGap: 14,
    wFactor: 0.86,
    wMin: 300,
    wMax: 460,
  },
  "mobile-landscape": {
    titleSize: 16,
    bodySize: 14,
    btnH: 32,
    btnFont: 12,
    padX: 16,
    padTop: 16,
    padBottom: 16,
    titleGap: 8,
    btnGap: 16,
    btnRowGap: 12,
    wFactor: 0.4,
    wMin: 300,
    wMax: 440,
  },
  desktop: {
    titleSize: 18,
    bodySize: 16,
    btnH: 56,
    btnFont: 18,
    padX: 16,
    padTop: 16,
    padBottom: 18,
    titleGap: 16,
    btnGap: 28,
    btnRowGap: 18,
    wFactor: 0.32,
    wMin: 420,
    wMax: 620,
  },
} as const;

/**
 * Reusable, config-driven modal popup — a centered `popup_message_container` panel with a title, an
 * optional message, and a row of one or more buttons. The title/message word-wrap to the panel's
 * inner width and the panel height is measured to fit them, so text never spills outside the panel
 * (notably in portrait). Adapts to every "module pop" case by passing different text + buttons; the
 * backdrop blocks click-through but does NOT close on tap (the user must choose an action).
 */
export function PopupModal({ title, message, buttons }: PopupModalProps) {
  const { w, h, mode } = useScreen();
  const m = MODE[mode];

  const panelW = clamp(w * m.wFactor, m.wMin, m.wMax);
  const innerW = panelW - 2 * m.padX;
  const hasMsg = !!message;

  // Measure wrapped text (memoized — only recompute when text/width/sizes change).
  const { titleH, bodyH } = useMemo(() => {
    const t = measureBitmapText(
      title,
      commonTheme.fonts.alexandria_semibold,
      m.titleSize,
      innerW,
    );
    const b = hasMsg
      ? measureBitmapText(
          message as string,
          commonTheme.fonts.alexandria_regular,
          m.bodySize,
          innerW,
        )
      : { h: 0 };
    return { titleH: t.h, bodyH: b.h };
  }, [title, message, hasMsg, innerW, m.titleSize, m.bodySize]);

  // Content stack height → panel height, then center the panel on screen.
  const contentH =
    m.padTop +
    titleH +
    (hasMsg ? m.titleGap + bodyH : 0) +
    m.btnGap +
    m.btnH +
    m.padBottom;
  const panelH = contentH;
  const panelX = (w - panelW) / 2;
  const panelY = (h - panelH) / 2;
  const cx = w / 2;

  // Text positions (top-aligned, horizontally centered).
  const titleTopY = panelY + m.padTop;
  const bodyTopY = titleTopY + titleH + m.titleGap;
  const btnY =
    panelY + m.padTop + titleH + (hasMsg ? m.titleGap + bodyH : 0) + m.btnGap;

  // Button row: single button spans the inner width; two+ split it evenly with a gap.
  const n = buttons.length;
  const btnW = n <= 1 ? innerW : (innerW - m.btnRowGap * (n - 1)) / n;

  // Keep nine-slice insets within the panel bounds so the corners never overrun on small panels.
  const insetH = Math.min(56, Math.floor(panelW / 2) - 1);
  const insetV = Math.min(56, Math.floor(panelH / 2) - 1);

  return (
    <PixiContainer>
      {/* Dim backdrop — blocks input to the game beneath; no tap-to-close (must choose an action). */}
      <pixiGraphics
        eventMode="static"
        draw={(g) => {
          g.clear();
          g.rect(0, 0, w, h).fill({ color: 0x05070f, alpha: 0.6 });
        }}
      />

      {/* Panel (asset) */}
      <PixiNineSliceSprite
        texture={commonTheme.overlay.popup}
        x={panelX}
        y={panelY}
        width={panelW}
        height={panelH}
        leftWidth={insetH}
        rightWidth={insetH}
        topHeight={insetV}
        bottomHeight={insetV}
        eventMode="static"
      />

      <PixiBitmapText
        text={title}
        font={commonTheme.fonts.alexandria_semibold}
        size={m.titleSize}
        tint={0xffffff}
        anchor={{ x: 0.5, y: 0 }}
        align="center"
        maxWidth={innerW}
        x={cx}
        y={titleTopY}
      />

      {hasMsg && (
        <PixiBitmapText
          text={message as string}
          font={commonTheme.fonts.alexandria_regular}
          size={m.bodySize}
          tint={0xc7cbd6}
          anchor={{ x: 0.5, y: 0 }}
          align="center"
          maxWidth={innerW}
          x={cx}
          y={bodyTopY}
        />
      )}

      {buttons.map((b, i) => (
        <PixiButton
          key={b.label}
          label={b.label}
          x={panelX + m.padX + i * (btnW + m.btnRowGap)}
          y={btnY}
          width={btnW}
          height={m.btnH}
          textSize={m.btnFont}
          variant={b.variant}
          onPress={b.onPress}
        />
      ))}
    </PixiContainer>
  );
}

export default PopupModal;
