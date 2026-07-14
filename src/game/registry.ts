import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { ThemeAssets } from "@/types/theme";
import fortuneTellerTroveTheme from "./fortune-teller-trove/theme";

export interface GameEntry {
  /** Human-readable name (for a lobby, titles, etc.). */
  title: string;
  /** The game's screen, code-split so only the opened game's chunk loads. */
  Screen: LazyExoticComponent<ComponentType>;
  /** Theme asset map (referenced from the game's own theme file — no asset strings live here). */
  theme: ThemeAssets;
}

/**
 * Registry of all games. The KEY is the game id — and it must equal the asset bundle name used by
 * the loader (`loadGame(id)` loads the `${id}` / `${id}-preload` bundles). So one id drives both a
 * game's assets and which screen renders. Add a new game with a single entry here (its theme lives
 * in `<id>/theme.ts`; only reference it below so this file stays a compact manifest).
 */
export const GAMES = {
  "fortune-teller-trove": {
    title: "Fortune Teller Trove",
    Screen: lazy(() => import("./fortune-teller-trove/GameScreen")),
    theme: fortuneTellerTroveTheme,
  },
} satisfies Record<string, GameEntry>;

export type GameId = keyof typeof GAMES;

/** True if the given string is a known game id. */
export function isGameId(id: string): id is GameId {
  return id in GAMES;
}

/** The active game's theme asset map. */
export const getTheme = (id: GameId): ThemeAssets => GAMES[id].theme;
