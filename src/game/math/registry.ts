import type { MathConfig } from "./types";
import fortuneTellerMath from "@/game/fortune-teller/math";

/**
 * Registry of per-game math configs. Keyed by game id (same key as `GAMES` in
 * `src/game/registry.ts`). This is the client-side default set — the seam in `src/api/useMathConfig.ts`
 * can later hydrate these from the server instead.
 */
export const MATH: Record<string, MathConfig> = {
  "fortune-teller": fortuneTellerMath,
};

export function getMathConfig(gameId: string): MathConfig {
  const cfg = MATH[gameId];
  if (!cfg) throw new Error(`No math config registered for game "${gameId}"`);
  return cfg;
}
