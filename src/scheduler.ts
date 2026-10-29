import * as vscode from 'vscode';
import { getConfig } from './config';
import { localDateKey } from './util/date';

const CHECK_INTERVAL_MS = 30_000;
const SNOOZE_MS = 30 * 60_000;
const LAST_PROMPT_KEY = 'devdiary.lastAutoPrompt';

/**
 * Prompts once per day (after `devdiary.autoGenerateAt`) to generate the report.
 * The globalState key is shared across windows, and we only prompt from a focused
 * window, so only one window prompts per day.
 */
export function registerScheduler(
  ctx: vscode.ExtensionContext,
  generate: (date: string) => Promise<void>,
): void {
  let prompting = false;
  // In-window snooze: one re-prompt after "Later".
  let snooze: { date: string; until: number } | undefined;

  const prompt = async (date: string, allowSnooze: boolean): Promise<void> => {
    prompting = true;
    try {
      const buttons = allowSnooze ? ['Generate', 'Later'] : ['Generate'];
      const choice = await vscode.window.showInformationMessage(
        'Your DevDiary report for today is ready to generate.',
        ...buttons,
      );
      if (choice === 'Generate') {
        await generate(date);
      } else if (choice === 'Later' && allowSnooze) {
        snooze = { date, until: Date.now() + SNOOZE_MS };
      }
    } catch (err) {
      console.error('DevDiary: scheduled generation failed', err);
    } finally {
      prompting = false;
    }
  };

  const check = async (): Promise<void> => {
    if (prompting || !vscode.window.state.focused) {
      return;
    }
    const today = localDateKey();

    if (snooze) {
      if (snooze.date !== today) {
        snooze = undefined;
      } else if (Date.now() >= snooze.until) {
        snooze = undefined;
        void prompt(today, false);
        return;
      }
    }

    const target = parseTime(getConfig().autoGenerateAt);
    if (!target) {
      return; // disabled or invalid
    }
    const now = new Date();
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), target.h, target.m);
    if (now < due || ctx.globalState.get<string>(LAST_PROMPT_KEY) === today) {
      return;
    }
    // Claim today's prompt before awaiting so other windows skip it.
    await ctx.globalState.update(LAST_PROMPT_KEY, today);
    void prompt(today, true);
  };

  const run = (): void => {
    check().catch((err) => console.error('DevDiary: scheduler check failed', err));
  };

  const interval = setInterval(run, CHECK_INTERVAL_MS);
  ctx.subscriptions.push(
    { dispose: () => clearInterval(interval) },
    vscode.window.onDidChangeWindowState((s) => {
      if (s.focused) {
        run();
      }
    }),
  );
  run();
}

function parseTime(value: string | undefined): { h: number; m: number } | undefined {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value ?? '');
  if (!match) {
    return undefined;
  }
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) {
    return undefined;
  }
  return { h, m };
}
