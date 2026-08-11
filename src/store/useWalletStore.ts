import { create } from "zustand";

/**
 * Live player wallet, in TOKENS (1 token = ₲1.000). Seeded from the server via `useBalance` (React
 * Query owns the fetch), then mutated client-side as the player plays: `deduct` the total bet at spin
 * start, `credit` the win on settle. `setBalance` is the server-authoritative setter (initial hydrate
 * now; post-spin reconcile once the server returns an authoritative balance).
 *
 * Deliberate deviation from the `queryClient.ts` "don't mirror server data into Zustand" note: the
 * balance is mutated live on the client, so it lives here (not the RQ cache). See
 * docs/data-and-server-flow.md.
 */
interface WalletState {
  /** Current balance in tokens. `0` until hydrated (see `hydrated`). */
  balance: number;
  /** True once the server balance has seeded the store. */
  hydrated: boolean;
  /** Server-authoritative set (hydrate / future reconcile). */
  setBalance: (tokens: number) => void;
  /** Remove a stake (clamped at 0). */
  deduct: (tokens: number) => void;
  /** Add a win. */
  credit: (tokens: number) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  balance: 0,
  hydrated: false,
  setBalance: (tokens) => set({ balance: Math.max(0, tokens), hydrated: true }),
  deduct: (tokens) =>
    set((s) => ({ balance: Math.max(0, s.balance - Math.max(0, tokens)) })),
  credit: (tokens) => set((s) => ({ balance: s.balance + Math.max(0, tokens) })),
}));
