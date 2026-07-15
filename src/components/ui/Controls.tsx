import PixiContainer from "../pixi/PixiContainer";
import IconButton from "./IconButton";
import SpinButton from "./SpinButton";
import { useScreen } from "@/hooks/useScreen";
import { commonTheme } from "@/constants/commonTheme";
import { CONTROLS } from "@/constants/controls";
import { BAR_H } from "@/constants/footer";
import {
  useGameControlsStore,
  MIN_BET,
  MAX_BET,
} from "@/store/useGameControlsStore";
import { useNavigationStore } from "@/store/useNavigationStore";
import type { SpinButtonArt } from "@/types/theme";

export interface ControlsProps {
  /** This game's spin-button art (game-specific; from the theme). */
  spin: SpinButtonArt;
  /** Spin action — reels/spin flow is wired later. */
  onSpin?: () => void;
}

interface Center {
  x: number;
  y: number;
}

/**
 * Self-positioning game control cluster (spin, bet +/-, autoplay, speed, bet-settings). Reads bet/
 * speed/autoplay from useGameControlsStore and lays out per orientation (like Header): portrait =
 * spin centered above the footer with -/+ flanking and the 3 small buttons in a row below;
 * landscape/desktop = spin top-right, -/+ below it, and the 3 small buttons bottom-right.
 *
 * IconButton is top-left anchored, so each is placed by (center - size/2); SpinButton is
 * center-anchored and placed by its center.
 */
export function Controls({ spin, onSpin }: ControlsProps) {
  const { w, h, mode } = useScreen();
  const c = CONTROLS[mode];

  const bet = useGameControlsStore((s) => s.bet);
  const speed = useGameControlsStore((s) => s.speed);
  const autoplay = useGameControlsStore((s) => s.autoplay);
  const increaseBet = useGameControlsStore((s) => s.increaseBet);
  const decreaseBet = useGameControlsStore((s) => s.decreaseBet);
  const cycleSpeed = useGameControlsStore((s) => s.cycleSpeed);
  const showOverlay = useNavigationStore((s) => s.showOverlay);

  const speedArt = commonTheme.buttons.speed[speed - 1];
  const autoplayArt = commonTheme.buttons.autoplay;
  const betSettingsArt = commonTheme.buttons.betSettings;

  // The 3 small round buttons, left → right: autoplay, speed, bet-settings.
  const smallButtons = [
    {
      idle: autoplayArt.idle,
      hover: autoplayArt.hover,
      pressed: autoplayArt.active, // "active" art shown while held / when engaged
      active: autoplay,
      onPress: () => showOverlay("settings"), // open the Autospin Settings drawer
    },
    {
      idle: speedArt.idle,
      pressed: speedArt.pressed, // no hover art for speed → falls back to idle
      onPress: cycleSpeed,
    },
    {
      idle: betSettingsArt.idle,
      hover: betSettingsArt.hover,
      pressed: betSettingsArt.pressed,
      onPress: () => {}, // TODO: open bet-settings panel (not designed yet)
    },
  ];

  // Cluster geometry (centers), computed per mode.
  let spinC: Center;
  let minusC: Center;
  let plusC: Center;
  let smallCenters: Center[];

  if (mode === "portrait") {
    const smallRowCY = h - BAR_H - c.marginBottom - c.smallBtnHeight / 2;
    const rowW = 3 * c.smallBtnWidth + 2 * c.gap;
    const firstCX = w / 2 - rowW / 2 + c.smallBtnWidth / 2;
    smallCenters = [0, 1, 2].map((i) => ({
      x: firstCX + i * (c.smallBtnWidth + c.gap),
      y: smallRowCY,
    }));

    const spinCY = smallRowCY - c.smallBtnHeight / 2 - c.gap - c.spinSize / 2;
    spinC = { x: w / 2, y: spinCY };
    minusC = {
      x: w / 2 - c.spinSize / 2 - c.gap - c.betBtnSize / 2,
      y: spinCY,
    };
    plusC = {
      x: w / 2 + c.spinSize / 2 + c.gap + c.betBtnSize / 2,
      y: spinCY,
    };
  } else {
    const spinCX = w - c.marginX - c.spinSize / 1.6;
    const spinCY = h * c.spinTopFactor;
    spinC = { x: spinCX, y: spinCY };

    const betCY = spinCY + c.spinSize / 2 + c.gap + c.betBtnSize / 2;
    minusC = { x: spinCX - c.betBtnSize / 2 - c.gap / 2, y: betCY };
    plusC = { x: spinCX + c.betBtnSize / 2 + c.gap / 2, y: betCY };

    const smallCY = betCY + c.betBtnSize / 2 + c.rowGap + c.smallBtnHeight / 2;
    const rightCX = w - c.marginX - c.smallBtnWidth / 2;
    smallCenters = [0, 1, 2].map((i) => ({
      x: rightCX - (2 - i) * (c.smallBtnWidth + c.gap),
      y: smallCY,
    }));
  }

  const topLeft = (center: Center, size: number) => ({
    x: center.x - size / 2,
    y: center.y - size / 2,
  });

  return (
    <PixiContainer>
      <SpinButton
        art={spin}
        x={spinC.x}
        y={spinC.y}
        size={c.spinSize}
        active={autoplay}
        onPress={onSpin}
      />

      <IconButton
        {...commonTheme.buttons.betMinus}
        size={c.betBtnSize}
        {...topLeft(minusC, c.betBtnSize)}
        disabled={bet <= MIN_BET}
        onPress={decreaseBet}
      />
      <IconButton
        {...commonTheme.buttons.betPlus}
        size={c.betBtnSize}
        {...topLeft(plusC, c.betBtnSize)}
        disabled={bet >= MAX_BET}
        onPress={increaseBet}
      />

      {smallButtons.map((b, i) => (
        <IconButton
          key={i}
          idle={b.idle}
          hover={b.hover}
          pressed={b.pressed}
          active={b.active}
          width={c.smallBtnWidth}
          height={c.smallBtnHeight}
          {...topLeft(smallCenters[i], c.smallBtnWidth)}
          onPress={b.onPress}
        />
      ))}
    </PixiContainer>
  );
}

export default Controls;
