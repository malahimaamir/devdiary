# DevDiary – AI Daily Work Report Generator

**Stop trying to remember what you did today.** DevDiary quietly tracks your coding activity in VS Code — files you touched, lines changed, commits, and active coding time — and turns it into a clean daily work report or standup update with AI, in **any language you choose**.

Your code never leaves your machine, and it is never stored.

---

## Features

- **Automatic activity tracking.** Records file saves (with lines added/removed), created and deleted files, git commits, and active coding time per project. Nothing to start or stop.
- **AI-written daily reports.** Generates a polished report for today or any past day in one command.
- **Weekly reports.** Summarize the last 7 days — themes and progress across the week — with **DevDiary: Generate Weekly Report**.
- **Any language.** Set `devdiary.language` to `English`, `Urdu`, `Roman Urdu`, `Deutsch`, `Español`, `Français`, `日本語`, `हिन्दी` … any language the AI model speaks.
- **Four styles.** `oneline` (one sentence), `bullets` (a short bullet list), `detailed` (one paragraph with commits and files), or `standup` (Done / Next / Blockers, with headings in your language).
- **Bring your own AI.** GitHub Copilot or Claude Code (no key needed), Claude API, OpenAI, Gemini, a local Ollama model, or no AI at all (built-in template report).
- **Scheduled reports.** Have your report generated automatically at a time of day, e.g. `18:00`.
- **Status bar.** See today's active coding time at a glance and pause tracking with one click.
- **Privacy first.** Only metadata is stored, locally. Sensitive files (`.env`, `*.pem`, `*.key`, …) are ignored by default.
- **Free and open source.** Available on the VS Code Marketplace and Open VSX.

## How it works

1. **Track** — While you work, DevDiary records lightweight events: which file was saved and how many lines changed, which files were created or deleted, which commits were made, and how long you were actively coding (time stops counting after you go idle).
2. **Store** — Events are written to small JSON files in VS Code's private extension storage on your machine. Old data is cleaned up automatically after `devdiary.keepDays` days.
3. **Summarize** — When you generate a report, the day's events are condensed into a compact summary: active minutes, commits, most-edited files and languages, per project.
4. **Write** — Only that summary is sent to the AI provider you selected, which writes the report in your language and style. The result opens in a panel where you can edit it before copying or saving it.

## Getting started

1. Install DevDiary and keep coding as usual.
2. At the end of the day run **DevDiary: Generate Today's Report** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Copy the report into Slack, Teams, Jira, email or your timesheet.

If you have GitHub Copilot, it works out of the box. Otherwise pick another provider below.

## AI provider setup

Choose a provider with the `devdiary.aiProvider` setting. If the selected provider is unavailable, DevDiary falls back to the built-in template report, so you always get something.

