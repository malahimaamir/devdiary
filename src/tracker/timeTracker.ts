import * as vscode from 'vscode';
import type { ActivityStore } from '../storage/activityStore';
import { getConfig } from '../config';
import { isTrackable, projectName, relPath } from '../util/ignore';

const TICK_MS = 60_000;

/**
 * Approximates active coding time: once a minute, if the window is focused,
 * the user did something recently and a trackable file is current, record a
 * 60-second 'active' slice attributed to that file/project.
 */
export function registerTimeTracker(
  ctx: vscode.ExtensionContext,
  store: ActivityStore,
  isTracking: () => boolean,
): void {
  let lastActivity = 0;
  let focused = vscode.window.state.focused;
  let current: vscode.Uri | undefined;

  const touch = (uri?: vscode.Uri): void => {
    if (uri && isTrackable(uri)) {
      current = uri;
      lastActivity = Date.now();
    }
  };

  touch(vscode.window.activeTextEditor?.document.uri);

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length > 0) touch(e.document.uri);
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => touch(e.textEditor.document.uri)),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) touch(editor.document.uri);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => touch(doc.uri)),
    vscode.window.onDidChangeWindowState((state) => {
      focused = state.focused;
      if (focused) lastActivity = Date.now();
    }),
  );

  const timer = setInterval(() => {
    if (!isTracking() || !focused || !current) return;
    const idleMs = Math.max(1, getConfig().idleTimeoutMinutes) * 60_000;
    if (Date.now() - lastActivity > idleMs) return;
    // Re-check: ignore patterns or workspace folders may have changed.
    if (!isTrackable(current)) return;
    store.add({
      type: 'active',
      time: Date.now(),
      project: projectName(current),
      file: relPath(current),
      seconds: TICK_MS / 1000,
    });
  }, TICK_MS);

  ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
}
