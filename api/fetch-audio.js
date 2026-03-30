// ── api/fetch-audio.js ────────────────────────────────────────────────────
// Proxies audio file fetches from Cloudflare R2 server-side.
// Exists solely to work around CORS restrictions on the r2.dev public URL —
// fetch() from the browser is blocked; server-side fetch is not.
//
// Usage: GET /api/fetch-audio?path=youtube/batch2/Challenge%20Accepted...
// Returns the audio file as a binary response with appropriate headers.

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { path } = req.query;
  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  // Restrict to known safe path prefixes — entry points only.
  // Prevents this endpoint from being used as an open proxy.
  const ALLOWED_PREFIXES = ['youtube/', 'fma_small/', 'musopen/'];
  const isAllowed = ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Path not permitted' });
  }

  const r2BaseUrl = process.env.REACT_APP_R2_PUBLIC_URL;
  if (!r2BaseUrl) {
    return res.status(500).json({ error: 'R2 base URL not configured' });
  }

  const url = `${r2BaseUrl}/${path}`;

  try {
    const r2Response = await fetch(url);
    if (!r2Response.ok) {
      return res.status(r2Response.status).json({
        error: `R2 fetch failed: ${r2Response.status}`,
      });
    }

    const contentType = r2Response.headers.get('content-type') || 'audio/mpeg';
    const buffer = await r2Response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
};