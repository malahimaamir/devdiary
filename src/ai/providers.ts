import type * as vscode from 'vscode';
import type { AIProvider, ProviderId } from '../types';
import { getConfig } from '../config';
import { ClaudeProvider } from './claudeProvider';
import { OpenAIProvider } from './openaiProvider';
import { GeminiProvider } from './geminiProvider';
import { OllamaProvider } from './ollamaProvider';
import { CopilotProvider } from './copilotProvider';

/** Default model per provider, used when `devdiary.model` is empty. Copilot: '' = first available model. */
export const DEFAULT_MODELS: Readonly<Record<Exclude<ProviderId, 'none'>, string>> = {
  copilot: '',
  claude: 'claude-haiku-5-5',
  openai: 'gpt-5-mini',
  gemini: 'gemini-flash-latest',
  ollama: 'llama3.2',
};

/** Providers that need an API key stored in SecretStorage. */
export const KEY_PROVIDERS = ['claude', 'openai', 'gemini'] as const;
export type KeyProviderId = (typeof KEY_PROVIDERS)[number];

export function secretKey(id: KeyProviderId | ProviderId): string {
  return `devdiary.apiKey.${id}`;
}

export function createProvider(id: ProviderId, secrets: vscode.SecretStorage): AIProvider | undefined {
  if (id === 'none') return undefined;
  const cfg = getConfig();
  const model = cfg.model.trim() || DEFAULT_MODELS[id];
  switch (id) {
    case 'copilot':
      return new CopilotProvider(model);
    case 'claude':
      return new ClaudeProvider(secrets, secretKey(id), model);
    case 'openai':
      return new OpenAIProvider(secrets, secretKey(id), model);
    case 'gemini':
      return new GeminiProvider(secrets, secretKey(id), model);
    case 'ollama':
      return new OllamaProvider(cfg.ollamaUrl, model);
    default:
      return undefined;
  }
}

/** Returns the configured provider if it is usable right now; otherwise undefined (caller falls back to the template). */
export async function pickProvider(secrets: vscode.SecretStorage): Promise<AIProvider | undefined> {
  const provider = createProvider(getConfig().aiProvider, secrets);
  if (!provider) return undefined;
  try {
    return (await provider.isAvailable()) ? provider : undefined;
  } catch {
    return undefined;
  }
}
