// DevDiary report webview script. Plain JS, no external libraries.
(function () {
  // eslint-disable-next-line no-undef
  const vscode = acquireVsCodeApi();

  const languageInput = document.getElementById('language');
  const styleSelect = document.getElementById('style');
  const regenerateBtn = document.getElementById('regenerate');
  const editBtn = document.getElementById('edit');
  const resetBtn = document.getElementById('reset');
  const copyBtn = document.getElementById('copy');
  const saveBtn = document.getElementById('save');
  const statusEl = document.getElementById('status');
  const reportEl = document.getElementById('report');
  const editorEl = document.getElementById('editor');
  const editedEl = document.getElementById('edited');
  const buttons = [regenerateBtn, editBtn, resetBtn, copyBtn, saveBtn];
  const stamp = document.body.dataset.stamp || '';

  // The generated (AI) text, embedded by the extension as a JSON data block.
  let original = '';
  try {
    const parsed = JSON.parse(document.getElementById('report-original').textContent || '""');
    if (typeof parsed === 'string') original = parsed;
  } catch (e) {
    original = '';
  }
  // Current text (possibly edited) and whether the editor is open.
  let text = original;
  let editing = false;

  function persist(extra) {
    const prev = vscode.getState() || {};
    vscode.setState(Object.assign({}, prev, {
      stamp: stamp,
      language: languageInput.value,
      style: styleSelect.value,
      text: text,
      editing: editing,
    }, extra || {}));
  }

  function setLoading(loading) {
    buttons.forEach(function (b) { b.disabled = loading; });
    languageInput.disabled = loading;
    styleSelect.disabled = loading;
    editorEl.disabled = loading;
    regenerateBtn.textContent = loading ? 'Generating…' : 'Regenerate';
    document.body.classList.toggle('loading', loading);
    statusEl.textContent = loading ? 'Writing a new report…' : '';
  }

  function autoSize() {
    editorEl.style.height = 'auto';
    editorEl.style.height = editorEl.scrollHeight + 2 + 'px';
  }

  /** Syncs the preview / editor / buttons / "edited" marker with `text` and `editing`. */
  function updateView() {
    const isEdited = text !== original;
    editedEl.hidden = !isEdited;
    editBtn.textContent = editing ? 'Done' : 'Edit';
    editBtn.title = editing
      ? 'Show the formatted report (Ctrl+Enter)'
      : 'Edit the report text before copying or saving';
    resetBtn.hidden = !(editing || isEdited);
    reportEl.hidden = editing;
    editorEl.hidden = !editing;
    document.body.classList.toggle('editing', editing);
    if (editing) {
      if (editorEl.value !== text) editorEl.value = text;
      autoSize();
    } else {
      reportEl.innerHTML = renderReportHtml(text);
    }
  }

  /** The text Copy / Save should use: the live editor contents while editing. */
  function currentText() {
    return editing ? editorEl.value : text;
  }

  // Restore draft inputs only if they belong to the currently rendered report
  // (the panel is re-rendered with fresh values after each generation, so a new
  // stamp discards old edits).
  const saved = vscode.getState();
  if (saved && saved.stamp === stamp) {
    if (typeof saved.language === 'string') languageInput.value = saved.language;
    if (typeof saved.style === 'string') styleSelect.value = saved.style;
    if (typeof saved.text === 'string') text = saved.text;
    editing = saved.editing === true;
    if (text !== original || editing) updateView();
    if (saved.loading) setLoading(true);
  } else {
    persist({ loading: false });
  }

  languageInput.addEventListener('input', function () { persist(); });
  styleSelect.addEventListener('change', function () { persist(); });
  languageInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') regenerateBtn.click();
  });

  editorEl.addEventListener('input', function () {
    text = editorEl.value;
    editedEl.hidden = text === original;
    autoSize();
    persist();
  });
  editorEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      editBtn.click();
    }
  });

  editBtn.addEventListener('click', function () {
    if (editing) {
      text = editorEl.value;
      editing = false;
      updateView();
      editBtn.focus();
    } else {
      editing = true;
      updateView();
      editorEl.focus();
    }
    persist();
  });

  resetBtn.addEventListener('click', function () {
    text = original;
    editorEl.value = original;
    updateView();
    if (editing) editorEl.focus();
    persist();
  });

  regenerateBtn.addEventListener('click', function () {
    const language = languageInput.value.trim();
    if (!language) {
      languageInput.focus();
      return;
    }
    setLoading(true);
    persist({ loading: true });
    vscode.postMessage({ type: 'regenerate', language: language, style: styleSelect.value });
  });

  copyBtn.addEventListener('click', function () {
    vscode.postMessage({ type: 'copy', text: currentText() });
    statusEl.textContent = 'Copied';
    setTimeout(function () {
      if (statusEl.textContent === 'Copied') statusEl.textContent = '';
    }, 2000);
  });

  saveBtn.addEventListener('click', function () {
    vscode.postMessage({ type: 'save', text: currentText() });
  });

  window.addEventListener('resize', function () {
    if (editing) autoSize();
  });

  // Extension → webview. A new report re-renders the whole document; 'idle'
  // means a regeneration ended without a new report (cancelled / failed / busy).
  window.addEventListener('message', function (event) {
    const msg = event.data;
    if (msg && msg.type === 'idle') {
      setLoading(false);
      persist({ loading: false });
    }
  });

  // ---- Rendering: mirrors renderReportHtml in src/ui/reportPanel.ts. Everything is escaped first. ----

  function renderReportHtml(report) {
    const out = [];
    let paragraph = [];
    let list = [];

    function flushParagraph() {
      if (paragraph.length) {
        out.push('<p dir="auto">' + paragraph.join('<br>') + '</p>');
        paragraph = [];
      }
    }
    function flushList() {
      if (list.length) {
        out.push('<ul>' + list.map(function (li) { return '<li dir="auto">' + li + '</li>'; }).join('') + '</ul>');
        list = [];
      }
    }

    report.replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
      const line = raw.trim();
      if (!line) {
        flushParagraph();
        flushList();
        return;
      }
      const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
      if (bullet) {
        flushParagraph();
        list.push(inline(bullet[1]));
        return;
      }
      const hash = /^#{1,6}\s*(.*)$/.exec(line);
      const boldHeading = /^\*\*([^*]+)\*\*:?$/.exec(line);
      if (hash || boldHeading || (line.endsWith(':') && line.length <= 120)) {
        flushParagraph();
        flushList();
        const t = hash ? hash[1] : boldHeading ? boldHeading[1] : line;
        out.push('<h3 class="heading" dir="auto">' + inline(t.replace(/\*\*/g, '')) + '</h3>');
        return;
      }
      flushList();
      paragraph.push(inline(line));
    });
    flushParagraph();
    flushList();
    return out.join('\n') || '<p class="empty">(empty report)</p>';
  }

  /** Escape first, then allow only **bold** and `code`. */
  function inline(s) {
    return escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
