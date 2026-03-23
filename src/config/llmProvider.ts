// ── LLM Provider Configuration ───────────────────────────────────────────
// Single file to swap explanation providers.
// To switch: change ACTIVE_PROVIDER and ensure the matching API key is set
// in .env.local (local) and in Vercel environment variables (production).
//
// Supported providers: 'deepseek' | 'anthropic' | 'openai'

export type LLMProvider = 'deepseek' | 'anthropic' | 'openai';

export const ACTIVE_PROVIDER: LLMProvider = 'deepseek';

interface ProviderConfig {
  endpoint: string;
  model: string;
  // Key of the env variable holding the API key — never hardcode the key itself
  apiKeyEnvVar: string;
  // How this provider expects the Authorization header formatted
  authHeader: (apiKey: string) => string;
  // Max tokens for the explanation blurb — keep short, this is a UI readout
  maxTokens: number;
}

export const PROVIDER_CONFIGS: Record<LLMProvider, ProviderConfig> = {
  deepseek: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat', // DeepSeek-V3 — cheapest, strong multilingual
    apiKeyEnvVar: 'REACT_APP_DEEPSEEK_API_KEY',
    authHeader: (key) => `Bearer ${key}`,
    maxTokens: 200,
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-haiku-4-5-20251001', // cheapest Claude tier
    apiKeyEnvVar: 'REACT_APP_ANTHROPIC_API_KEY',
    authHeader: (key) => key, // Anthropic uses x-api-key header, handled in service
    maxTokens: 200,
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    apiKeyEnvVar: 'REACT_APP_OPENAI_API_KEY',
    authHeader: (key) => `Bearer ${key}`,
    maxTokens: 200,
  },
};

export const getActiveConfig = (): ProviderConfig => PROVIDER_CONFIGS[ACTIVE_PROVIDER];