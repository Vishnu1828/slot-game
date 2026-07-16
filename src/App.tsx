import { useEffect } from "react";
import { Application } from "@pixi/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./api/queryClient";
import GameShell from "./game/GameShell";
import type { GameId } from "./game/registry";
import { audio } from "./utils/audio";
import { useSettingsStore } from "./store/useSettingsStore";

// The game to boot. Later this comes from the route / lobby selection (e.g. /games/:gameId).
const GAME: GameId = "fortune-teller";

function App() {
  useEffect(() => {
    // Apply the default master volume to the audio engine.
    useSettingsStore.getState().initAudio();
    // WebAudio stays suspended until a user gesture (autoplay policy) — unlock on the first tap so
    // bgm/sfx can play. One-shot listener that removes itself.
    const unlock = () => {
      void audio.unlockAudioContext();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  return (
    <Application
      background={0x0b0b12}
      resizeTo={window}
      resolution={Math.min(window.devicePixelRatio || 1, 2)}
      autoDensity
    >
      <QueryClientProvider client={queryClient}>
        <GameShell game={GAME} />
      </QueryClientProvider>
    </Application>
  );
}

export default App;
