import { useQuery } from "@tanstack/react-query";

/**
 * Mock starting balance, in TOKENS (1 token = ₲1.000 → ₲5.000.000). Finite on purpose so the
 * INSUFFICIENT CREDIT path is reachable while testing.
 */
const MOCK_BALANCE_TOKENS = 5000;

/**
 * SWAP LATER: point this at the backend —
 *   `return fetch("/api/balance").then((r) => r.json()).then((d) => d.balanceTokens);`
 * Nothing else changes; the wallet store hydrates from whatever this resolves to.
 */
async function fetchBalance(): Promise<number> {
  return MOCK_BALANCE_TOKENS;
}

/**
 * The player's server balance (tokens). React Query owns the fetch/transport; the live balance is
 * then hydrated into `useWalletStore` and mutated there as the player spins (see GameScreen).
 */
export function useBalance() {
  return useQuery({
    queryKey: ["balance"],
    queryFn: fetchBalance,
    initialData: MOCK_BALANCE_TOKENS,
    staleTime: Infinity,
  });
}
