import * as vscode from 'vscode';
import { minimatch } from 'minimatch';
import { getConfig } from '../config';

const TRACKABLE_SCHEMES = new Set(['file', 'vscode-remote']);

/** Workspace-relative path with forward slashes (no workspace folder prefix). */
export function relPath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
}

/** Name of the workspace folder containing `uri`, or 'Unknown'. */
export function projectName(uri: vscode.Uri): string {
  return vscode.workspace.getWorkspaceFolder(uri)?.name ?? 'Unknown';
}

/** True if `uri` is a real workspace file that is not excluded by `devdiary.ignorePatterns`. */
export function isTrackable(uri: vscode.Uri): boolean {
  if (!TRACKABLE_SCHEMES.has(uri.scheme)) return false;
  if (!vscode.workspace.getWorkspaceFolder(uri)) return false;

  const rel = relPath(uri);
  const patterns = getConfig().ignorePatterns ?? [];
  return !patterns.some(
    (p) => typeof p === 'string' && p.length > 0 && minimatch(rel, p, { dot: true }),
  );
}
