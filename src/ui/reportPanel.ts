import * as vscode from 'vscode';
import * as os from 'os';
import { Style } from '../types';

export interface ReportPanelData {
  date: string;
  report: string;
  language: string;
  style: Style;
  providerLabel: string;
}

type RegenerateHandler = (language: string, style: Style) => void;

// `Style | 'standup'` keeps this file compiling whether or not types.ts already lists 'standup'.
type PanelStyle = Style | 'standup';
const STYLES: PanelStyle[] = ['oneline', 'bullets', 'detailed', 'standup'];
const STYLE_LABELS: Record<PanelStyle, string> = {
  oneline: 'One line',
  bullets: 'Bullets',
  detailed: 'Detailed',
  standup: 'Standup (Done / Next / Blockers)',
};
const LANGUAGES = [
  'English', 'Urdu', 'Roman Urdu', 'Hindi', 'Arabic',
  'Spanish', 'French', 'German', 'Turkish', 'Chinese',
];

/** Single-instance webview showing the latest generated report. */
export class ReportPanel {
  private static current: ReportPanel | undefined;

  private data: ReportPanelData;
  private onRegenerate: RegenerateHandler;
  private renderId = 0;
  private readonly disposables: vscode.Disposable[] = [];

  static show(ctx: vscode.ExtensionContext, data: ReportPanelData, onRegenerate: RegenerateHandler): void {
    const existing = ReportPanel.current;
    if (existing) {
      existing.data = data;
      existing.onRegenerate = onRegenerate;
      existing.render();
      // Reveal in its current column; `Beside` would move the panel to a new group when it is the active editor.
      existing.panel.reveal(undefined, false);
      return;
    }
    const mediaRoot = vscode.Uri.joinPath(ctx.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      'devdiary.report',
      `DevDiary — ${data.date}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [mediaRoot] },
    );
    ReportPanel.current = new ReportPanel(panel, mediaRoot, data, onRegenerate);
  }

  /** Re-enables the toolbar when a regeneration ends without a new report (cancel / error / busy). */
  static setIdle(): void {
    const current = ReportPanel.current;
    if (!current) {
      return;
    }
    if (current.panel.visible) {
      void current.panel.webview.postMessage({ type: 'idle' });
    } else {
      // Messages to a hidden webview are dropped (retainContextWhenHidden=false), and its persisted
      // `loading` state would be restored on reveal; re-render so it comes back with a fresh stamp.
      current.render();
    }
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly mediaRoot: vscode.Uri,
    data: ReportPanelData,
    onRegenerate: RegenerateHandler,
  ) {
    this.data = data;
    this.onRegenerate = onRegenerate;
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
    panel.webview.onDidReceiveMessage((msg: unknown) => void this.handleMessage(msg), null, this.disposables);
    this.render();
  }

  private dispose(): void {
    ReportPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private async handleMessage(msg: unknown): Promise<void> {
    if (!msg || typeof msg !== 'object') {
      return;
    }
    const m = msg as { type?: unknown; language?: unknown; style?: unknown; text?: unknown };
    // The webview sends the current (possibly user-edited) text; fall back to the generated report.
    const text = typeof m.text === 'string' ? m.text : this.data.report;
    switch (m.type) {
      case 'copy':
        await vscode.env.clipboard.writeText(text);
        vscode.window.setStatusBarMessage('$(check) DevDiary: Copied', 2500);
        break;
      case 'save':
        await this.saveAs(text);
        break;
      case 'regenerate': {
        const language =
          typeof m.language === 'string' && m.language.trim() ? m.language.trim() : this.data.language;
        const style = STYLES.includes(m.style as PanelStyle) ? (m.style as Style) : this.data.style;
        this.onRegenerate(language, style);
        break;
      }
    }
  }

  private async saveAs(report: string): Promise<void> {
    const { date } = this.data;
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(os.homedir());
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(folder, `devdiary-report-${safeFileName(date)}.md`),
      filters: { Markdown: ['md'] },
      saveLabel: 'Save Report',
    });
    if (!target) {
      return;
    }
    try {
      const content = `# ${reportTitle(date)}\n\n${report.replace(/\s+$/, '')}\n`;
      await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
      vscode.window.setStatusBarMessage(`$(check) DevDiary: Saved ${target.fsPath}`, 3000);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`DevDiary: could not save report (${reason}).`);
    }
  }

  /** Re-renders the whole document; simple and survives webview reloads (retainContextWhenHidden=false). */
  private render(): void {
    this.panel.title = `DevDiary — ${this.data.date}`;
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const nonce = makeNonce();
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.mediaRoot, 'report.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.mediaRoot, 'report.js'));
    const { date, report, language, style, providerLabel } = this.data;
    // Unique per render so the webview can tell stale persisted input state from fresh data.
    const stamp = `${date}|${Date.now()}|${++this.renderId}`;
    const title = reportTitle(date);
    // Raw report for the editor, as JSON in a non-executed data block; `<` is escaped so the
    // report text can never close the tag.
    const originalJson = JSON.stringify(report).replace(/</g, '\\u003c');

    const styleOptions = STYLES.map(
      (s) => `<option value="${s}"${s === style ? ' selected' : ''}>${STYLE_LABELS[s]}</option>`,
    ).join('');
    const langOptions = LANGUAGES.map((l) => `<option value="${escapeHtml(l)}"></option>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${cssUri}">
<title>${escapeHtml(title)}</title>
</head>
<body data-stamp="${escapeHtml(stamp)}">
<header class="header">
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${escapeHtml(providerLabel)} · ${escapeHtml(STYLE_LABELS[style] ?? style)} · ${escapeHtml(language)}<span id="edited" class="edited" hidden> · edited</span></div>
</header>
<div class="toolbar" role="toolbar">
  <label class="field">
    <span>Language</span>
    <input id="language" type="text" list="languages" value="${escapeHtml(language)}" spellcheck="false" autocomplete="off">
    <datalist id="languages">${langOptions}</datalist>
  </label>
  <label class="field">
    <span>Style</span>
    <select id="style">${styleOptions}</select>
  </label>
  <div class="buttons">
    <button id="regenerate" class="primary">Regenerate</button>
    <button id="edit" class="secondary" title="Edit the report text before copying or saving">Edit</button>
    <button id="reset" class="secondary" title="Discard edits and restore the generated text" hidden>Reset</button>
    <button id="copy" class="secondary">Copy</button>
    <button id="save" class="secondary">Save as .md</button>
  </div>
</div>
<div id="status" class="status" aria-live="polite"></div>
<article id="report" class="report" dir="auto">
${renderReportHtml(report)}
</article>
<textarea id="editor" class="editor" dir="auto" aria-label="Edit report" hidden></textarea>
<script id="report-original" type="application/json" nonce="${nonce}">${originalJson}</script>
<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

/** "Daily Report — <date>", or "Weekly Report — <range>" when `date` is a range label ("a → b"). */
function reportTitle(date: string): string {
  return `${date.includes('→') ? 'Weekly' : 'Daily'} Report — ${date}`;
}

/** Filesystem-safe fragment for the default save filename (valid on Windows too). */
function safeFileName(date: string): string {
  const safe = date
    .replace(/\s*→\s*/g, '_to_')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[. ]+$/, '');
  return safe || 'report';
}

/**
 * Converts the plain-text / light-markdown report into safe HTML. Everything is escaped first.
 * Keep in sync with renderReportHtml in media/report.js (used to preview edited text).
 */
export function renderReportHtml(report: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length) {
      out.push(`<p dir="auto">${paragraph.join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (list.length) {
      out.push(`<ul>${list.map((li) => `<li dir="auto">${li}</li>`).join('')}</ul>`);
      list = [];
    }
  };

  for (const raw of report.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(inline(bullet[1]));
      continue;
    }
    const hash = /^#{1,6}\s*(.*)$/.exec(line);
    // A whole-line **bold** label ("**Done**", "**Blockers:**") is a section heading too (standup style).
    const boldHeading = /^\*\*([^*]+)\*\*:?$/.exec(line);
    if (hash || boldHeading || (line.endsWith(':') && line.length <= 120)) {
      flushParagraph();
      flushList();
      const text = hash ? hash[1] : boldHeading ? boldHeading[1] : line;
      out.push(`<h3 class="heading" dir="auto">${inline(text.replace(/\*\*/g, ''))}</h3>`);
      continue;
    }
    flushList();
    paragraph.push(inline(line));
  }
  flushParagraph();
  flushList();
  return out.join('\n') || '<p class="empty">(empty report)</p>';
}

/** Escape first, then allow only **bold** and `code`. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}
