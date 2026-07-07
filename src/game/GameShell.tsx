import { useEffect, useState } from "react";
import { initAssets, loadAssets, loadGame } from "../assets/loader";
import LoadingScreen, { LOADING_FONT } from "./LoadingScreen";
import PixiNavigation from "@/navigation/PixiNavigation";
import type { GameId } from "./registry";

type Phase = "preload" | "loading" | "ready";

function dismissSplash() {
  const el = document.getElementById("app-splash");
  if (!el) return;
  el.classList.add("hide");
  el.addEventListener("transitionend", () => el.remove(), { once: true });
}

export interface GameShellProps {
  game: GameId;
}

export function GameShell({ game }: GameShellProps) {
  const [phase, setPhase] = useState<Phase>("preload");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      await initAssets();
      if (!alive) return;
      await loadAssets([`${LOADING_FONT}.fnt`]);
      if (!alive) return;
      dismissSplash();
      setPhase("loading");

      await loadGame(game, (p) => {
        if (alive) setProgress(p);
      });
      if (!alive) return;

      setPhase("ready");
    })();
    return () => {
      alive = false;
    };
  }, [game]);

  if (phase === "preload") return null;
  if (phase === "ready") return <PixiNavigation game={game} />;
  return <LoadingScreen progress={progress} />;
}

export default GameShell;
