import { ipcMain } from 'electron'
import { development } from './util.js'
import http from 'http'

/**
 * YOUTUBE EMBED WORKAROUND SERVER
 * Forced 1080p + Geoblock Detection + Referrer Fix
 */

const pendingResponses = new Map()

export const youtubeServer = !development ? http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`)
  const responseId = url.searchParams.get('id')

  // Lifecycle: Loaded or Errored
  if (url.pathname === '/status') {
    const error = url.searchParams.get('error')
    if (error) {
      // Notify Electron Main process to move to next entry
      // Replace 'mainWindow' with your actual window reference variable
      // mainWindow.webContents.send('youtube-error', error)
      console.error(`YouTube Error ${error} on ${responseId}. Skipping...`)
    }

    const pendingRes = pendingResponses.get(responseId)
    if (pendingRes) {
      pendingRes.end('</body></html>')
      pendingResponses.delete(responseId)
    }
    res.end('ok')
    return
  }

  const videoId = url.pathname.split('/').filter(Boolean).pop()
  
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.write(`<!DOCTYPE html>
<html lang='en'>
<head>
  <style>
    * { margin: 0; padding: 0; overflow: hidden; background: #000; }
    body, html { width: 100%; height: 100%; }
    .container { position: relative; width: 100vw; height: 100vh; }
    /* Force 1080p by lying about viewport size */
    #player { 
      position: absolute; 
      top: 50%; left: 50%;
      width: 1920px; height: 1080px;
      transform: translate(-50%, -50%) scale(calc(100vw / 1920));
    }
    @media (aspect-ratio < 16/9) {
      #player { transform: translate(-50%, -50%) scale(calc(100vh / 1080)); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="player"></div>
  </div>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    function onYouTubeIframeAPIReady() {
      new YT.Player('player', {
        videoId: '${videoId}',
        playerVars: { 
          autoplay: 1, 
          vq: 'hd1080', 
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin 
        },
        events: {
          onReady: () => fetch('/status?id=${responseId}'),
          onError: (e) => fetch('/status?id=${responseId}&error=' + e.data)
        }
      });
    }
  </script>
</body>
</html>`)
  
  pendingResponses.set(responseId, res)
  req.on('close', () => pendingResponses.delete(responseId))
}) : {}

// Server initialization
if (!development) {
  youtubeServer.listen(0, 'localhost', () => {
    console.log(`YouTube Proxy: http://localhost:${youtubeServer.address().port}`)
  })
}

// IPC Handlers
ipcMain.handle('electron:getYouTube', () => {
  if (development) return 'https://www.youtube-nocookie.com'
  return `http://localhost:${youtubeServer.address().port}`
})