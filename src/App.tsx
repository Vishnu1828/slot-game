import { Application } from "@pixi/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./api/queryClient";
import GameShell from "./game/GameShell";
import type { GameId } from "./game/registry";

// The game to boot. Later this comes from the route / lobby selection (e.g. /games/:gameId).
const GAME: GameId = "fortune-teller-trove";

function App() {
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
