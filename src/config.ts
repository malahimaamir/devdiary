import * as vscode from 'vscode';
import type { ProviderId, Style } from './types';

export interface DevDiaryConfig {
  language: string;
  style: Style;
  aiProvider: ProviderId;
  model: string;
  ollamaUrl: string;
  claudeCodePath: string;
  autoGenerateAt: string;
  ignorePatterns: string[];
  idleTimeoutMinutes: number;
  keepDays: number;
}

const STYLES: readonly Style[] = ['oneline', 'bullets', 'detailed', 'standup'];
const PROVIDERS: readonly ProviderId[] = ['copilot', 'claude-code', 'claude', 'openai', 'gemini', 'ollama', 'none'];

/** Defaults mirror the `contributes.configuration` section of package.json. */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/.env',
  '**/.env.*',
  '**/*.key',
  '**/*.pem',
];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : fallback;
}

export function getConfig(): DevDiaryConfig {
  const c = vscode.workspace.getConfiguration('devdiary');
  const language = c.get<string>('language', 'English').trim();
  const ignorePatterns = c.get<string[]>('ignorePatterns', [...DEFAULT_IGNORE_PATTERNS]);

  return {
    language: language || 'English',
    style: oneOf(c.get('style'), STYLES, 'bullets'),
    aiProvider: oneOf(c.get('aiProvider'), PROVIDERS, 'copilot'),
    model: c.get<string>('model', '').trim(),
    ollamaUrl: c.get<string>('ollamaUrl', 'http://localhost:11434').trim() || 'http://localhost:11434',
    claudeCodePath: c.get<string>('claudeCodePath', 'claude').trim() || 'claude',
    autoGenerateAt: c.get<string>('autoGenerateAt', '').trim(),
    ignorePatterns: Array.isArray(ignorePatterns)
      ? ignorePatterns.filter((p): p is string => typeof p === 'string' && p.length > 0)
      : [...DEFAULT_IGNORE_PATTERNS],
    idleTimeoutMinutes: positiveNumber(c.get('idleTimeoutMinutes'), 5),
    keepDays: Math.floor(positiveNumber(c.get('keepDays'), 30)),
  };
}
