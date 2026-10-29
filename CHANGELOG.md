# Changelog

All notable changes to DevDiary are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.3.2] - 2026-10-29

### Changed

- Added a demo GIF to the README.

## [0.3.1] - 2026-10-29

### Security

- Claude Code provider now also disables MCP servers and slash commands, and rejects unsafe model names.
- `devdiary.claudeCodePath` and `devdiary.ollamaUrl` can only be set in user settings, not by a workspace.

## [0.3.0] - 2026-10-29

### Added

- **Claude Code provider** (`claude-code`): writes reports with your existing Claude Code login via the `claude` CLI — no API key needed. Runs in an empty temp folder with tools disabled. New setting `devdiary.claudeCodePath`.

## [0.2.2] - 2026-10-29

### Changed

- Added GitHub repository, issues and homepage links.

## [0.2.1] - 2026-10-29

### Changed

- Added author information (Malahima Amir) to the README, LICENSE and extension manifest.

## [0.2.0] - 2026-10-29

### Added

- `standup` report style: Done / Next / Blockers sections, with headings written in the report language.
- **DevDiary: Generate Weekly Report** — one report covering the last 7 days, summarizing themes and progress across the week. Saved as `reports/<from>_to_<to>.md`; works with every style.
- Edit before copy/save: tweak the generated report in the report panel before copying or saving it.
- "Standup" option in the report panel's style dropdown.

## [0.1.0] - 2026-10-29

### Added

- Background activity tracking: file saves with line counts, created/deleted files, git commits and active coding time.
- AI-generated daily work reports in any language with `oneline`, `bullets` and `detailed` styles.
- AI providers: GitHub Copilot (VS Code Language Model API), Claude, OpenAI, Gemini, Ollama, and a template fallback.
- Secure API key storage via VS Code Secret Storage.
- Report for any past date, scheduled automatic reports, and a status bar indicator.
- Pause/resume tracking, configurable ignore patterns, automatic cleanup and one-click data deletion.
