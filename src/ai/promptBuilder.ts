import type { DaySummary, Style } from '../types';

function standupRules(done: string, next: string, nextHint: string): string {
  return [
    `FORMAT: a standup update with exactly three sections, in this order: "${done}", "${next}", "Blockers".`,
    'Translate these three headings into the report language (keep them in English only if the report language is English).',
    'Write each heading on its own plain line ending with a colon (no "#", no bold), followed by bullet points starting with "- ".',
    'Leave one blank line between sections.',
    `"${done}": the actual work, inferred from the data.`,
    `"${next}": ${nextHint} Infer cautiously from unfinished-looking work (e.g. WIP commits, files edited but not committed); otherwise write a single short bullet like "Continue work on X". Never invent new tasks.`,
    '"Blockers": only list a blocker if the data clearly suggests one (e.g. reverts, repeated fix attempts on the same problem); otherwise write a single bullet "None" (translated into the report language).',
  ].join('\n');
}

const STYLE_RULES: Record<Style, string> = {
  oneline: [
    'FORMAT: exactly ONE sentence of at most 30 words.',
    'No bullets, no line breaks, no headings.',
  ].join('\n'),
  bullets: [
    'FORMAT: 3 to 8 bullet points, each line starting with "- ".',
    'Each bullet describes one meaningful unit of work.',
    'Only if the data contains more than one project, group the bullets under a plain line with the project name followed by a colon; otherwise use no grouping line at all.',
  ].join('\n'),
  detailed: [
    'FORMAT: one cohesive paragraph of 120 to 200 words.',
    'No bullets, no headings, no line breaks inside the paragraph.',
  ].join('\n'),
  standup: standupRules('Done', 'Next', 'what the developer will most likely do next.'),
};

const WEEKLY_STYLE_RULES: Record<Style, string> = {
  oneline: [
    'FORMAT: exactly ONE sentence of at most 40 words summarizing the whole week.',
    'No bullets, no line breaks, no headings.',
  ].join('\n'),
  bullets: [
    'FORMAT: 5 to 10 bullet points, each line starting with "- ".',
    'Each bullet describes one theme or meaningful piece of progress during the week.',
    'Only if the data contains more than one project, group the bullets under a plain line with the project name followed by a colon; otherwise use no grouping line at all.',
  ].join('\n'),
  detailed: [
    'FORMAT: one cohesive paragraph of 150 to 250 words covering the whole week.',
    'No bullets, no headings, no line breaks inside the paragraph.',
  ].join('\n'),
  standup: standupRules('Done this week', 'Next week', 'what the developer will most likely work on next week.'),
};

const STYLE_NAMES: Record<Style, string> = {
  oneline: 'one sentence (max 30 words)',
  bullets: '3-8 bullets starting with "- "',
  detailed: 'one paragraph of 120-200 words',
  standup: 'a standup with "Done", "Next" and "Blockers" sections (headings translated)',
};

const WEEKLY_STYLE_NAMES: Record<Style, string> = {
  oneline: 'one sentence (max 40 words)',
  bullets: '5-10 bullets starting with "- "',
  detailed: 'one paragraph of 150-250 words',
  standup: 'a standup with "Done this week", "Next week" and "Blockers" sections (headings translated)',
};

/** Drops empty arrays (recursively) so the JSON stays compact. */
function compact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compact);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length === 0) continue;
      if (v === undefined) continue;
      out[key] = compact(v);
    }
    return out;
  }
  return value;
}

export function buildPrompt(
  summary: DaySummary,
  language: string,
  style: Style,
): { system: string; user: string } {
  const lang = language.trim() || 'English';
  const romanized = /\broman(ized)?\b|\blatin\b/i.test(lang);
  const weekly = summary.days !== undefined;

  const system = [
    `You are a professional writer of software developers' ${weekly ? 'weekly' : 'daily'} work reports.`,
    weekly
      ? 'You receive structured activity data (projects, commit messages, file paths, line counts, active time) for a whole week and turn it into a short report of what the developer accomplished that week.'
      : 'You receive structured activity data (projects, commit messages, file paths, line counts, active time) and turn it into a short report of what the developer accomplished that day.',
    ...(weekly
      ? [
          '',
          'WEEKLY REPORT:',
          `- This is a WEEKLY report covering ${summary.date}, not a daily one.`,
          '- Summarize themes and overall progress across the week; do not go through it day by day.',
          '- The "days" array is a per-day breakdown of active minutes and commits; use it only as context.',
        ]
      : []),
    '',
    'LANGUAGE:',
    `- Write ONLY in ${lang}. Every sentence of the report must be in ${lang}.`,
    romanized
      ? `- "${lang}" is a romanized form: write it in Latin script, not the native script.`
      : `- If ${lang} is a romanized form of a language, use Latin script.`,
    '- Keep technical terms, file names, function names, library and project names unchanged (do not translate or transliterate them).',
    '',
    'CONTENT:',
    '- Describe the work in human terms inferred from commit messages and file names (e.g. "Implemented login validation"), not as a list of files.',
    '- Do not list raw statistics (line counts, minutes) unless they genuinely help the reader.',
    '- Never invent work that is not supported by the data.',
    '- Output only the report: no preface, no sign-off, no explanations, no markdown headings, no bold/italics.',
    '',
    (weekly ? WEEKLY_STYLE_RULES : STYLE_RULES)[style],
  ].join('\n');

  const data = JSON.stringify(compact(summary));
  const user = [
    'Activity data (JSON):',
    data,
    '',
    weekly ? `Week: ${summary.date}` : `Date: ${summary.date}`,
    '',
    `Write the ${weekly ? 'weekly ' : ''}report now in ${lang}, as ${(weekly ? WEEKLY_STYLE_NAMES : STYLE_NAMES)[style]}. Output only the report.`,
  ].join('\n');

  return { system, user };
}
