import { useEffect } from 'react'
import { initScene } from '@webspatial/react-sdk'

function App() {
  useEffect(() => {
    initScene('panel-a', defaults => ({
      ...defaults,
      defaultSize: { width: 600, height: 400 },
    }))
    window.open('/panel-a.html', 'panel-a')

    initScene('panel-b', defaults => ({
      ...defaults,
      defaultSize: { width: 600, height: 400 },
    }))
    window.open('/panel-b.html', 'panel-b')
  }, [])

  return null
}

export default App
