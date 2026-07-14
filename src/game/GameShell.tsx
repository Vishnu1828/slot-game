import { useEffect, useRef, useState } from "react";
import { initAssets, loadAssets, loadGame, unloadGame } from "../assets/loader";
import LoadingScreen, { LOADING_FONT } from "./LoadingScreen";
import PixiNavigation from "@/navigation/PixiNavigation";
import type { GameId } from "./registry";

function dismissSplash() {
  const el = document.getElementById("app-splash");
  if (!el) return;
  el.classList.add("hide");
  el.addEventListener("transitionend", () => el.remove(), { once: true });
}

export interface GameShellProps {
  game: GameId;
}

/**
 * Asset-load gate for a game. Loads `common` + the game's bundle, shows the loading screen until
 * ready, then renders it. On switching games it UNLOADS the previous game's bundle first, so only
 * the active game's assets are resident — this both frees memory and keeps atlas frame names (e.g.
 * `spin_disabled`, shared across themes) unambiguous, since only one game's sheet is ever loaded.
 */
export function GameShell({ game }: GameShellProps) {
  // The game whose bundle is fully loaded (only ever the previous one after a *completed* load, so
  // we never unload a bundle that's still loading — StrictMode-safe).
  const loadedRef = useRef<GameId | null>(null);
  const [loadedGame, setLoadedGame] = useState<GameId | null>(null);
  const [progress, setProgress] = useState(0);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let alive = true;
    setProgress(0);
    (async () => {
      await initAssets();
      if (!alive) return;
      await loadAssets([`${LOADING_FONT}.fnt`]);
      if (!alive) return;
      dismissSplash();
      setBooted(true);

      // Switching games: free the previous one first (kept 'common' resident). `loadedRef` is only
      // set after a load finishes, so we never unload an in-flight bundle.
      const prev = loadedRef.current;
      if (prev && prev !== game) {
        await unloadGame(prev);
        if (!alive) return;
      }

      await loadGame(game, (p) => {
        if (alive) setProgress(p);
      });
      if (!alive) return;

      loadedRef.current = game;
      setLoadedGame(game);
    })();
    return () => {
      alive = false;
    };
  }, [game]);

  if (!booted) return null; // splash overlay covers this window
  // Render the game only once the CURRENT game is the loaded one — avoids showing a game screen
  // whose assets aren't (yet) loaded (e.g. mid-switch).
  if (loadedGame === game) return <PixiNavigation game={game} />;
  return <LoadingScreen progress={progress} />;
}

export default GameShell;
