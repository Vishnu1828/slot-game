import PixiContainer from "../pixi/PixiContainer";
import PixiLayout from "../pixi/PixiLayout";
import PixiNineSliceSprite from "../pixi/PixiNineSliceSprite";
import IconButton from "./IconButton";
import StatBlock from "./StatBlock";
import VolumeSlider from "./VolumeSlider";
import { useScreen } from "../../hooks/useScreen";
import { useNavigationStore } from "../../store/useNavigationStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { formatMoney } from "../../utils/format";
import type { FooterProps } from "@/types/footerTypes";
import {
  PAD_X,
  BAR_H,
  LEFT_GAP,
  INSET_X,
  INSET_Y,
  ICON,
  ICON_LARGE,
} from "@/constants/footer";

export function Footer({ balance, totalBet }: FooterProps) {
  const { w, h, portrait } = useScreen();
  const ICON_SIZE = portrait ? ICON : ICON_LARGE;

  const activeOverlay = useNavigationStore((s) => s.activeOverlay);
  const toggleOverlay = useNavigationStore((s) => s.toggleOverlay);
  const audioPanelOpen = useSettingsStore((s) => s.audioPanelOpen);
  const toggleAudioPanel = useSettingsStore((s) => s.toggleAudioPanel);

  return (
    <PixiContainer x={0} y={h - BAR_H}>
      <PixiNineSliceSprite
        texture="footer"
        leftWidth={INSET_X}
        rightWidth={INSET_X}
        topHeight={INSET_Y}
        bottomHeight={INSET_Y}
        width={w}
        height={BAR_H}
      />

      {/* Content row on top of the frame */}
      <PixiLayout
        layout={{
          width: w,
          height: BAR_H,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingLeft: PAD_X,
          paddingRight: PAD_X,
        }}
      >
        {/* Left: stats */}
        <PixiLayout layout={{ flexDirection: "row", gap: LEFT_GAP }}>
          <StatBlock label="Balance" value={formatMoney(balance)} />
          <StatBlock label="Total Bet" value={formatMoney(totalBet)} />
        </PixiLayout>

        {/* Right: controls */}
        <PixiLayout
          layout={{
            flexDirection: "row",
          }}
        >
          <IconButton
            idle="sound_idle"
            hover="sound_hover"
            pressed="sound_active"
            active={audioPanelOpen}
            size={ICON_SIZE}
            layout={{ width: ICON_SIZE, height: ICON_SIZE }}
            onPress={() => {
              toggleAudioPanel();
            }}
          />
          <IconButton
            idle="info_idle"
            hover="info_hover"
            pressed="info_pressed"
            active={activeOverlay === "info"}
            size={ICON_SIZE}
            layout={{ width: ICON_SIZE, height: ICON_SIZE }}
            onPress={() => toggleOverlay("info")}
          />
          <IconButton
            idle="exit_idle"
            hover="exit_hover"
            pressed="exit_pressed"
            active={activeOverlay === "quit"}
            size={ICON_SIZE}
            layout={{ width: ICON_SIZE, height: ICON_SIZE }}
            onPress={() => toggleOverlay("quit")}
          />
        </PixiLayout>
      </PixiLayout>

      {/* Volume panel popup — above the bar, right-aligned near the sound button (offsets tunable) */}
      {audioPanelOpen && <VolumeSlider x={w - 300 - PAD_X} y={-70} />}
    </PixiContainer>
  );
}

export default Footer;
