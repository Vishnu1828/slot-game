import { QueryClient } from '@tanstack/react-query'

/**
 * Shared TanStack Query client. Exported as a singleton so it can also be used
 * imperatively (e.g. queryClient.invalidateQueries(...)) outside React.
 *
 * React Query owns SERVER state (balance, history, spin results). Zustand owns
 * ephemeral GAME/UI state (gameState, layout). Don't mirror
 * server data into Zustand — read it from here.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
