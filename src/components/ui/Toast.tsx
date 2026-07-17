import { useRef } from "react";
import { useTick } from "@pixi/react";
import type { Container, Ticker } from "pixi.js";
import PixiContainer from "../pixi/PixiContainer";
import PixiBitmapText from "../pixi/PixiBitmapText";
import { PixiSprite } from "../pixi/PixiSprite";
import { PixiNineSliceSprite } from "../pixi/PixiNineSliceSprite";
import DesignStage from "../pixi/DesignStage";
import { useStage } from "@/hooks/useStage";
import { commonTheme } from "@/constants/commonTheme";
import { measureBitmapText } from "@/utils/measureBitmapText";

export interface ToastProps {
  message: string;
  /** Optional icon alias — rendered above the text only when provided. */
  icon?: string;
  /** Visible hold time (ms) before fade-out. Default 2000. */
  durationMs?: number;
  /** Called once the fade-out completes (host uses this to clear the toast). */
  onDone?: () => void;
}

const FADE_IN = 180;
const FADE_OUT = 350;

// Per-mode sizing. `yFactor` = vertical center of the toast as a fraction of screen height.
const MODE = {
  portrait: {
    textSize: 16,
    iconSize: 30,
    padX: 26,
    padY: 18,
    iconGap: 4,
    yFactor: 0.42,
  },
  "mobile-landscape": {
    textSize: 16,
    iconSize: 26,
    padX: 24,
    padY: 14,
    iconGap: 4,
    yFactor: 0.4,
  },
  desktop: {
    textSize: 20,
    iconSize: 34,
    padX: 40,
    padY: 18,
    iconGap: 4,
    yFactor: 0.42,
  },
} as const;

/**
 * Reusable transient toast: a `popup_message_container` panel (sized to its content) with an
 * optional icon above a single line of text. Fades in, holds for `durationMs`, fades out, then
 * calls `onDone`. Non-interactive (clicks pass through to the game). Drive it via `useToastStore`.
 */
export function Toast({
  message,
  icon,
  durationMs = 2000,
  onDone,
}: ToastProps) {
  const { w, h, mode } = useStage();
  const m = MODE[mode];

  const containerRef = useRef<Container>(null);
  const elapsed = useRef(0);
  const done = useRef(false);
  const lifetime = FADE_IN + durationMs + FADE_OUT;

  // Drive the fade by mutating the container's alpha directly each frame (no React state → no
  // per-frame re-render / tick re-registration), so it reliably ramps to a SOLID 1 and holds there.
  useTick((ticker: Ticker) => {
    const c = containerRef.current;
    if (!c || done.current) return;
    elapsed.current += ticker.deltaMS;
    const t = elapsed.current;

    if (t < FADE_IN) c.alpha = t / FADE_IN;
    else if (t < FADE_IN + durationMs) c.alpha = 1;
    else if (t < lifetime) c.alpha = 1 - (t - FADE_IN - durationMs) / FADE_OUT;
    else c.alpha = 0;

    if (t >= lifetime) {
      done.current = true;
      onDone?.();
    }
  });

  // Size the panel to its content (text width + optional icon block).
  const t = measureBitmapText(
    message,
    commonTheme.fonts.alexandria_semibold,
    m.textSize,
  );
  const hasIcon = !!icon;
  const panelW = t.w + 2 * m.padX;
  const panelH = m.padY + (hasIcon ? m.iconSize + m.iconGap : 0) + t.h + m.padY;

  const panelX = (w - panelW) / 2;
  const panelY = h * m.yFactor - panelH / 2;
  const cx = w / 2;
  const textTopY = panelY + m.padY + (hasIcon ? m.iconSize + m.iconGap : 0);

  const insetH = Math.min(56, Math.floor(panelW / 2) - 1);
  const insetV = Math.min(56, Math.floor(panelH / 2) - 1);
  return (
    <DesignStage>
    <PixiContainer ref={containerRef} alpha={0} eventMode="none">
      <PixiNineSliceSprite
        texture={commonTheme.audio.panel}
        x={panelX}
        y={panelY}
        width={panelW}
        height={panelH}
        leftWidth={insetH}
        rightWidth={insetH}
        topHeight={insetV}
        bottomHeight={insetV}
      />

      {hasIcon && (
        <PixiSprite
          texture={icon as string}
          anchor={0.5}
          width={m.iconSize}
          height={m.iconSize}
          x={cx}
          y={panelY + m.padY + m.iconSize / 2}
        />
      )}

      <PixiBitmapText
        text={message}
        font={commonTheme.fonts.alexandria_semibold}
        size={m.textSize}
        tint={0xffffff}
        anchor={{ x: 0.5, y: 0 }}
        x={cx}
        y={textTopY}
      />
    </PixiContainer>
    </DesignStage>
  );
}

export default Toast;
