import { useEffect } from 'react'
import { initScene } from '@webspatial/react-sdk'

function App() {
  useEffect(() => {
    initScene('agents', defaults => ({
      ...defaults,
      defaultSize: { width: 320, height: 480 },
    }))
    window.open('/agents.html', 'agents')
  }, [])

  return null
}

export default App
