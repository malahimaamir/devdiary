import * as vscode from 'vscode';
import type { ActivityStore } from '../storage/activityStore';
import { isTrackable, projectName, relPath } from '../util/ignore';
import type { API, Commit, GitExtension, Repository } from './gitTypes';

const MAX_LOG = 5;
const MAX_FILES = 30;
const MAX_MESSAGE = 200;
/** Only commits authored this recently count as "made here", not pulled/checked out. */
const RECENT_MS = 10 * 60_000;

/**
 * Watches git repositories (via the built-in git extension) and records new
 * local commits: short hash, first line of the message and changed paths.
 */
export async function registerGitTracker(
  ctx: vscode.ExtensionContext,
  store: ActivityStore,
  isTracking: () => boolean,
): Promise<void> {
  let api: API;
  try {
    const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!ext) return;
    const git = ext.isActive ? ext.exports : await ext.activate();
    if (!git?.enabled) return;
    api = git.getAPI(1);
  } catch {
    return; // Git unavailable — commit tracking is simply off.
  }

  const recorded = new Set<string>();
  const watched = new Map<Repository, vscode.Disposable>();

  const watch = (repo: Repository): void => {
    if (watched.has(repo)) return;

    let lastHead = repo.state.HEAD?.commit;
    // Serialize handling per repo; onDidChange fires frequently.
    let chain: Promise<void> = Promise.resolve();

    const onChange = (): void => {
      const head = repo.state.HEAD?.commit;
      if (!head || head === lastHead) return;
      const previous = lastHead;
      lastHead = head;
      // First time we see a HEAD for this repo: just establish the baseline.
      if (!previous) return;
      chain = chain
        .then(() => (isTracking() ? recordNewCommits(repo, previous) : undefined))
        .catch(() => undefined);
    };

    watched.set(repo, repo.state.onDidChange(onChange));
  };

  const recordNewCommits = async (repo: Repository, previous: string): Promise<void> => {
    const log = await repo.log({ maxEntries: MAX_LOG });
    const fresh: Commit[] = [];
    let foundPrevious = false;
    for (const c of log) {
      if (c.hash === previous) {
        foundPrevious = true;
        break;
      }
      fresh.push(c);
    }
    // If the old HEAD isn't in recent history (amend, reset, branch switch),
    // consider only the new HEAD commit itself.
    const candidates = foundPrevious ? fresh : fresh.slice(0, 1);

    const now = Date.now();
    const project = projectName(repo.rootUri);
    // Record oldest first so events are chronological.
    for (const c of candidates.reverse()) {
      if (recorded.has(c.hash)) continue;
      const authored = c.authorDate ? new Date(c.authorDate).getTime() : NaN;
      if (!Number.isFinite(authored) || now - authored > RECENT_MS) continue;
      recorded.add(c.hash);

      store.add({
        type: 'commit',
        time: now,
        project,
        hash: c.hash.slice(0, 7),
        message: firstLine(c.message),
        files: await changedFiles(repo, c),
      });
    }
  };

  api.repositories.forEach(watch);
  ctx.subscriptions.push(
    api.onDidOpenRepository(watch),
    api.onDidCloseRepository((repo) => {
      watched.get(repo)?.dispose();
      watched.delete(repo);
    }),
    {
      dispose: () => {
        watched.forEach((d) => d.dispose());
        watched.clear();
      },
    },
  );
}

function firstLine(message: string): string {
  const line = (message ?? '').split(/\r?\n/, 1)[0].trim();
  return line.length > MAX_MESSAGE ? line.slice(0, MAX_MESSAGE - 1) + '…' : line;
}

async function changedFiles(repo: Repository, c: Commit): Promise<string[]> {
  const parent = c.parents?.[0];
  if (!parent) return [];
  try {
    const changes = await repo.diffBetween(parent, c.hash);
    const files: string[] = [];
    for (const ch of changes) {
      if (files.length >= MAX_FILES) break;
      if (isTrackable(ch.uri)) files.push(relPath(ch.uri));
    }
    return files;
  } catch {
    return [];
  }
}
