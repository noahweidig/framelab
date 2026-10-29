import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function normalizeUrl(raw = '') {
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return '';
    }
  }
}

async function fetchBuffer(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'image/jpeg'
    };
  } finally {
    clearTimeout(timer);
  }
}

function backendSnapshotProxyPlugin() {
  return {
    name: 'backend-snapshot-proxy',
    configureServer(server) {
      server.middlewares.use('/api/snapshot', async (req, res) => {
        const reqUrl = new URL(req.url || '/', 'http://localhost');
        const target = normalizeUrl(reqUrl.searchParams.get('url'));

        if (!target) {
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid or missing url query param' }));
          return;
        }

        const w = Number(reqUrl.searchParams.get('w')) || 1600;
        const h = Number(reqUrl.searchParams.get('h')) || 900;
        const thum = `https://image.thum.io/get/width/${w}/viewportWidth/${w}/crop/${h}/noanimate/${target}`;
        const providers = [thum, `https://s.wordpress.com/mshots/v1/${encodeURIComponent(target)}?w=${w}`, `https://r.jina.ai/http://${thum.replace(/^https?:\/\//, '')}`];

        let lastError = 'No snapshot provider response';

        for (const endpoint of providers) {
          try {
            const { buffer, contentType } = await fetchBuffer(endpoint);
            res.statusCode = 200;
            res.setHeader('cache-control', 'public, max-age=300');
            res.setHeader('content-type', contentType);
            res.end(buffer);
            return;
          } catch (error) {
            lastError = error?.message || String(error);
          }
        }

        res.statusCode = 502;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'All backend snapshot providers failed', message: lastError }));
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), backendSnapshotProxyPlugin()],
  base: '/framelab/'
});
