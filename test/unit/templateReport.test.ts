import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinutes, renderTemplateReport } from '../../src/ai/templateReport';
import type { DaySummary } from '../../src/types';

const summary: DaySummary = {
  date: '2026-10-29',
  totalActiveMinutes: 135,
  totalCommits: 4,
  projects: [
    {
      name: 'devdiary',
      activeMinutes: 90,
      commits: [
        { hash: 'a1', message: 'Fix login bug', files: ['src/auth.ts'] },
        { hash: 'a2', message: 'Add session refresh\n\nLonger body text', files: ['src/session.ts'] },
        { hash: 'a3', message: 'Update README', files: ['README.md'] },
      ],
      files: [
        { path: 'src/session.ts', edits: 3, linesAdded: 10, linesRemoved: 2 },
        { path: 'src/auth.ts', edits: 9, linesAdded: 120, linesRemoved: 30 },
      ],
      createdFiles: ['src/session.ts'],
      deletedFiles: [],
      languages: ['typescript'],
    },
    {
      name: 'api',
      activeMinutes: 45,
      commits: [{ hash: 'b1', message: 'Add health endpoint', files: ['routes/health.js'] }],
      files: [{ path: 'routes/health.js', edits: 2, linesAdded: 15, linesRemoved: 0 }],
      createdFiles: [],
      deletedFiles: [],
      languages: ['javascript'],
    },
  ],
};

const empty: DaySummary = { date: '2026-10-28', totalActiveMinutes: 0, totalCommits: 0, projects: [] };

test('formatMinutes', () => {
  assert.equal(formatMinutes(135), '2h 15m');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(120), '2h');
  assert.equal(formatMinutes(0), '0m');
  assert.equal(formatMinutes(59.6), '1h');
});

test('oneline', () => {
  assert.equal(
    renderTemplateReport(summary, 'oneline'),
    'Worked ~2h 15m across 2 projects (devdiary, api) with 4 commits, mainly on src/auth.ts.',
  );
});

test('bullets groups by project and lists commits, files, created files, time', () => {
  const out = renderTemplateReport(summary, 'bullets');
  assert.match(out, /^devdiary:$/m);
  assert.match(out, /^api:$/m);
  assert.match(out, /^- Committed: Fix login bug$/m);
  assert.match(out, /^- Committed: Add session refresh$/m); // first line only
  assert.match(out, /^- Worked on src\/auth\.ts \(\+120\/−30\)$/m);
  assert.match(out, /^- Created src\/session\.ts$/m);
  assert.match(out, /^- Active time: 1h 30m$/m);
  // biggest file listed before smaller one
  assert.ok(out.indexOf('Worked on src/auth.ts') < out.indexOf('Worked on src/session.ts'));
});

test('bullets for a single project has no heading', () => {
  const single: DaySummary = { ...summary, projects: [summary.projects[1]], totalCommits: 1 };
  const out = renderTemplateReport(single, 'bullets');
  assert.ok(!out.includes('api:'));
  assert.ok(out.split('\n').every((l) => l.startsWith('- ')));
});

test('detailed is a single paragraph with the facts', () => {
  const out = renderTemplateReport(summary, 'detailed');
  assert.ok(!out.includes('\n'));
  assert.match(out, /2h 15m/);
  assert.match(out, /4 commits/);
  assert.match(out, /"Fix login bug"/);
  assert.match(out, /src\/auth\.ts/);
  assert.match(out, /In api/);
});

test('empty summary', () => {
  for (const style of ['oneline', 'bullets', 'detailed', 'standup'] as const) {
    assert.equal(renderTemplateReport(empty, style), 'No activity recorded for 2026-10-28.');
  }
});

test('standup has Done / Next / Blockers sections', () => {
  const out = renderTemplateReport(summary, 'standup');
  const sections = out.split('\n\n');
  assert.equal(sections.length, 3);
  assert.match(sections[0], /^Done:\n- devdiary: Fix login bug/);
  assert.match(sections[0], /- api: Add health endpoint/);
  assert.ok(!sections[0].includes('Longer body text'));
  // All edited files were committed, so "Next" falls back to the main project.
  assert.equal(sections[1], 'Next:\n- Continue work on devdiary');
  assert.equal(sections[2], 'Blockers:\n- None');
});

test('standup infers Next from WIP commits and uncommitted files', () => {
  const out = renderTemplateReport(
    {
      date: '2026-10-29',
      totalActiveMinutes: 30,
      totalCommits: 1,
      projects: [
        {
          name: 'solo',
          activeMinutes: 30,
          commits: [{ hash: 'w1', message: 'WIP: payment flow', files: ['pay.ts'] }],
          files: [
            { path: 'pay.ts', edits: 2, linesAdded: 5, linesRemoved: 0 },
            { path: 'cart.ts', edits: 4, linesAdded: 20, linesRemoved: 1 },
          ],
          createdFiles: [],
          deletedFiles: [],
          languages: ['typescript'],
        },
      ],
    },
    'standup',
  );
  assert.match(out, /^Done:\n- WIP: payment flow$/m);
  assert.match(out, /Next:\n- Finish: WIP: payment flow\n- Continue work on cart\.ts$/m);
  assert.ok(!out.includes('Continue work on pay.ts'));
});

const weekSummary: DaySummary = {
  ...summary,
  date: '2026-10-23 → 2026-10-29',
  days: [
    { date: '2026-10-23', activeMinutes: 60, commits: 2 },
    { date: '2026-10-24', activeMinutes: 0, commits: 0 },
    { date: '2026-10-29', activeMinutes: 75, commits: 2 },
  ],
};

test('weekly template variants', () => {
  assert.match(renderTemplateReport(weekSummary, 'oneline'), /^This week, worked ~2h 15m/);
  assert.match(renderTemplateReport(weekSummary, 'bullets'), /- Active on 2 of 3 days$/);
  const detailed = renderTemplateReport(weekSummary, 'detailed');
  assert.match(detailed, /^During 2026-10-23 → 2026-10-29 \(2 active days\)/);
  const standup = renderTemplateReport(weekSummary, 'standup');
  assert.match(standup, /^Done this week:\n/);
  assert.match(standup, /\n\nNext week:\n/);
  assert.match(standup, /\n\nBlockers:\n- None$/);
  // Daily summaries are unaffected.
  assert.match(renderTemplateReport(summary, 'oneline'), /^Worked ~/);
});
