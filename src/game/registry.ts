import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export interface GameEntry {
  /** Human-readable name (for a lobby, titles, etc.). */
  title: string;
  /** The game's screen, code-split so only the opened game's chunk loads. */
  Screen: LazyExoticComponent<ComponentType>;
}

/**
 * Registry of all games. The KEY is the game id — and it must equal the asset bundle name used by
 * the loader (`loadGame(id)` loads the `${id}` / `${id}-preload` bundles). So one id drives both a
 * game's assets and which screen renders. Add a new game with a single entry here.
 */
export const GAMES = {
  "fortune-teller-trove": {
    title: "Fortune Teller Trove",
    Screen: lazy(() => import("./fortune-teller-trove/GameScreen")),
  },
} satisfies Record<string, GameEntry>;

export type GameId = keyof typeof GAMES;

/** True if the given string is a known game id. */
export function isGameId(id: string): id is GameId {
  return id in GAMES;
}
