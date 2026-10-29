import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AIProvider } from '../types';
import { requireText } from './http';

const TIMEOUT_MS = 120_000;
const IS_WINDOWS = process.platform === 'win32';

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Uses the locally installed Claude Code CLI (`claude -p`), so the report is written
 * with the user's existing Claude login — no API key needed.
 * Runs in an empty temp folder with all tools disabled, so no project files or CLAUDE.md are read.
 */
export class ClaudeCodeProvider implements AIProvider {
  readonly id = 'claude-code' as const;
  readonly label = 'Claude Code';

  constructor(
    private readonly command: string,
    private readonly model: string,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.run(['--version'], { timeoutMs: 10_000 });
      return res.code === 0;
    } catch {
      return false;
    }
  }

  async generate(system: string, user: string, signal?: AbortSignal): Promise<string> {
    // The model name goes on a shell command line on Windows: only allow plain model ids/aliases.
    if (!/^[\w.:/[\]-]+$/.test(this.model)) {
      throw new Error(`Invalid Claude Code model name "${this.model}". Check "devdiary.model".`);
    }
    const dir = await mkdtemp(join(tmpdir(), 'devdiary-'));
    try {
      const systemFile = join(dir, 'system.txt');
      await writeFile(systemFile, system, 'utf8');
      const args = [
        '-p',
        '--model', this.model,
        '--tools', IS_WINDOWS ? '""' : '', // no tools: it only writes text
        '--strict-mcp-config', // no MCP servers (user config / claude.ai connectors) either
        '--disable-slash-commands',
        '--no-session-persistence',
        '--output-format', 'text',
        '--system-prompt-file', quote(systemFile),
      ];
      const res = await this.run(args, { cwd: dir, input: user, signal, timeoutMs: TIMEOUT_MS });
      if (res.code !== 0) {
        throw new Error(`Claude Code failed (exit ${res.code}): ${lastLines(res.stderr || res.stdout)}`);
      }
      return requireText(res.stdout, 'Claude Code');
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private run(
    args: string[],
    opts: { cwd?: string; input?: string; signal?: AbortSignal; timeoutMs: number },
  ): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) return reject(new Error('Request cancelled.'));

      // A shell is needed on Windows to resolve npm's claude.cmd shim. Every argument is fixed or
      // quoted by us; the user's data only travels through stdin.
      const spawnOpts = {
        cwd: opts.cwd ?? tmpdir(),
        windowsHide: true,
        env: { ...process.env, NO_COLOR: '1' },
      };
      const child = IS_WINDOWS
        ? spawn([quote(this.command), ...args].join(' '), { ...spawnOpts, shell: true })
        : spawn(this.command, args, spawnOpts);

      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
        fn();
      };
      const kill = () => {
        if (IS_WINDOWS && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        } else {
          child.kill();
        }
      };
      const onAbort = () => {
        kill();
        finish(() => reject(new Error('Request cancelled.')));
      };
      const timer = setTimeout(() => {
        kill();
        finish(() => reject(new Error(`Claude Code timed out after ${opts.timeoutMs / 1000}s.`)));
      }, opts.timeoutMs);

      opts.signal?.addEventListener('abort', onAbort);
      child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
      child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
      child.on('error', err => finish(() => reject(new Error(`Could not start Claude Code: ${err.message}`))));
      child.on('close', code => finish(() => resolve({ code, stdout, stderr })));

      child.stdin.on('error', () => undefined);
      child.stdin.end(opts.input ?? '');
    });
  }
}

function quote(s: string): string {
  return IS_WINDOWS && /[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

/** Last few meaningful stderr lines, skipping noisy certificate warnings. */
function lastLines(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !/extra certs/i.test(l));
  return lines.slice(-3).join(' ') || 'no output';
}
