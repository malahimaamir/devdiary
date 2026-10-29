import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, summarizeRange } from '../../src/summarizer/summarize';
import type { ActivityEvent, DayLog } from '../../src/types';

const T0 = new Date(2026, 9, 29, 9, 0, 0).getTime();
const at = (min: number): number => T0 + min * 60_000;

const save = (project: string, file: string, time: number, added = 0, removed = 0, language = 'typescript'): ActivityEvent => ({
  type: 'save',
  time,
  project,
  file,
  language,
  linesAdded: added,
  linesRemoved: removed,
});

const active = (project: string, time: number, seconds = 60): ActivityEvent => ({
  type: 'active',
  time,
  project,
  file: 'x.ts',
  seconds,
});

test('empty log yields an empty summary', () => {
  const s = summarize({ date: '2026-10-29', events: [] });
  assert.deepEqual(s, { date: '2026-10-29', totalActiveMinutes: 0, totalCommits: 0, projects: [] });
});

test('groups events by project and aggregates file stats', () => {
  const log: DayLog = {
    date: '2026-10-29',
    events: [
      save('api', 'src/a.ts', at(1), 10, 2),
      save('api', 'src/a.ts', at(2), 5, 1),
      save('web', 'app.tsx', at(3), 3, 0, 'typescriptreact'),
      { type: 'create', time: at(4), project: 'api', file: 'src/new.ts' },
      { type: 'create', time: at(5), project: 'api', file: 'src/new.ts' },
      { type: 'delete', time: at(6), project: 'web', file: 'old.css' },
      active('api', at(7)),
      active('api', at(8)),
      active('web', at(9)),
    ],
  };
  const s = summarize(log);
  assert.equal(s.projects.length, 2);
  const [api, web] = s.projects;
  assert.equal(api.name, 'api');
  assert.equal(api.activeMinutes, 2);
  assert.deepEqual(api.files, [{ path: 'src/a.ts', edits: 2, linesAdded: 15, linesRemoved: 3 }]);
  assert.deepEqual(api.createdFiles, ['src/new.ts']);
  assert.deepEqual(api.languages, ['typescript']);
  assert.equal(web.name, 'web');
  assert.deepEqual(web.deletedFiles, ['old.css']);
  assert.deepEqual(web.languages, ['typescriptreact']);
  assert.equal(s.totalActiveMinutes, 3);
});

test('active minutes are rounded from summed seconds', () => {
  const s = summarize({
    date: '2026-10-29',
    events: [active('p', at(0), 60), active('p', at(1), 60), active('p', at(2), 40)],
  });
  assert.equal(s.projects[0].activeMinutes, 3); // 160s -> 2.67 -> 3
  assert.equal(s.totalActiveMinutes, 3);
});

test('caps files at 15, ranked by edits and line churn', () => {
  const events: ActivityEvent[] = [];
  for (let i = 0; i < 20; i++) {
    // file i gets i saves of 1 line each
    for (let j = 0; j < i + 1; j++) events.push(save('p', `f${i}.ts`, at(i * 30 + j), 1, 0));
  }
  // A single save with huge churn should rank near the top.
  events.push(save('p', 'big.ts', at(999), 1000, 0));
  const s = summarize({ date: '2026-10-29', events });
  const files = s.projects[0].files;
  assert.equal(files.length, 15);
  assert.equal(files[0].path, 'big.ts');
  assert.equal(files[1].path, 'f19.ts');
  assert.ok(!files.some((f) => f.path === 'f0.ts'));
});

test('dedups commits by hash and keeps chronological order', () => {
  const s = summarize({
    date: '2026-10-29',
    events: [
      { type: 'commit', time: at(20), project: 'p', hash: 'bbbbbbb', message: 'second', files: ['b.ts'] },
      { type: 'commit', time: at(10), project: 'p', hash: 'aaaaaaa', message: 'first', files: ['a.ts'] },
      { type: 'commit', time: at(30), project: 'p', hash: 'aaaaaaa', message: 'first', files: ['a.ts'] },
    ],
  });
  assert.deepEqual(
    s.projects[0].commits.map((c) => c.hash),
    ['aaaaaaa', 'bbbbbbb'],
  );
  assert.equal(s.totalCommits, 2);
});

test('sorts projects by active minutes, then commits', () => {
  const s = summarize({
    date: '2026-10-29',
    events: [
      { type: 'commit', time: at(1), project: 'committer', hash: 'c1', message: 'm', files: [] },
      save('idle', 'a.ts', at(2)),
      active('busy', at(3)),
    ],
  });
  assert.deepEqual(
    s.projects.map((p) => p.name),
    ['busy', 'committer', 'idle'],
  );
});

test('drops plaintext from languages only when others exist', () => {
  const s = summarize({
    date: '2026-10-29',
    events: [
      save('a', 'notes.txt', at(1), 1, 0, 'plaintext'),
      save('a', 'x.py', at(2), 1, 0, 'python'),
      save('b', 'notes.txt', at(3), 1, 0, 'plaintext'),
    ],
  });
  const byName = Object.fromEntries(s.projects.map((p) => [p.name, p.languages]));
  assert.deepEqual(byName.a, ['python']);
  assert.deepEqual(byName.b, ['plaintext']);
});

test('summarize does not set a per-day breakdown', () => {
  const s = summarize({ date: '2026-10-29', events: [active('p', at(0))] });
  assert.equal(s.days, undefined);
});

test('summarizeRange merges days and adds a per-day breakdown', () => {
  const day = (offset: number): number => new Date(2026, 9, 23 + offset, 10, 0, 0).getTime();
  const s = summarizeRange([
    // passed out of order on purpose
    {
      date: '2026-10-29',
      events: [
        save('api', 'src/a.ts', day(6), 5, 1),
        { type: 'commit', time: day(6) + 1, project: 'api', hash: 'c2', message: 'second', files: ['src/a.ts'] },
      ],
    },
    { date: '2026-10-24', events: [] },
    {
      date: '2026-10-23',
      events: [
        save('api', 'src/a.ts', day(0), 10, 2),
        active('api', day(0), 120),
        { type: 'commit', time: day(0) + 1, project: 'api', hash: 'c1', message: 'first', files: ['src/a.ts'] },
        // same commit seen again later in the week is counted once overall
        { type: 'commit', time: day(0) + 2, project: 'api', hash: 'c1', message: 'first', files: ['src/a.ts'] },
      ],
    },
  ]);
  assert.equal(s.date, '2026-10-23 → 2026-10-29');
  assert.equal(s.totalCommits, 2);
  assert.equal(s.totalActiveMinutes, 2);
  assert.equal(s.projects.length, 1);
  assert.deepEqual(s.projects[0].files, [{ path: 'src/a.ts', edits: 2, linesAdded: 15, linesRemoved: 3 }]);
  assert.deepEqual(
    s.projects[0].commits.map((c) => c.hash),
    ['c1', 'c2'],
  );
  assert.deepEqual(s.days, [
    { date: '2026-10-23', activeMinutes: 2, commits: 1 },
    { date: '2026-10-24', activeMinutes: 0, commits: 0 },
    { date: '2026-10-29', activeMinutes: 0, commits: 1 },
  ]);
});

test('summarizeRange of no logs is empty', () => {
  const s = summarizeRange([]);
  assert.equal(s.date, '');
  assert.equal(s.totalCommits, 0);
  assert.deepEqual(s.projects, []);
  assert.deepEqual(s.days, []);
});
