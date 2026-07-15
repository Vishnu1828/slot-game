import SettingsDrawer from "./SettingsDrawer";
import SegmentedTabs, { type SegmentedOption } from "./SegmentedTabs";
import Stepper from "./Stepper";
import {
  useGameControlsStore,
  MIN_AUTOSPIN,
  MAX_AUTOSPIN,
  type SpeedLevel,
} from "@/store/useGameControlsStore";

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
 * Autospin settings: Spin speed selector, Skip screens selector, Number of autospins stepper, and a
 * START AUTOSPIN button. All chrome/layout lives in SettingsDrawer; this just declares the rows.
 */
export function AutospinScreen({ onClose }: AutospinScreenProps) {
  const speed = useGameControlsStore((s) => s.speed);
  const setSpeed = useGameControlsStore((s) => s.setSpeed);
  const skipScreens = useGameControlsStore((s) => s.skipScreens);
  const setSkipScreens = useGameControlsStore((s) => s.setSkipScreens);
  const autospinCount = useGameControlsStore((s) => s.autospinCount);
  const increaseAutospin = useGameControlsStore((s) => s.increaseAutospin);
  const decreaseAutospin = useGameControlsStore((s) => s.decreaseAutospin);
  const setAutoplay = useGameControlsStore((s) => s.setAutoplay);

  return (
    <SettingsDrawer
      title="AUTOSPIN SETTINGS"
      onClose={onClose}
      footer={{
        label: "START AUTOSPIN",
        onPress: () => {
          setAutoplay(true);
          onClose();
        },
      }}
      sections={[
        {
          label: "Spin speed",
          render: (r) => (
            <SegmentedTabs
              options={SPEED_OPTIONS}
              value={speed}
              onChange={setSpeed}
              {...r}
            />
          ),
        },
        {
          label: "Skip screens",
          render: (r) => (
            <SegmentedTabs
              options={SKIP_OPTIONS}
              value={skipScreens}
              onChange={setSkipScreens}
              {...r}
            />
          ),
        },
        {
          label: "Number of autospins",
          render: (r) => (
            <Stepper
              value={autospinCount}
              onDecrease={decreaseAutospin}
              onIncrease={increaseAutospin}
              decDisabled={autospinCount <= MIN_AUTOSPIN}
              incDisabled={autospinCount >= MAX_AUTOSPIN}
              {...r}
            />
          ),
        },
      ]}
    />
  );
}

export default AutospinScreen;
