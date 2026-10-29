import * as vscode from 'vscode';
import { getConfig } from './config';
import { ActivityStore } from './storage/activityStore';
import { registerFileTracker } from './tracker/fileTracker';
import { registerGitTracker } from './tracker/gitTracker';
import { registerTimeTracker } from './tracker/timeTracker';
import { ReportService } from './report/reportService';
import { StatusBar } from './ui/statusBar';
import { registerSetApiKeyCommand } from './commands/setApiKey';
import { registerScheduler } from './scheduler';
import { addDays, isValidDateKey, localDateKey } from './util/date';

const PAUSED_KEY = 'devdiary.paused';
const WELCOMED_KEY = 'devdiary.welcomed';

/** Kept so deactivate() can flush pending events to disk. */
let activeStore: ActivityStore | undefined;

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const store = new ActivityStore(vscode.Uri.joinPath(ctx.globalStorageUri, 'logs'), vscode.env.sessionId);
  activeStore = store;
  ctx.subscriptions.push(store);

  const isTracking = (): boolean => !ctx.globalState.get<boolean>(PAUSED_KEY, false);

  registerFileTracker(ctx, store, isTracking);
  registerTimeTracker(ctx, store, isTracking);
  // Git may take a while to initialize; don't block activation on it.
  registerGitTracker(ctx, store, isTracking).catch((err) =>
    console.error('[DevDiary] Git tracking unavailable:', err),
  );

  const statusBar = new StatusBar(store, isTracking);
  ctx.subscriptions.push(statusBar);

  const reportService = new ReportService(ctx, store);
  const generate = (date: string): Promise<void> => reportService.generate(date);

  registerSetApiKeyCommand(ctx);
  registerScheduler(ctx, generate);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('devdiary.generate', () => generate(localDateKey())),

    vscode.commands.registerCommand('devdiary.generateWeekly', () => {
      const today = localDateKey();
      return reportService.generateRange(addDays(today, -6), today);
    }),

    vscode.commands.registerCommand('devdiary.generateForDate', async () => {
      const d = new Date();
      d.setDate(d.getDate() - 1); // calendar day, safe across DST changes
      const yesterday = localDateKey(d);
      const date = await vscode.window.showInputBox({
        title: 'DevDiary: Generate Report for a Date',
        prompt: 'Date of the report (YYYY-MM-DD)',
        value: yesterday,
        validateInput: (v) => (isValidDateKey(v.trim()) ? undefined : 'Enter a valid date as YYYY-MM-DD'),
      });
      if (date) {
        await generate(date.trim());
      }
    }),

    vscode.commands.registerCommand('devdiary.toggleTracking', async () => {
      const paused = !isTracking();
      await ctx.globalState.update(PAUSED_KEY, !paused);
      await statusBar.refresh();
      void vscode.window.showInformationMessage(
        paused ? 'DevDiary: Tracking resumed.' : 'DevDiary: Tracking paused. Nothing will be recorded until you resume.',
      );
    }),

    vscode.commands.registerCommand('devdiary.clearData', async () => {
      const confirm = 'Delete All';
      const choice = await vscode.window.showWarningMessage(
        'Delete all activity DevDiary has stored on this machine? This cannot be undone.',
        { modal: true },
        confirm,
      );
      if (choice === confirm) {
        await store.clearAll();
        // Saved reports contain the same file names / commit messages; remove them too.
        try {
          await vscode.workspace.fs.delete(vscode.Uri.joinPath(ctx.globalStorageUri, 'reports'), {
            recursive: true,
            useTrash: false,
          });
        } catch {
          // Already gone.
        }
        await statusBar.refresh();
        void vscode.window.showInformationMessage('DevDiary: All stored activity was deleted.');
      }
    }),

    vscode.commands.registerCommand('devdiary.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${ctx.extension.id}`),
    ),
  );

  store.cleanup(getConfig().keepDays).catch((err) => console.error('[DevDiary] Cleanup failed:', err));

  void showWelcome(ctx);
}

export async function deactivate(): Promise<void> {
  await activeStore?.flush();
  activeStore = undefined;
}

/** One-time privacy-focused welcome message. */
async function showWelcome(ctx: vscode.ExtensionContext): Promise<void> {
  if (ctx.globalState.get<boolean>(WELCOMED_KEY, false)) {
    return;
  }
  await ctx.globalState.update(WELCOMED_KEY, true);

  const generateBtn = 'Generate Report';
  const settingsBtn = 'Settings';
  const pauseBtn = 'Pause Tracking';
  const choice = await vscode.window.showInformationMessage(
    'DevDiary is now tracking your work to write your daily report. Only file names, line counts, ' +
      'commit messages and active time are stored — locally on this machine. Your code is never stored.',
    generateBtn,
    settingsBtn,
    pauseBtn,
  );

  switch (choice) {
    case generateBtn:
      await vscode.commands.executeCommand('devdiary.generate');
      break;
    case settingsBtn:
      await vscode.commands.executeCommand('devdiary.openSettings');
      break;
    case pauseBtn:
      if (!ctx.globalState.get<boolean>(PAUSED_KEY, false)) {
        await vscode.commands.executeCommand('devdiary.toggleTracking');
      }
      break;
  }
}
