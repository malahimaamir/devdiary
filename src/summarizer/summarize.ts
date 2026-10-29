import type { ActivityEvent, DayLog, DaySummary, FileStat, ProjectSummary } from '../types';

const MAX_FILES = 15;
const MAX_CREATED_DELETED = 20;

interface ProjectAcc {
  name: string;
  activeSeconds: number;
  commits: Map<string, { hash: string; message: string; files: string[] }>;
  files: Map<string, FileStat>;
  created: Set<string>;
  deleted: Set<string>;
  languages: Set<string>;
}

/** Aggregate a day's raw events into a compact per-project summary. Pure. */
export function summarize(log: DayLog): DaySummary {
  return aggregate(log.date, log.events);
}

/**
 * Aggregate several days (e.g. a week) into one summary. Pure.
 * `date` becomes "FIRST → LAST" and `days` holds a per-day breakdown in date order.
 */
export function summarizeRange(logs: DayLog[]): DaySummary {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const label = sorted.length === 0 ? '' : `${sorted[0].date} → ${sorted[sorted.length - 1].date}`;
  const summary = aggregate(label, sorted.flatMap((l) => l.events));
  summary.days = sorted.map((l) => {
    const day = summarize(l);
    return { date: l.date, activeMinutes: day.totalActiveMinutes, commits: day.totalCommits };
  });
  return summary;
}

function aggregate(date: string, rawEvents: readonly ActivityEvent[]): DaySummary {
  const projects = new Map<string, ProjectAcc>();
  const acc = (name: string): ProjectAcc => {
    let p = projects.get(name);
    if (!p) {
      p = {
        name,
        activeSeconds: 0,
        commits: new Map(),
        files: new Map(),
        created: new Set(),
        deleted: new Set(),
        languages: new Set(),
      };
      projects.set(name, p);
    }
    return p;
  };

  const events = [...rawEvents].sort((a, b) => a.time - b.time);
  for (const e of events) {
    const p = acc(e.project || 'Unknown');
    switch (e.type) {
      case 'save': {
        let f = p.files.get(e.file);
        if (!f) p.files.set(e.file, (f = { path: e.file, edits: 0, linesAdded: 0, linesRemoved: 0 }));
        f.edits += 1;
        f.linesAdded += e.linesAdded || 0;
        f.linesRemoved += e.linesRemoved || 0;
        if (e.language) p.languages.add(e.language);
        break;
      }
      case 'create':
        p.created.add(e.file);
        break;
      case 'delete':
        p.deleted.add(e.file);
        break;
      case 'commit':
        if (!p.commits.has(e.hash)) {
          p.commits.set(e.hash, { hash: e.hash, message: e.message, files: [...e.files] });
        }
        break;
      case 'active':
        p.activeSeconds += e.seconds || 0;
        break;
    }
  }

  const score = (f: FileStat): number => f.edits + (f.linesAdded + f.linesRemoved) / 20;

  const summaries: ProjectSummary[] = [...projects.values()].map((p) => {
    let languages = [...p.languages];
    if (languages.length > 1) languages = languages.filter((l) => l !== 'plaintext');
    return {
      name: p.name,
      activeMinutes: Math.round(p.activeSeconds / 60),
      commits: [...p.commits.values()],
      files: [...p.files.values()]
        .sort((a, b) => score(b) - score(a) || a.path.localeCompare(b.path))
        .slice(0, MAX_FILES),
      createdFiles: [...p.created].slice(0, MAX_CREATED_DELETED),
      deletedFiles: [...p.deleted].slice(0, MAX_CREATED_DELETED),
      languages,
    };
  });

  summaries.sort(
    (a, b) =>
      b.activeMinutes - a.activeMinutes ||
      b.commits.length - a.commits.length ||
      a.name.localeCompare(b.name),
  );

  return {
    date,
    totalActiveMinutes: summaries.reduce((n, p) => n + p.activeMinutes, 0),
    totalCommits: summaries.reduce((n, p) => n + p.commits.length, 0),
    projects: summaries,
  };
}
