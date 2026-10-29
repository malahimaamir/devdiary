import * as vscode from 'vscode';
import { diffLines } from 'diff';
import type { ActivityStore } from '../storage/activityStore';
import { isTrackable, projectName, relPath } from '../util/ignore';

/** Above this size we skip line diffing (still record the save). */
const MAX_DIFF_CHARS = 2 * 1024 * 1024;
/** Give up on line counting (still record the save) if diffing takes longer than this. */
const DIFF_TIMEOUT_MS = 250;

/**
 * Records saves (with added/removed line counts), file creations and deletions.
 * Only paths and counts are stored — never file content. The baseline text is
 * kept in memory solely to compute line deltas and is dropped when the
 * document closes.
 */
export function registerFileTracker(
  ctx: vscode.ExtensionContext,
  store: ActivityStore,
  isTracking: () => boolean,
): void {
  const baselines = new Map<string, string>();

  const seed = (doc: vscode.TextDocument): void => {
    if (!isTrackable(doc.uri)) return;
    const text = doc.getText();
    if (text.length <= MAX_DIFF_CHARS) baselines.set(doc.uri.toString(), text);
  };

  vscode.workspace.textDocuments.forEach(seed);

  ctx.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(seed),

    vscode.workspace.onDidCloseTextDocument((doc) => {
      baselines.delete(doc.uri.toString());
    }),

    vscode.workspace.onDidSaveTextDocument((doc) => {
      const key = doc.uri.toString();
      if (!isTracking() || !isTrackable(doc.uri)) {
        // Keep the baseline current so a later tracked save diffs correctly.
        seed(doc);
        return;
      }

      const text = doc.getText();
      let linesAdded = 0;
      let linesRemoved = 0;
      const previous = baselines.get(key);

      if (text.length > MAX_DIFF_CHARS) {
        baselines.delete(key);
      } else {
        if (previous !== undefined && previous.length <= MAX_DIFF_CHARS) {
          // Bounded: a huge rewrite would otherwise block the extension host (Myers diff is O(N*D)).
          for (const part of diffLines(previous, text, { timeout: DIFF_TIMEOUT_MS }) ?? []) {
            const n = part.count ?? 0;
            if (part.added) linesAdded += n;
            else if (part.removed) linesRemoved += n;
          }
        }
        baselines.set(key, text);
      }

      store.add({
        type: 'save',
        time: Date.now(),
        file: relPath(doc.uri),
        project: projectName(doc.uri),
        language: doc.languageId,
        linesAdded,
        linesRemoved,
      });
    }),

    vscode.workspace.onDidCreateFiles((e) => {
      if (!isTracking()) return;
      for (const uri of e.files) {
        if (!isTrackable(uri)) continue;
        store.add({ type: 'create', time: Date.now(), file: relPath(uri), project: projectName(uri) });
      }
    }),

    vscode.workspace.onDidDeleteFiles((e) => {
      for (const uri of e.files) {
        baselines.delete(uri.toString());
        if (!isTracking() || !isTrackable(uri)) continue;
        store.add({ type: 'delete', time: Date.now(), file: relPath(uri), project: projectName(uri) });
      }
    }),

    { dispose: () => baselines.clear() },
  );
}
