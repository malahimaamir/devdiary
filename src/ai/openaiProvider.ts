import type * as vscode from 'vscode';
import type { AIProvider } from '../types';
import { postJson, requireText } from './http';

const API_URL = 'https://api.openai.com/v1/chat/completions';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
}

/** OpenAI Chat Completions via raw fetch. */
export class OpenAIProvider implements AIProvider {
  readonly id = 'openai' as const;
  readonly label = 'OpenAI';

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly secretKey: string,
    private readonly model: string,
  ) {}

  async isAvailable(): Promise<boolean> {
    return !!(await this.secrets.get(this.secretKey));
  }

  async generate(system: string, user: string, signal?: AbortSignal): Promise<string> {
    const apiKey = await this.secrets.get(this.secretKey);
    if (!apiKey) throw new Error('No OpenAI API key set. Run "DevDiary: Set AI API Key".');

    const data = (await postJson(API_URL, {
      label: 'OpenAI',
      signal,
      headers: { authorization: `Bearer ${apiKey}` },
      body: {
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
    })) as ChatCompletionResponse;

    const msg = data.choices?.[0]?.message;
    if (msg?.refusal) throw new Error(`OpenAI declined to write the report: ${msg.refusal}`);
    return requireText(msg?.content ?? undefined, 'OpenAI');
  }
}
