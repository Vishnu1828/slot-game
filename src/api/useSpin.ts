import { useMutation } from "@tanstack/react-query";
import { spin as localSpin } from "@/game/math/engine";
import type {
  MathConfig,
  SpinRequest,
  SpinResult,
  SymbolId,
} from "@/game/math/types";

/**
 * Request a spin result. Backed by the local engine today; the returned `SpinResult` is the exact
 * shape the real server will send.
 *
 * `strips` is passed in rather than built here because the reel ANIMATION scrolls the same strips
 * (see `Reels`), and `buildStrips` must run only once per config (it validates the partition and
 * warns for provisional reels).
 *
 * SWAP LATER: replace the `mutationFn` body with —
 *   `return fetch("/api/spin", { method: "POST", body: JSON.stringify(req) }).then((r) => r.json());`
 * Everything downstream (stop landing, wins) is unchanged; the strips stay as the animation's source.
 */
export function useSpin(config: MathConfig, strips: SymbolId[][]) {
  return useMutation<SpinResult, Error, SpinRequest>({
    mutationFn: async (req) => localSpin(config, req, strips),
  });
}
