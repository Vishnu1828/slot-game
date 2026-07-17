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
    alexandria_semibold: "Alexandria_SemiBold",
  },
  footer: { background: "footer" },
  buttons: {
    sound: { idle: "sound_idle", hover: "sound_hover", active: "sound_active" },
    info: { idle: "info_idle", hover: "info_hover", pressed: "info_pressed" },
    exit: { idle: "exit_idle", hover: "exit_hover", pressed: "exit_pressed" },
    // Bet controls (common/ui/betButton atlas).
    betPlus: {
      idle: "increase_bet_idle",
      hover: "increase_bet_hover",
      pressed: "increase_bet_pressed",
    },
    betMinus: {
      idle: "decrease_bet_idle",
      hover: "decrease_bet_hover",
      pressed: "decrease_bet_pressed",
    },
    betSettings: {
      idle: "bet_settings_idle",
      hover: "bet_settings_hover",
      pressed: "bet_settings_pressed",
    },
    // Autoplay toggle (common/ui/speedButton atlas) — active-as-pressed, like `sound`.
    autoplay: {
      idle: "autoplay_idle",
      hover: "autoplay_hover",
      active: "autoplay_active",
    },
    // Speed levels 1..3 (common/ui/speedButton atlas) — index by `level - 1`. Only idle/pressed.
    speed: [
      { idle: "speed_1_idle", pressed: "speed_1_pressed" },
      { idle: "speed_2_idle", pressed: "speed_2_pressed" },
      { idle: "speed_3_idle", pressed: "speed_3_pressed" },
    ],
    // Popup/dialog pill button (common/ui/popupButton atlas) — a text-labelled action button.
    popup: { idle: "button_idle", pressed: "button_pressed" },
  },
  // Segmented-tab pieces (common/ui/tabBox atlas). Tile left+[middle…]+right into one control; the
  // selected segment uses `.active`. `middle` (square) also doubles as a plain value-box background.
  tabs: {
    left: { idle: "box_left_idle", active: "box_left_active" },
    middle: { idle: "box_middle_idle", active: "box_middle_active" },
    right: { idle: "box_right_idle", active: "box_right_active" },
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
  input: {
    idle: "input_field",
  },
  buttonIcons: {
    coins: "coins",
    speed_1: "speed_1",
    speed_2: "speed_2",
    speed_3: "speed_3",
  },
} as const;
