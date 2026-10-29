import type * as vscode from 'vscode';
import type { AIProvider } from '../types';
import { postJson, requireText } from './http';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';

interface ClaudeResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  stop_details?: { explanation?: string | null } | null;
}

/** Anthropic Messages API via raw fetch (no SDK, keeps the bundle small). */
export class ClaudeProvider implements AIProvider {
  readonly id = 'claude' as const;
  readonly label = 'Claude';

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
    if (!apiKey) throw new Error('No Claude API key set. Run "DevDiary: Set AI API Key".');

    const data = (await postJson(API_URL, {
      label: 'Claude',
      signal,
      headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION },
      body: {
        model: this.model,
        max_tokens: 16000,
        // A short report doesn't need deep reasoning; low effort keeps it fast and cheap.
        output_config: { effort: 'low' },
        system,
        messages: [{ role: 'user', content: user }],
      },
    })) as ClaudeResponse;

    if (data.stop_reason === 'refusal') {
      const why = data.stop_details?.explanation;
      throw new Error(`Claude declined to write the report${why ? `: ${why}` : '.'}`);
    }
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('');
    return requireText(text, 'Claude');
  }
}
