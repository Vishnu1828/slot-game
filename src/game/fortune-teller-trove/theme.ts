import { makeTheme } from "@/game/theme";

// Loose images (header, backgrounds) are auto-scoped to games/fortune-teller-trove/… by makeTheme.
// Defaults already match this game's layout (ui/logo, images/bg_horizontal, images/bg_vertical), so
// only pass overrides here if a role differs (e.g. custom spin frame names or symbol art).
export default makeTheme("fortune-teller-trove");
