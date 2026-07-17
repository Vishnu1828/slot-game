import { commonTheme } from "@/constants/commonTheme";
import PixiContainer from "../pixi/PixiContainer";
import PixiBitmapText from "../pixi/PixiBitmapText";
import { PixiSprite } from "../pixi/PixiSprite";
import { useStage } from "@/hooks/useStage";
import { BAR_H } from "@/constants/footer";
import { measureBitmapText } from "@/utils/measureBitmapText";

// Text size + gap above the footer, per layout mode.
const SIZE = { portrait: 20, "mobile-landscape": 18, desktop: 24 } as const;
const GAP_ABOVE_FOOTER = {
  portrait: 30,
  "mobile-landscape": -18,
  desktop: 24,
} as const;
const PART_GAP = 10; // gap between message / icon / detail in a win row

export interface GameStateProps {
  /** Main status line, e.g. "PLACE YOUR BET!" or "YOU WON $2". */
  message?: string;
  /** Optional symbol icon (win rows), shown between message and detail. */
  icon?: string;
  /** Optional secondary line, e.g. "LINE 2 PAYS $2". */
  detail?: string;
}

/**
 * Game status line shown centered just above the footer (all modes). Renders either a single
 * message ("PLACE YOUR BET!") or a win row: message + optional symbol icon + detail
 * ("YOU WON $2 [icon] LINE 2 PAYS $2"). The whole row is measured and centered on the screen.
 */
export function GameState({
  message = "PLACE YOUR BET!",
  icon,
  detail,
}: GameStateProps) {
  const { w, h, mode } = useStage();
  const size = SIZE[mode];
  const bold = commonTheme.fonts.alexandria_semibold;
  const regular = commonTheme.fonts.alexandria_regular;
  const iconSize = size * 1.4;

  // Measure each part so the whole row can be centered at w/2.
  const mW = measureBitmapText(message, bold, size).w;
  const dW = detail ? measureBitmapText(detail, regular, size).w : 0;
  const rowW =
    mW + (icon ? PART_GAP + iconSize : 0) + (detail ? PART_GAP + dW : 0);

  // Row container: left edge centered, vertical center a fixed gap above the footer top.
  const rowX = w / 2 - rowW / 2;
  const rowY = h - BAR_H - GAP_ABOVE_FOOTER[mode];

  // Local x of each part (children are left/middle anchored inside the row container).
  const iconX = mW + PART_GAP;
  const detailX = mW + (icon ? PART_GAP + iconSize : 0) + PART_GAP;

  return (
    <PixiContainer x={rowX} y={rowY}>
      <PixiBitmapText
        text={message}
        font={bold}
        size={size}
        tint={0xffffff}
        anchor={{ x: 0, y: 0.5 }}
        x={0}
        y={0}
      />
      {icon && (
        <PixiSprite
          texture={icon}
          width={iconSize}
          height={iconSize}
          anchor={{ x: 0, y: 0.5 }}
          x={iconX}
          y={0}
        />
      )}
      {detail && (
        <PixiBitmapText
          text={detail}
          font={regular}
          size={size}
          tint={0xffffff}
          anchor={{ x: 0, y: 0.5 }}
          x={detailX}
          y={0}
        />
      )}
    </PixiContainer>
  );
}

export default GameState;
