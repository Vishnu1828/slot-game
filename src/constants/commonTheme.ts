/**
 * Single source of truth for SHARED (common-bundle) asset aliases — footer icon buttons, footer
 * background, fonts, the volume panel, and common sfx. Components reference these instead of
 * hardcoding alias strings, so swapping a common asset is a one-line change here that updates
 * everywhere. These aliases are bare (not game-scoped): the `common` bundle is unique across games.
 *
 * Per-game art lives in `makeTheme` (game-scoped); this is its shared counterpart.
 */
export const commonTheme = {
  fonts: {
    regular: "Inter_Regular",
    bold: "Inter_Bold",
    alexandria_regular: "Alexandria_Regular",
    alexandria_medium: "Alexandria_Medium",
    alexandria_semibold: "Alexandria_Semibold",
  },
  footer: { background: "footer" },
  buttons: {
    sound: { idle: "sound_idle", hover: "sound_hover", active: "sound_active" },
    info: { idle: "info_idle", hover: "info_hover", pressed: "info_pressed" },
    exit: { idle: "exit_idle", hover: "exit_hover", pressed: "exit_pressed" },
  },
  audio: {
    panel: "audio_panel",
    track: "audio_level",
    fill: "audio_level_fill",
    knob: "audio_knob",
    icon: "audio_icon",
    muteIcon: "audio_mute_icon",
  },
  overlay: {
    container: "menu_container",
    close: "x_button",
    popup: "popup_message_container",
  },
  sfx: { click: "click_spin" },
} as const;
