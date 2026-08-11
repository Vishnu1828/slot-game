import { create } from 'zustand'

export type ScreenID = 'game'

export type OverlayID = | 'settings' | 'bet-settings' | 'quit' | 'info' | 'inactive' | 'balance' | 'repeat-insufficient' | 'none'

/** Overlays that always block the game — the ones built on `PopupModal`, which demand a choice. */
const BLOCKING: ReadonlySet<OverlayID> = new Set<OverlayID>([
  'quit',
  'balance',
  'inactive',
  'repeat-insufficient',
])

/** Drawers: modal in PORTRAIT (a bottom sheet), non-blocking cards in landscape/desktop. */
const DRAWERS: ReadonlySet<OverlayID> = new Set<OverlayID>([
  'settings',
  'bet-settings',
  'info',
])

/**
 * Does this overlay block the game beneath it — and therefore blur it?
 *
 * Lives here, next to `OverlayID`, because the answer has to stay in step with the components that
 * render `<OverlayScrim/>`, and that condition is spread across four call sites. In landscape the
 * drawers are deliberately non-blocking (the game stays playable underneath), so they must NOT blur.
 */
export const isModalOverlay = (overlay: OverlayID, portrait: boolean): boolean =>
  BLOCKING.has(overlay) || (portrait && DRAWERS.has(overlay))

interface NavigationState {
  currentScreen: ScreenID;
  activeOverlay: OverlayID;
  setScreen: (screen: ScreenID) => void;
  showOverlay: (overlay: OverlayID) => void;
  hideOverlay: () => void;
  /** Open the overlay, or close it if it's already the active one (button toggle). */
  toggleOverlay: (overlay: OverlayID) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentScreen: "game",
  activeOverlay: "none",
  setScreen: (screen) => set({ currentScreen: screen }),
  showOverlay: (overlay) => set({ activeOverlay: overlay }),
  hideOverlay: () => set({ activeOverlay: "none" }),
  toggleOverlay: (overlay) =>
    set((s) => ({ activeOverlay: s.activeOverlay === overlay ? "none" : overlay })),
}));
