import { useRef, useState } from "react";
import { extend } from "@pixi/react";
import {
  Assets,
  Container,
  Sprite,
  Texture,
  type FederatedPointerEvent,
} from "pixi.js";
import { useSettingsStore } from "../../store/useSettingsStore";
import { commonTheme } from "@/constants/commonTheme";

// Raw <pixiContainer>/<pixiSprite> so we can attach pointer/drag handlers.
extend({ Container, Sprite });

const TEX = {
  panelW: 533,
  panelH: 97,
  iconW: 45,
  iconH: 33,
  knob: 49,
  trackH: 11,
};
const PAD_LEFT = 34;
const ICON_GAP = 24;
const PAD_RIGHT = 40;

const PANEL_W = 300;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const getTex = (alias: string) => Assets.get<Texture>(alias);

export interface VolumeSliderProps {
  x?: number;
  y?: number;
}

export function VolumeSlider({ x = 0, y = 0 }: VolumeSliderProps) {
  const volume = useSettingsStore((s) => s.volume);
  const setVolume = useSettingsStore((s) => s.setVolume);
  const toggleMute = useSettingsStore((s) => s.toggleMute);

  const containerRef = useRef<Container>(null);
  const [dragging, setDragging] = useState(false);

  const panelTex = getTex(commonTheme.audio.panel);
  const trackTex = getTex(commonTheme.audio.track);
  const fillTex = getTex(commonTheme.audio.fill);
  const knobTex = getTex(commonTheme.audio.knob);
  const iconTex = getTex(volume === 0 ? commonTheme.audio.muteIcon : commonTheme.audio.icon);
  if (!panelTex || !trackTex || !knobTex) return null;

  const displayW = PANEL_W;
  const f = displayW / TEX.panelW;
  const displayH = TEX.panelH * f;
  const cy = displayH / 2;

  const iconW = TEX.iconW * f;
  const iconH = TEX.iconH * f;
  const knobSize = TEX.knob * f;
  const trackH = TEX.trackH * f;
  const iconCenterX = (PAD_LEFT + TEX.iconW / 2) * f;
  const trackStartX = (PAD_LEFT + TEX.iconW + ICON_GAP) * f;
  const trackW = (TEX.panelW - PAD_LEFT - TEX.iconW - ICON_GAP - PAD_RIGHT) * f;

  // Inset the knob's travel by its radius so it never overflows the track ends — at volume 0 its
  // left edge sits at the track start (keeping the gap from the icon), at 1 its right edge at the end.
  const knobR = knobSize / 2;
  const travel = Math.max(0, trackW - 2 * knobR);
  const fillW = volume * trackW;
  const knobX = trackStartX + knobR + volume * travel;

  const setVolumeFromEvent = (e: FederatedPointerEvent) => {
    const c = containerRef.current;
    if (!c || travel <= 0) return;
    const local = e.getLocalPosition(c);
    setVolume(clamp01((local.x - trackStartX - knobR) / travel));
  };

  return (
    <pixiContainer
      ref={containerRef}
      x={x}
      y={y}
      eventMode="static"
      onGlobalPointerMove={(e: FederatedPointerEvent) => {
        if (dragging) setVolumeFromEvent(e);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerUpOutside={() => setDragging(false)}
    >
      {/* Panel background */}
      <pixiSprite
        texture={panelTex}
        width={displayW}
        height={displayH}
        eventMode="none"
      />

      {/* Speaker / mute icon */}
      {iconTex && (
        <pixiSprite
          texture={iconTex}
          x={iconCenterX}
          y={cy}
          width={iconW}
          height={iconH}
          anchor={0.5}
          eventMode="static"
          cursor="pointer"
          onPointerTap={() => toggleMute()}
        />
      )}

      {/* Track (click to jump / start drag) */}
      <pixiSprite
        texture={trackTex}
        x={trackStartX}
        y={cy}
        width={trackW}
        height={trackH}
        anchor={{ x: 0, y: 0.5 }}
        eventMode="static"
        cursor="pointer"
        onPointerDown={(e: FederatedPointerEvent) => {
          setDragging(true);
          setVolumeFromEvent(e);
        }}
      />

      {/* Filled portion */}
      {fillW > 0 && fillTex && (
        <pixiSprite
          texture={fillTex}
          x={trackStartX}
          y={cy}
          width={fillW}
          height={trackH}
          anchor={{ x: 0, y: 0.5 }}
          eventMode="none"
        />
      )}

      {/* Knob */}
      <pixiSprite
        texture={knobTex}
        x={knobX}
        y={cy}
        width={knobSize}
        height={knobSize}
        anchor={0.5}
        eventMode="static"
        cursor="pointer"
        onPointerDown={() => setDragging(true)}
      />
    </pixiContainer>
  );
}

export default VolumeSlider;
