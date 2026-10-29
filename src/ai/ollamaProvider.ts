import type { AIProvider } from '../types';
import { postJson, requireText } from './http';

interface OllamaChatResponse {
  message?: { content?: string };
}

/** Local Ollama server (no API key). */
export class OllamaProvider implements AIProvider {
  readonly id = 'ollama' as const;
  readonly label = 'Ollama';
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly model: string,
  ) {
    this.baseUrl = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(system: string, user: string, signal?: AbortSignal): Promise<string> {
    const data = (await postJson(`${this.baseUrl}/api/chat`, {
      label: `Ollama (${this.baseUrl})`,
      signal,
      headers: {},
      body: {
        model: this.model,
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
    })) as OllamaChatResponse;
    return requireText(data.message?.content, 'Ollama');
  }
}
