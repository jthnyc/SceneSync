// ── In-memory rate limiter ──────────────────────────────────────────────
// Tracks requests per IP within a rolling window. Resets on cold start,
// which is acceptable for a portfolio project — see ARCHITECTURE.md.

const RATE_LIMIT = 30;          // max requests per window
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const requestLog = new Map();   // IP → [timestamp, timestamp, ...]

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = requestLog.get(ip) || [];

  // Drop entries outside the window
  const recent = timestamps.filter(t => now - t < WINDOW_MS);

  if (recent.length >= RATE_LIMIT) {
    requestLog.set(ip, recent);
    return true;
  }

  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

// ── Handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit by IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — try again later' });
  }

  const PROVIDER_CONFIGS = {
    deepseek: {
      endpoint: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-chat',
      apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    },
    anthropic: {
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-haiku-4-5-20251001',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    },
    openai: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      apiKeyEnvVar: 'OPENAI_API_KEY',
    },
  };

  const ACTIVE_PROVIDER = process.env.LLM_PROVIDER || 'deepseek';
  const MAX_TOKENS = 200;
  // 0.7 balances variation (breaks template habit) with coherence.
  // Lower values (0.4) caused repetitive opening phrasing across tracks
  // with similar acoustic profiles. See explanationService.ts for context.
  const TEMPERATURE = 0.7;

  const config = PROVIDER_CONFIGS[ACTIVE_PROVIDER];
  const apiKey = process.env[config.apiKeyEnvVar];

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid prompt' });
  }

  try {
    const content =
      ACTIVE_PROVIDER === 'anthropic'
        ? await callAnthropic(prompt, apiKey, config, MAX_TOKENS, TEMPERATURE)
        : await callOpenAICompatible(prompt, apiKey, config, MAX_TOKENS, ACTIVE_PROVIDER, TEMPERATURE);

    return res.status(200).json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
};

async function callOpenAICompatible(prompt, apiKey, config, maxTokens, provider, temperature) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      temperature,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${provider} API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callAnthropic(prompt, apiKey, config, maxTokens, temperature) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim() ?? '';
}