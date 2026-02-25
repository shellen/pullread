// ABOUTME: Lightweight static server that serves the embedded viewer HTML for Playwright tests.
// ABOUTME: Runs on port 7799 to avoid conflicting with the dev viewer on 7777.

import { createServer } from 'http';
import { VIEWER_HTML } from '../../src/viewer-html';

const port = 7799;

const server = createServer((req, res) => {
  // Serve the embedded viewer for any path
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(VIEWER_HTML);
    return;
  }

  // Return empty JSON array for API calls the viewer makes on load
  if (req.url?.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.startsWith('/api/files')) {
      res.end('[]');
    } else if (req.url.startsWith('/api/settings')) {
      res.end('{}');
    } else {
      res.end('{}');
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Test viewer server running at http://localhost:${port}`);
});
