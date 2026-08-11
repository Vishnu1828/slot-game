import { useQuery } from "@tanstack/react-query";
import { getMathConfig } from "@/game/math/registry";
import type { MathConfig } from "@/game/math/types";

/**
 * SWAP LATER: point this at the backend —
 *   `return fetch(`/api/games/${gameId}/math`).then((r) => r.json());`
 * Nothing else needs to change; `getMathConfig` stays as the offline/dev fallback via `initialData`.
 */
async function fetchMathConfig(gameId: string): Promise<MathConfig> {
  return getMathConfig(gameId);
}

/**
 * The active game's math config. Backed by the client-side registry today (React Query owns it as
 * "server state" per CLAUDE.md); `initialData` makes it available synchronously so the game can render
 * on the first frame. `data` is always defined thanks to `initialData`.
 */
export function useMathConfig(gameId: string) {
  return useQuery({
    queryKey: ["math", gameId],
    queryFn: () => fetchMathConfig(gameId),
    initialData: () => getMathConfig(gameId),
    staleTime: Infinity,
  });
}
