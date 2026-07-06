import { create } from 'zustand'

export type ScreenID = 'game'

export type OverlayID = | 'settings' | 'quit' | 'info' | 'inactive' | 'balance' | 'repeat-insufficient' | 'none'

interface NavigationState {
  currentScreen: ScreenID;
  activeOverlay: OverlayID;
  setScreen: (screen: ScreenID) => void;
  showOverlay: (overlay: OverlayID) => void;
  hideOverlay: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentScreen: "game",
  activeOverlay: "none",
  setScreen: (screen) => set({ currentScreen: screen }),
  showOverlay: (overlay) => set({ activeOverlay: overlay }),
  hideOverlay: () => set({ activeOverlay: "none" }),
}));
