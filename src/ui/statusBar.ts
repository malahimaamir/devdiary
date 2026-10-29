import * as vscode from 'vscode';
import { ActivityStore } from '../storage/activityStore';
import { summarize } from '../summarizer/summarize';
import { formatMinutes } from '../ai/templateReport';
import { localDateKey } from '../util/date';

const REFRESH_INTERVAL_MS = 60_000;
const COMMIT_DEBOUNCE_MS = 5_000;

/** Right-aligned status item showing today's active time and commit count. */
export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly interval: ReturnType<typeof setInterval>;
  private readonly subscription: vscode.Disposable;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private refreshing: Promise<void> | undefined;
  private disposed = false;

  constructor(
    private readonly store: ActivityStore,
    private readonly isTracking: () => boolean,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.name = 'DevDiary';
    this.item.text = '$(notebook) DevDiary';
    this.item.show();

    // getDay() flushes the store, so keep refreshes throttled.
    this.interval = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
    this.subscription = store.onDidAdd((e) => {
      if (e.type !== 'commit') {
        return;
      }
      if (this.debounce) {
        clearTimeout(this.debounce);
      }
      this.debounce = setTimeout(() => {
        this.debounce = undefined;
        void this.refresh();
      }, COMMIT_DEBOUNCE_MS);
    });

    void this.refresh();
  }

  refresh(): Promise<void> {
    // Coalesce concurrent calls.
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (!this.isTracking()) {
      this.item.text = '$(debug-pause) DevDiary paused';
      this.item.tooltip = 'DevDiary tracking is paused. Click to resume.';
      this.item.command = 'devdiary.toggleTracking';
      return;
    }

    try {
      const summary = summarize(await this.store.getDay(localDateKey()));
      if (this.disposed) {
        return;
      }
      const time = formatMinutes(summary.totalActiveMinutes);
      const commits = `${summary.totalCommits} commit${summary.totalCommits === 1 ? '' : 's'}`;
      this.item.text = `$(notebook) ${time} · ${commits}`;

      const tooltip = new vscode.MarkdownString(undefined, true);
      tooltip.appendMarkdown('**DevDiary — today**\n\n');
      tooltip.appendMarkdown(`$(clock) Active: ${time}\n\n`);
      tooltip.appendMarkdown(`$(git-commit) Commits: ${summary.totalCommits}\n\n`);
      if (summary.projects.length) {
        const names = summary.projects.map((p) => escapeMd(p.name)).join(', ');
        tooltip.appendMarkdown(`$(folder) Projects: ${names}\n\n`);
      }
      tooltip.appendMarkdown("Click to generate today's report");
      this.item.tooltip = tooltip;
      this.item.command = 'devdiary.generate';
    } catch (err) {
      console.error('DevDiary: status bar refresh failed', err);
    }
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.interval);
    if (this.debounce) {
      clearTimeout(this.debounce);
    }
    this.subscription.dispose();
    this.item.dispose();
  }
}

function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+\-.!|<>$]/g, '\\$&');
}
