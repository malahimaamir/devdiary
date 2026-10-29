export type Style = 'oneline' | 'bullets' | 'detailed' | 'standup';
export type ProviderId = 'copilot' | 'claude-code' | 'claude' | 'openai' | 'gemini' | 'ollama' | 'none';

export type ActivityEvent =
  | { type: 'save'; time: number; file: string; project: string; language: string; linesAdded: number; linesRemoved: number }
  | { type: 'create'; time: number; file: string; project: string }
  | { type: 'delete'; time: number; file: string; project: string }
  | { type: 'commit'; time: number; project: string; hash: string; message: string; files: string[] }
  | { type: 'active'; time: number; project: string; file: string; seconds: number };

export interface DayLog { date: string; events: ActivityEvent[] }

export interface FileStat { path: string; edits: number; linesAdded: number; linesRemoved: number }

export interface ProjectSummary {
  name: string;
  activeMinutes: number;
  commits: { hash: string; message: string; files: string[] }[];
  files: FileStat[];          // top 15 by edits+lines
  createdFiles: string[];
  deletedFiles: string[];
  languages: string[];
}

export interface DaySummary {
  date: string;
  totalActiveMinutes: number;
  totalCommits: number;
  projects: ProjectSummary[];
  /** Per-day breakdown; only set for multi-day (weekly) summaries. */
  days?: { date: string; activeMinutes: number; commits: number }[];
}

export interface AIProvider {
  readonly id: ProviderId;
  readonly label: string;
  isAvailable(): Promise<boolean>;
  generate(system: string, user: string, signal?: AbortSignal): Promise<string>;
}
