import type { DaySummary, ProjectSummary, Style } from '../types';

/** 135 → "2h 15m", 45 → "45m", 120 → "2h". */
export function formatMinutes(m: number): string {
  const total = Math.max(0, Math.round(m));
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (h === 0) return `${min}m`;
  return min === 0 ? `${h}h` : `${h}h ${min}m`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function isEmpty(summary: DaySummary): boolean {
  return (
    summary.totalActiveMinutes <= 0 &&
    summary.totalCommits <= 0 &&
    summary.projects.every(
      (p) => p.files.length === 0 && p.commits.length === 0 && p.createdFiles.length === 0 && p.deletedFiles.length === 0,
    )
  );
}

function topFiles(p: ProjectSummary, n: number) {
  return [...p.files]
    .sort((a, b) => b.linesAdded + b.linesRemoved - (a.linesAdded + a.linesRemoved) || b.edits - a.edits)
    .slice(0, n);
}

function mainFile(summary: DaySummary): string | undefined {
  let best: { path: string; score: number } | undefined;
  for (const p of summary.projects) {
    for (const f of p.files) {
      const score = f.linesAdded + f.linesRemoved + f.edits;
      if (!best || score > best.score) best = { path: f.path, score };
    }
  }
  return best?.path;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function isWeekly(summary: DaySummary): boolean {
  return summary.days !== undefined;
}

function activeDays(summary: DaySummary): number {
  return (summary.days ?? []).filter((d) => d.activeMinutes > 0 || d.commits > 0).length;
}

function firstLine(message: string): string {
  return message.split('\n')[0].trim();
}

function renderOneline(summary: DaySummary): string {
  const names = summary.projects.map((p) => p.name);
  const projectPart =
    names.length === 0
      ? ''
      : names.length === 1
        ? ` on ${names[0]}`
        : ` across ${plural(names.length, 'project')} (${names.join(', ')})`;
  const prefix = isWeekly(summary) ? 'This week, ' : '';
  let s = `${prefix}${prefix ? 'worked' : 'Worked'} ~${formatMinutes(summary.totalActiveMinutes)}${projectPart} with ${plural(summary.totalCommits, 'commit')}`;
  const file = mainFile(summary);
  if (file) s += `, mainly on ${file}`;
  return `${s}.`;
}

function renderBullets(summary: DaySummary): string {
  const multi = summary.projects.length > 1;
  const sections: string[] = [];
  for (const p of summary.projects) {
    const lines: string[] = [];
    for (const c of p.commits) lines.push(`- Committed: ${c.message.split('\n')[0].trim()}`);
    for (const f of topFiles(p, 5)) lines.push(`- Worked on ${f.path} (+${f.linesAdded}/−${f.linesRemoved})`);
    if (p.createdFiles.length) lines.push(`- Created ${list(p.createdFiles)}`);
    if (p.deletedFiles.length) lines.push(`- Deleted ${list(p.deletedFiles)}`);
    if (p.activeMinutes > 0) lines.push(`- Active time: ${formatMinutes(p.activeMinutes)}`);
    if (lines.length === 0) continue;
    sections.push(multi ? `${p.name}:\n${lines.join('\n')}` : lines.join('\n'));
  }
  if (isWeekly(summary) && summary.days?.length) {
    sections.push(`- Active on ${activeDays(summary)} of ${plural(summary.days.length, 'day')}`);
  }
  return sections.join('\n\n');
}

function renderDetailed(summary: DaySummary): string {
  const sentences: string[] = [];
  const n = summary.projects.length;
  const when = isWeekly(summary)
    ? `During ${summary.date} (${plural(activeDays(summary), 'active day')})`
    : `On ${summary.date}`;
  sentences.push(
    `${when}, I was active for about ${formatMinutes(summary.totalActiveMinutes)}` +
      (n === 0 ? '' : n === 1 ? ` on ${summary.projects[0].name}` : ` across ${plural(n, 'project')}`) +
      `, making ${plural(summary.totalCommits, 'commit')}.`,
  );
  for (const p of summary.projects) {
    const parts: string[] = [];
    if (p.commits.length) {
      parts.push(`committed ${list(p.commits.map((c) => `"${c.message.split('\n')[0].trim()}"`))}`);
    }
    const files = topFiles(p, 3);
    if (files.length) {
      parts.push(`worked mostly on ${list(files.map((f) => `${f.path} (+${f.linesAdded}/−${f.linesRemoved})`))}`);
    }
    if (p.createdFiles.length) parts.push(`created ${list(p.createdFiles)}`);
    if (p.deletedFiles.length) parts.push(`removed ${list(p.deletedFiles)}`);
    if (!parts.length) continue;
    const time = p.activeMinutes > 0 && n > 1 ? ` (${formatMinutes(p.activeMinutes)})` : '';
    const lang = p.languages.length ? `, mainly in ${list(p.languages)}` : '';
    sentences.push(`In ${p.name}${time}, I ${list(parts)}${lang}.`);
  }
  return sentences.join(' ');
}

const WIP_RE = /\b(wip|todo|work in progress|in progress|draft|temp)\b/i;

function renderStandup(summary: DaySummary): string {
  const weekly = isWeekly(summary);
  const multi = summary.projects.length > 1;
  const done: string[] = [];
  const next: string[] = [];

  for (const p of summary.projects) {
    const tag = multi ? `${p.name}: ` : '';
    const committed = new Set(p.commits.flatMap((c) => c.files));
    for (const c of p.commits) {
      const msg = firstLine(c.message);
      done.push(`- ${tag}${msg}`);
      if (WIP_RE.test(msg)) next.push(`- ${tag}Finish: ${msg}`);
    }
    if (!p.commits.length) {
      for (const f of topFiles(p, 3)) done.push(`- ${tag}Worked on ${f.path} (+${f.linesAdded}/−${f.linesRemoved})`);
    }
    if (p.createdFiles.length) done.push(`- ${tag}Created ${list(p.createdFiles)}`);
    if (p.deletedFiles.length) done.push(`- ${tag}Deleted ${list(p.deletedFiles)}`);
    for (const f of topFiles(p, 3).filter((f) => !committed.has(f.path))) {
      next.push(`- ${tag}Continue work on ${f.path}`);
    }
  }
  if (!done.length && summary.totalActiveMinutes > 0) {
    done.push(`- Active for ~${formatMinutes(summary.totalActiveMinutes)}`);
  }
  if (!next.length && summary.projects.length) {
    next.push(`- Continue work on ${summary.projects[0].name}`);
  }

  return [
    `${weekly ? 'Done this week' : 'Done'}:\n${done.join('\n')}`,
    `${weekly ? 'Next week' : 'Next'}:\n${next.join('\n')}`,
    'Blockers:\n- None',
  ].join('\n\n');
}

/** Deterministic English report used when no AI provider is available. */
export function renderTemplateReport(summary: DaySummary, style: Style): string {
  if (isEmpty(summary)) return `No activity recorded for ${summary.date}.`;
  switch (style) {
    case 'oneline':
      return renderOneline(summary);
    case 'bullets':
      return renderBullets(summary);
    case 'detailed':
      return renderDetailed(summary);
    case 'standup':
      return renderStandup(summary);
  }
}
