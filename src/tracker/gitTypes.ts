/**
 * Minimal subset of the built-in `vscode.git` extension API (v1) used by
 * DevDiary. Only the members we actually touch are declared.
 */
import type { Event, Uri } from 'vscode';

export interface Commit {
  readonly hash: string;
  readonly message: string;
  readonly parents: string[];
  readonly authorDate?: Date;
  readonly authorEmail?: string;
}

export interface Branch {
  readonly name?: string;
  readonly commit?: string;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly onDidChange: Event<void>;
}

export interface Change {
  readonly uri: Uri;
  readonly originalUri: Uri;
}

export interface LogOptions {
  readonly maxEntries?: number;
}

export interface Repository {
  readonly rootUri: Uri;
  readonly state: RepositoryState;
  log(options?: LogOptions): Promise<Commit[]>;
  diffBetween(ref1: string, ref2: string): Promise<Change[]>;
}

export interface API {
  readonly state: 'uninitialized' | 'initialized';
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
}

export interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): API;
}
