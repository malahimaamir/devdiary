import * as vscode from 'vscode';
import type { ActivityEvent, DayLog } from '../types';
import { localDateKey } from '../util/date';

const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER = 200;
const DAY_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Buffered, append-only event store. Each VS Code window (session) writes its
 * own file per day — `<baseDir>/<YYYY-MM-DD>/<session>.json` — so concurrent
 * windows never clobber each other's data.
 */
export class ActivityStore implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ActivityEvent>();
  readonly onDidAdd: vscode.Event<ActivityEvent> = this.emitter.event;

  private buffer: ActivityEvent[] = [];
  private flushChain: Promise<void> = Promise.resolve();
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly fileName: string;
  private readonly enc = new TextEncoder();
  private readonly dec = new TextDecoder();

  constructor(private readonly baseDir: vscode.Uri, sessionId: string) {
    const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100) || 'session';
    this.fileName = `${safe}.json`;
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  add(e: ActivityEvent): void {
    this.buffer.push(e);
    this.emitter.fire(e);
    if (this.buffer.length > MAX_BUFFER) {
      void this.flush();
    }
  }

  /** Persist buffered events. Flushes are serialized and never overlap. */
  flush(): Promise<void> {
    const next = this.flushChain.then(() => this.doFlush());
    // Keep the chain alive even if a flush throws.
    this.flushChain = next.catch(() => undefined);
    return this.flushChain;
  }

  async getDay(date: string): Promise<DayLog> {
    await this.flush();
    const dir = vscode.Uri.joinPath(this.baseDir, date);
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      return { date, events: [] };
    }
    const events: ActivityEvent[] = [];
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !name.endsWith('.json')) continue;
      const list = await this.readEvents(vscode.Uri.joinPath(dir, name));
      events.push(...list);
    }
    events.sort((a, b) => a.time - b.time);
    return { date, events };
  }

  /** Delete day directories older than `keepDays` days. */
  async cleanup(keepDays: number): Promise<void> {
    if (!(keepDays > 0)) return;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - keepDays);
    const cutoffKey = localDateKey(cutoff);

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(this.baseDir);
    } catch {
      return;
    }
    for (const [name, type] of entries) {
      // YYYY-MM-DD keys compare correctly as strings.
      if (type === vscode.FileType.Directory && DAY_DIR_RE.test(name) && name < cutoffKey) {
        try {
          await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.baseDir, name), {
            recursive: true,
            useTrash: false,
          });
        } catch {
          // Ignore; will retry on next cleanup.
        }
      }
    }
  }

  async clearAll(): Promise<void> {
    this.buffer = [];
    // Wait for any in-flight flush so it doesn't recreate files afterwards.
    await this.flushChain;
    this.buffer = [];
    try {
      await vscode.workspace.fs.delete(this.baseDir, { recursive: true, useTrash: false });
    } catch {
      // Already gone.
    }
  }

  dispose(): void {
    clearInterval(this.timer);
    this.emitter.dispose();
  }

  private async doFlush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const pending = this.buffer;
    this.buffer = [];

    const byDay = new Map<string, ActivityEvent[]>();
    for (const e of pending) {
      const key = localDateKey(e.time);
      let list = byDay.get(key);
      if (!list) byDay.set(key, (list = []));
      list.push(e);
    }

    const failed: ActivityEvent[] = [];
    for (const [day, list] of byDay) {
      try {
        const dir = vscode.Uri.joinPath(this.baseDir, day);
        await vscode.workspace.fs.createDirectory(dir);
        const file = vscode.Uri.joinPath(dir, this.fileName);
        const existing = await this.readEvents(file);
        existing.push(...list);
        await vscode.workspace.fs.writeFile(file, this.enc.encode(JSON.stringify(existing)));
      } catch {
        failed.push(...list);
      }
    }
    if (failed.length > 0) {
      // Put failed events back at the front so ordering is roughly preserved.
      this.buffer = failed.concat(this.buffer);
    }
  }

  /** Read an events file; missing or corrupt files yield an empty list. */
  private async readEvents(file: vscode.Uri): Promise<ActivityEvent[]> {
    try {
      const raw = await vscode.workspace.fs.readFile(file);
      const parsed: unknown = JSON.parse(this.dec.decode(raw));
      return Array.isArray(parsed) ? (parsed as ActivityEvent[]) : [];
    } catch {
      return [];
    }
  }
}
