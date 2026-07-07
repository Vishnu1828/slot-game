import { create } from "zustand";
import { sound } from "@pixi/sound";

/** Volume the game starts at (0..1). */
export const DEFAULT_VOLUME = 0.7;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface SettingsState {
  volume: number;
  audioPanelOpen: boolean;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleAudioPanel: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  volume: DEFAULT_VOLUME,
  audioPanelOpen: false,
  setVolume: (v) => {
    const volume = clamp01(v);
    sound.volumeAll = volume;
    set({ volume });
  },
  toggleMute: () => get().setVolume(get().volume > 0 ? 0 : 1),
  toggleAudioPanel: () => set((s) => ({ audioPanelOpen: !s.audioPanelOpen })),
}));
