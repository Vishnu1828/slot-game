import { extend } from "@pixi/react";
import { Graphics } from "pixi.js";
import PixiContainer from "../pixi/PixiContainer";
import PixiBitmapText from "../pixi/PixiBitmapText";
import { PixiNineSliceSprite } from "../pixi/PixiNineSliceSprite";
import IconButton from "./IconButton";
import Button from "./Button";
import SegmentedTabs, { type SegmentedOption } from "./SegmentedTabs";
import Stepper from "./Stepper";
import { useScreen } from "@/hooks/useScreen";
import { commonTheme } from "@/constants/commonTheme";
import {
  useGameControlsStore,
  MIN_AUTOSPIN,
  MAX_AUTOSPIN,
  type SpeedLevel,
} from "@/store/useGameControlsStore";

// <pixiGraphics> for the dim backdrop + header divider.
extend({ Graphics });

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const MODE = {
  portrait: {
    closeIconPad: 12,
    pad: 50,
    headerH: 65,
    close: 18,
    title: 22,
    label: 16,
    tabH: 46,
    tabFont: 16,
    stepH: 48,
    stepBtn: 44,
    valueFont: 18,
    labelGap: 16,
    sectionGap: 54,
    startH: 52,
    startFont: 18,
  },
  "mobile-landscape": {
    closeIconPad: 12,
    pad: 50,
    headerH: 40,
    close: 14,
    title: 18,
    label: 13,
    tabH: 34,
    tabFont: 13,
    stepH: 36,
    stepBtn: 34,
    valueFont: 15,
    labelGap: 12,
    sectionGap: 26,
    startH: 40,
    startFont: 14,
  },
  desktop: {
    closeIconPad: 12,
    pad: 70,
    headerH: 65,
    close: 18,
    title: 22,
    label: 16,
    tabH: 46,
    tabFont: 16,
    stepH: 48,
    stepBtn: 44,
    valueFont: 18,
    labelGap: 16,
    sectionGap: 36,
    startH: 52,
    startFont: 18,
  },
} as const;

const SPEED_OPTIONS: SegmentedOption<SpeedLevel>[] = [
  { label: "Normal", value: 1 },
  { label: "Fast", value: 2 },
  { label: "Extra fast", value: 3 },
];

const SKIP_OPTIONS: SegmentedOption<boolean>[] = [
  { label: "YES", value: true },
  { label: "NO", value: false },
];

export interface AutospinScreenProps {
  onClose: () => void;
}

/**
 * Autospin settings drawer (same skeleton as InfoScreen): full-screen in portrait, right-side
 * `menu_container` drawer otherwise. Body = Spin speed selector, Skip screens selector, Number of
 * autospins stepper, and a START AUTOSPIN button. State lives in useGameControlsStore.
 */
export function AutospinScreen({ onClose }: AutospinScreenProps) {
  const { w, h, mode } = useScreen();
  const cfg = MODE[mode];

  const speed = useGameControlsStore((s) => s.speed);
  const setSpeed = useGameControlsStore((s) => s.setSpeed);
  const skipScreens = useGameControlsStore((s) => s.skipScreens);
  const setSkipScreens = useGameControlsStore((s) => s.setSkipScreens);
  const autospinCount = useGameControlsStore((s) => s.autospinCount);
  const increaseAutospin = useGameControlsStore((s) => s.increaseAutospin);
  const decreaseAutospin = useGameControlsStore((s) => s.decreaseAutospin);
  const setAutoplay = useGameControlsStore((s) => s.setAutoplay);

  const panelW = mode === "portrait" ? w : clamp(w * 0.3, 320, 460);
  const panelX = w - panelW;
  const innerX = panelX + cfg.pad;
  const innerW = panelW - 2 * cfg.pad;
  const cx = panelX + panelW / 2;

  // Vertical stack of labelled sections, from below the header down.
  let cy = cfg.headerH + cfg.sectionGap;
  const label = (text: string) => {
    const el = (
      <PixiBitmapText
        key={text}
        text={text}
        font={commonTheme.fonts.alexandria_regular}
        size={cfg.label}
        tint={0xcfd3de}
        anchor={{ x: 0, y: 0 }}
        x={innerX}
        y={cy}
      />
    );
    cy += cfg.label + cfg.labelGap;
    return el;
  };

  const speedLabel = label("Spin speed");
  const speedTabsY = cy;
  cy += cfg.tabH + cfg.sectionGap;

  const skipLabel = label("Skip screens");
  const skipTabsY = cy;
  cy += cfg.tabH + cfg.sectionGap;

  const countLabel = label("Number of autospins");
  const stepY = cy;
  cy += cfg.stepH + cfg.sectionGap;

  const startY = cy + cfg.startH / 2;

  const startAutospin = () => {
    setAutoplay(true);
    onClose();
  };

  return (
    <PixiContainer>
      {/* Dim backdrop */}
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.rect(0, 0, w, h).fill({ color: 0x05070f, alpha: 0.55 });
        }}
      />

      {/* Panel background (blocks click-through) */}
      <PixiNineSliceSprite
        texture={commonTheme.overlay.container}
        x={panelX}
        y={0}
        width={panelW}
        height={h}
        eventMode="static"
      />

      {/* Header: close + centered title + divider */}
      <IconButton
        idle={commonTheme.overlay.close}
        size={cfg.close}
        x={panelX + cfg.closeIconPad}
        y={(cfg.headerH - cfg.close) / 1.7}
        onPress={onClose}
      />
      <PixiBitmapText
        text="AUTOSPIN SETTINGS"
        font={commonTheme.fonts.alexandria_semibold}
        size={cfg.title}
        tint={0xdfe3ee}
        anchor={0.5}
        x={cx}
        y={cfg.headerH / 2}
      />

      {/* Body */}
      {speedLabel}
      <SegmentedTabs
        options={SPEED_OPTIONS}
        value={speed}
        onChange={setSpeed}
        x={innerX}
        y={speedTabsY}
        width={innerW}
        height={cfg.tabH}
        textSize={cfg.tabFont}
      />

      {skipLabel}
      <SegmentedTabs
        options={SKIP_OPTIONS}
        value={skipScreens}
        onChange={setSkipScreens}
        x={innerX}
        y={skipTabsY}
        width={innerW}
        height={cfg.tabH}
        textSize={cfg.tabFont}
      />

      {countLabel}
      <Stepper
        value={autospinCount}
        onDecrease={decreaseAutospin}
        onIncrease={increaseAutospin}
        x={innerX}
        y={stepY}
        width={innerW}
        height={cfg.stepH}
        btnSize={cfg.stepBtn}
        decDisabled={autospinCount <= MIN_AUTOSPIN}
        incDisabled={autospinCount >= MAX_AUTOSPIN}
        textSize={cfg.valueFont}
      />

      <Button
        label="START AUTOSPIN"
        x={cx}
        y={startY}
        height={cfg.startH}
        minWidth={innerW}
        textSize={cfg.startFont}
        onPress={startAutospin}
      />
    </PixiContainer>
  );
}

export default AutospinScreen;
