import { create } from "zustand";
import { audio } from "../utils/audio";

/** Volume the game starts at (0..1). */
export const DEFAULT_VOLUME = 0.7;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface SettingsState {
  /** UI volume 0..1; the audio engine (utils/audio) is the actual authority. */
  volume: number;
  audioPanelOpen: boolean;
  /** Set volume and apply it to the engine (sets master volume + mutes at 0). */
  setVolume: (v: number) => void;
  /** Icon toggle: mute (0) when audible, else back to full (1). */
  toggleMute: () => void;
  toggleAudioPanel: () => void;
  /** Push the current volume into the engine (call once at startup). */
  initAudio: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  volume: DEFAULT_VOLUME,
  audioPanelOpen: false,
  setVolume: (v) => {
    const volume = clamp01(v);
    audio.setMasterVolume(volume); // sets sound.volumeAll and mutes at 0 / unmutes above 0
    set({ volume });
  },
  toggleMute: () => get().setVolume(get().volume > 0 ? 0 : 1),
  toggleAudioPanel: () => set((s) => ({ audioPanelOpen: !s.audioPanelOpen })),
  initAudio: () => audio.setMasterVolume(get().volume),
}));