| Provider | Setup |
| --- | --- |
| `copilot` (default) | Sign in to GitHub Copilot in VS Code. DevDiary uses the VS Code Language Model API — no API key needed. The first time, VS Code asks you to allow DevDiary to use the model. |
| `claude-code` | Have [Claude Code](https://claude.com/claude-code) installed and signed in. DevDiary runs `claude -p` with the fast `haiku` model, using your existing Claude login — no API key. It runs in an empty temp folder with all tools disabled, so it never reads your project. Set `devdiary.claudeCodePath` if `claude` is not on your PATH. |
| `claude` | Get an API key from [console.anthropic.com](https://console.anthropic.com), then run **DevDiary: Set AI API Key**. |
| `openai` | Get an API key from [platform.openai.com](https://platform.openai.com/api-keys), then run **DevDiary: Set AI API Key**. |
| `gemini` | Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey), then run **DevDiary: Set AI API Key**. |
| `ollama` | Install [Ollama](https://ollama.com), pull a model (e.g. `ollama pull llama3.1`), and set `devdiary.model` to its name. Runs fully offline. Change `devdiary.ollamaUrl` if Ollama is not on `http://localhost:11434`. |
| `none` | No AI. A structured report is built from a template. Nothing is sent anywhere. |

API keys are kept in VS Code's encrypted **Secret Storage** — never in settings files.

Use `devdiary.model` to override the default model of a provider (for example `gpt-4o-mini`, or a specific Claude or Gemini model). Leave it empty to use the provider's default.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `devdiary.language` | `English` | Language the report is written in (free text). |
| `devdiary.style` | `bullets` | `oneline`, `bullets`, `detailed` or `standup` (Done / Next / Blockers). |
| `devdiary.aiProvider` | `copilot` | `copilot`, `claude-code`, `claude`, `openai`, `gemini`, `ollama` or `none`. |
| `devdiary.model` | `""` | Optional model override for the selected provider. |
| `devdiary.ollamaUrl` | `http://localhost:11434` | Base URL of your Ollama server. |
| `devdiary.claudeCodePath` | `claude` | Command or full path of the Claude Code CLI. |
| `devdiary.autoGenerateAt` | `""` | Generate today's report automatically at `HH:MM` (24-hour). Empty disables. |
| `devdiary.ignorePatterns` | `node_modules`, `.git`, `dist`, `out`, `build`, `.env`, `.env.*`, `*.key`, `*.pem` | Glob patterns of files that are never tracked. |
| `devdiary.idleTimeoutMinutes` | `5` | Minutes of inactivity after which coding time stops counting. |
| `devdiary.keepDays` | `30` | Days of activity history kept locally. |

## Commands

| Command | Description |
| --- | --- |
| `DevDiary: Generate Today's Report` | Write the report for today. |
| `DevDiary: Generate Weekly Report` | Write one report covering the last 7 days, including today. |
| `DevDiary: Generate Report for a Date` | Write the report for any past day (`YYYY-MM-DD`). |
| `DevDiary: Set AI API Key` | Store an API key for Claude, OpenAI or Gemini in Secret Storage. |
| `DevDiary: Pause / Resume Tracking` | Temporarily stop recording activity. |
| `DevDiary: Clear All Stored Activity` | Permanently delete all locally stored activity. |
| `DevDiary: Open Settings` | Open DevDiary's settings. |

## Privacy

DevDiary is built so you can use it at work without worrying.

- **What is stored:** file paths, project (workspace folder) names, file languages, line counts added/removed, created/deleted file names, commit hashes, commit messages and changed file names, and active time.
- **What is never stored:** the contents of your files or diffs. Line counts are computed in memory and the text is discarded.
- **Where it is stored:** only on your machine, in VS Code's extension storage. Nothing is uploaded in the background.
- **What is sent to AI:** only when you generate a report, and only the day's summary (file names, counts, commit messages, time) — to the provider you chose. Choose `ollama` or `none` to keep everything 100% local.
- **Telemetry:** none.
- **Control:** pause tracking any time, exclude files with `devdiary.ignorePatterns`, and delete everything with **DevDiary: Clear All Stored Activity**.

## FAQ

**Does DevDiary read or upload my code?**
No. It counts changed lines when you save, but the code itself is never stored or sent anywhere.

**Do I need a paid AI subscription?**
No. Use GitHub Copilot or Claude Code if you have them, a free local model via Ollama, or `none` for a template report.

**Can I get the report in my own language?**
Yes. Set `devdiary.language` to any language name, for example `Urdu`, `Roman Urdu`, `Türkçe` or `Português`.

**I forgot to generate yesterday's report.**
Run **DevDiary: Generate Report for a Date** — it is pre-filled with yesterday's date.

**Does it work with multiple projects and multi-root workspaces?**
Yes. Activity is grouped per project in the report.

**Does it work in Remote SSH, WSL, Dev Containers or Codespaces?**
Yes. DevDiary runs where your workspace runs, so it sees your files and git history there.

**Copilot provider says it is unavailable.**
Make sure you are signed in to GitHub Copilot and allowed DevDiary to use language models when prompted. DevDiary falls back to the template report meanwhile.

**How do I stop tracking a specific folder?**
Add a glob such as `**/secret-project/**` to `devdiary.ignorePatterns`.

## Author

Created and maintained by **Malahima Amir**.

## License

[MIT](LICENSE)
