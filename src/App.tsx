import { Application } from '@pixi/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './api/queryClient'

function App() {
  return (
    <Application
      background={0x0b0b12}
      resizeTo={window}
      resolution={Math.min(window.devicePixelRatio || 1, 2)}
      autoDensity
    >
      <QueryClientProvider client={queryClient}>
        <></>
      </QueryClientProvider>
    </Application>
  )
}

export default App
