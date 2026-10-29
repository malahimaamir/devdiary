import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../../src/ai/promptBuilder';
import type { DaySummary } from '../../src/types';

const summary: DaySummary = {
  date: '2026-10-29',
  totalActiveMinutes: 135,
  totalCommits: 1,
  projects: [
    {
      name: 'devdiary',
      activeMinutes: 135,
      commits: [{ hash: 'abc1234', message: 'Add login validation', files: ['src/auth.ts'] }],
      files: [{ path: 'src/auth.ts', edits: 7, linesAdded: 120, linesRemoved: 30 }],
      createdFiles: [],
      deletedFiles: [],
      languages: ['typescript'],
    },
  ],
};

function jsonOf(user: string): Record<string, unknown> {
  const line = user.split('\n').find((l) => l.trim().startsWith('{'));
  assert.ok(line, 'user message should contain a JSON line');
  return JSON.parse(line) as Record<string, unknown>;
}

test('language appears in system prompt and trailing reminder', () => {
  const { system, user } = buildPrompt(summary, 'Urdu', 'bullets');
  assert.match(system, /Write ONLY in Urdu/);
  const lastLine = user.trim().split('\n').at(-1) ?? '';
  assert.match(lastLine, /Urdu/);
  assert.match(lastLine, /bullets/);
});

test('romanized languages ask for Latin script', () => {
  const { system } = buildPrompt(summary, 'Roman Urdu', 'oneline');
  assert.match(system, /Roman Urdu/);
  assert.match(system, /Latin script, not the native script/);
});

test('empty language falls back to English', () => {
  const { system } = buildPrompt(summary, '   ', 'oneline');
  assert.match(system, /Write ONLY in English/);
});

test('style rules differ per style', () => {
  const one = buildPrompt(summary, 'English', 'oneline');
  const bul = buildPrompt(summary, 'English', 'bullets');
  const det = buildPrompt(summary, 'English', 'detailed');
  assert.match(one.system, /ONE sentence of at most 30 words/);
  assert.match(bul.system, /3 to 8 bullet points/);
  assert.match(bul.system, /"- "/);
  assert.match(det.system, /120 to 200 words/);
  assert.notEqual(one.system, bul.system);
  assert.notEqual(bul.system, det.system);
  assert.notEqual(one.user, det.user);
});

test('user message contains the data and date', () => {
  const { user } = buildPrompt(summary, 'English', 'detailed');
  assert.match(user, /Date: 2026-10-29/);
  const data = jsonOf(user);
  const projects = data.projects as Record<string, unknown>[];
  assert.equal(projects[0].name, 'devdiary');
  assert.match(user, /Add login validation/);
  assert.match(user, /src\/auth\.ts/);
});

test('empty arrays are omitted from the JSON', () => {
  const { user } = buildPrompt(summary, 'English', 'bullets');
  const project = (jsonOf(user).projects as Record<string, unknown>[])[0];
  assert.ok(!('createdFiles' in project));
  assert.ok(!('deletedFiles' in project));
  assert.ok('commits' in project);
  assert.ok(!user.includes('[]'));
});

test('standup style asks for Done / Next / Blockers with translated headings', () => {
  const { system, user } = buildPrompt(summary, 'Deutsch', 'standup');
  assert.match(system, /"Done", "Next", "Blockers"/);
  assert.match(system, /Translate these three headings/);
  assert.match(system, /"- "/);
  assert.match(system, /WIP commits/);
  assert.match(system, /"None"/);
  assert.match(user.trim().split('\n').at(-1) ?? '', /Deutsch.*standup/);
  assert.ok(!/WEEKLY/.test(system));
});

const weekly: DaySummary = {
  ...summary,
  date: '2026-10-23 → 2026-10-29',
  days: [
    { date: '2026-10-23', activeMinutes: 60, commits: 0 },
    { date: '2026-10-29', activeMinutes: 75, commits: 1 },
  ],
};

test('daily summaries are not described as weekly', () => {
  const { system, user } = buildPrompt(summary, 'English', 'bullets');
  assert.match(system, /daily work reports/);
  assert.ok(!/WEEKLY/.test(system));
  assert.match(user, /Date: 2026-10-29/);
});

test('weekly summaries produce a weekly prompt covering the range', () => {
  const { system, user } = buildPrompt(weekly, 'English', 'bullets');
  assert.match(system, /WEEKLY report covering 2026-10-23 → 2026-10-29/);
  assert.match(system, /themes/);
  assert.match(system, /5 to 10 bullet points/);
  assert.match(user, /Week: 2026-10-23 → 2026-10-29/);
  assert.match(user.trim().split('\n').at(-1) ?? '', /weekly report/);
  const days = jsonOf(user).days as Record<string, unknown>[];
  assert.equal(days.length, 2);
});

test('weekly style rules', () => {
  assert.match(buildPrompt(weekly, 'English', 'oneline').system, /ONE sentence/);
  assert.match(buildPrompt(weekly, 'English', 'detailed').system, /150 to 250 words/);
  const standup = buildPrompt(weekly, 'Urdu', 'standup').system;
  assert.match(standup, /"Done this week", "Next week", "Blockers"/);
});
