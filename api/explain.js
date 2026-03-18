module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
        ? await callAnthropic(prompt, apiKey, config, MAX_TOKENS)
        : await callOpenAICompatible(prompt, apiKey, config, MAX_TOKENS, ACTIVE_PROVIDER);

    return res.status(200).json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
};

async function callOpenAICompatible(prompt, apiKey, config, maxTokens, provider) {
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
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${provider} API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callAnthropic(prompt, apiKey, config, maxTokens) {
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