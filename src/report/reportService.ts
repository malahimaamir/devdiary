import * as vscode from 'vscode';
import { ActivityStore } from '../storage/activityStore';
import { getConfig } from '../config';
import { summarize, summarizeRange } from '../summarizer/summarize';
import { buildPrompt } from '../ai/promptBuilder';
import { renderTemplateReport } from '../ai/templateReport';
import { pickProvider } from '../ai/providers';
import { ReportPanel } from '../ui/reportPanel';
import { DaySummary, ProviderId, Style } from '../types';
import { dateKeysBetween } from '../util/date';

const PROVIDER_NAMES: Record<ProviderId, string> = {
  copilot: 'GitHub Copilot',
  'claude-code': 'Claude Code',
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama',
  none: 'Template',
};

const TEMPLATE_LABEL = 'Basic template (no AI)';

export type ReportOverrides = { language?: string; style?: Style };

/** Orchestrates: load log → summarize → AI (or template) → save → show. */
export class ReportService {
  private running = false;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly store: ActivityStore,
  ) {}

  /** Report for a single day. */
  generate(date: string, overrides?: ReportOverrides): Promise<void> {
    return this.generateRange(date, date, overrides);
  }

  /**
   * Report covering `from`..`to` (inclusive, "YYYY-MM-DD"). A single day when `from === to`,
   * otherwise a multi-day (weekly) report.
   */
  async generateRange(from: string, to: string, overrides?: ReportOverrides): Promise<void> {
    if (this.running) {
      void vscode.window.showInformationMessage('DevDiary is already writing a report…');
      ReportPanel.setIdle();
      return;
    }
    this.running = true;
    try {
      await this.run(from, to, overrides);
    } finally {
      this.running = false;
      // Re-enable the panel toolbar if the run ended without showing a new report.
      ReportPanel.setIdle();
    }
  }

  private async run(from: string, to: string, overrides?: ReportOverrides): Promise<void> {
    const multiDay = from !== to;
    const date = multiDay ? `${from} → ${to}` : from;
    const logs = await Promise.all(dateKeysBetween(from, to).map((d) => this.store.getDay(d)));
    if (!logs.some((l) => l.events.length)) {
      void vscode.window.showInformationMessage(`No activity recorded for ${date}.`);
      return;
    }

    const config = getConfig();
    const summary: DaySummary = multiDay ? summarizeRange(logs) : summarize(logs[0]);
    const language = overrides?.language?.trim() || config.language || 'English';
    const style: Style = overrides?.style ?? config.style;

    let report: string | undefined;
    let providerLabel = TEMPLATE_LABEL;

    const provider = await pickProvider(this.ctx.secrets);
    if (!provider) {
      if (config.aiProvider !== 'none') {
        this.warnUnavailable(config.aiProvider);
      }
    } else {
      const { system, user } = buildPrompt(summary, language, style);
      const controller = new AbortController();
      let cancelled = false;
      try {
        report = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `DevDiary: writing your ${multiDay ? 'weekly ' : ''}${style} report in ${language}…`,
            cancellable: true,
          },
          async (_progress, token) => {
            token.onCancellationRequested(() => {
              cancelled = true;
              controller.abort();
            });
            const text = await provider.generate(system, user, controller.signal);
            if (!text || !text.trim()) {
              throw new Error('the AI returned an empty response');
            }
            return text.trim();
          },
        );
        providerLabel = provider.label;
      } catch (err) {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        const reason = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(
          `DevDiary: ${provider.label} failed (${reason}). Showing a basic English report instead.`,
        );
        report = undefined;
      }
    }

    if (report === undefined) {
      report = renderTemplateReport(summary, style);
      providerLabel = TEMPLATE_LABEL;
    }

    await this.save(multiDay ? `${from}_to_${to}` : from, date, report, language, style, providerLabel);

    ReportPanel.show(
      this.ctx,
      { date, report, language, style, providerLabel },
      (lang, st) => void this.generateRange(from, to, { language: lang, style: st }),
    );
  }

  private warnUnavailable(id: ProviderId): void {
    const setKey = 'Set API Key';
    const openSettings = 'Open Settings';
    void vscode.window
      .showWarningMessage(
        `${PROVIDER_NAMES[id] ?? id} is not available, showing a basic English report.`,
        setKey,
        openSettings,
      )
      .then((choice) => {
        if (choice === setKey) {
          void vscode.commands.executeCommand('devdiary.setApiKey');
        } else if (choice === openSettings) {
          void vscode.commands.executeCommand('devdiary.openSettings');
        }
      });
  }

  private async save(
    fileName: string,
    date: string,
    report: string,
    language: string,
    style: Style,
    providerLabel: string,
  ): Promise<void> {
    try {
      const dir = vscode.Uri.joinPath(this.ctx.globalStorageUri, 'reports');
      await vscode.workspace.fs.createDirectory(dir);
      const header =
        `<!-- devdiary: date=${date}; language=${sanitizeComment(language)}; ` +
        `style=${style}; provider=${sanitizeComment(providerLabel)}; ` +
        `generated=${new Date().toISOString()} -->\n\n`;
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(dir, `${fileName}.md`),
        Buffer.from(header + report + '\n', 'utf8'),
      );
    } catch (err) {
      // Saving is best-effort; the report is still shown.
      console.error('DevDiary: failed to save report', err);
    }
  }
}

function sanitizeComment(s: string): string {
  return s.replace(/-->/g, '').replace(/[\r\n]+/g, ' ');
}
