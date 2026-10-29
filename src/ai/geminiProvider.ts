import type * as vscode from 'vscode';
import type { AIProvider } from '../types';
import { postJson, requireText } from './http';

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** Google Gemini generateContent via raw fetch. */
export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
  readonly label = 'Gemini';

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
    if (!apiKey) throw new Error('No Gemini API key set. Run "DevDiary: Set AI API Key".');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const data = (await postJson(url, {
      label: 'Gemini',
      signal,
      headers: { 'x-goog-api-key': apiKey },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
      },
    })) as GenerateContentResponse;

    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the request (${data.promptFeedback.blockReason}).`);
    }
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    return requireText(text, 'Gemini');
  }
}
