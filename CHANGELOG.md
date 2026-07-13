# Changelog

## 0.4.1

- Full rebrand to **Tasky** (commands, language id, settings, views)
- Kept TaskPaper only for format compatibility, `.taskpaper` extension, and birch APIs

## 0.4.0

- Renamed extension to **Tasky** (compatible with TaskPaper format)
- File associations: `.taskpaper`, **`.tasks`**, `.todo`


## 0.3.1

- **Typing performance:** incremental document analysis for single-line edits; faster line parser (skip tag scan without `@`)
- **Typing performance:** debounced decorations (280ms); status bar updates only after decoration refresh
- **Typing performance:** sidebar rebuild only on structural edits (newlines, `@`, `:`, …), not every keystroke
- **Load:** deferred initial decoration refresh; tag decorations off by default (TextMate grammar colors tags)
- Setting: `tasky.highlightProjects`; `highlightTags` default `false`

## 0.3.0

- Marketplace packaging: icon, license, repository metadata, third-party notices
- Activity Bar product icon (`$(checklist)`); re-click selected outline item returns to Home
- Performance: document cache, outline cache, line-local edits for tags/types
- Features: archive, tag autocomplete, sidebar, item-path search


## 0.2.2

- **Make task/project/note** use line-local marker edits (no birch full rewrite)
- **Search** uses versioned birch outline cache (re-parse only when document changes)

## 0.2.1

- **Performance:** versioned document cache; O(n) folding/symbols; single analysis walk for decorations/status
- **Performance:** toggle done/today/tags use line-local edits (no full birch rewrite)
- **Correctness:** recompute search/project filter after document edits (no stale dimming)
- **Correctness:** harder line↔item mapping; safer tag regex; project bold uses true trailing colon

## 0.2.0

- **Archive @done Items** (`Cmd/Ctrl+Shift+A`) — official Tasky algorithm
- Toggle `@today`, Tag With…, Remove Tags
- New Task / Note / Project, Duplicate, Group, Move to Project…
- Go to Anything + Go Home
- Keyboard shortcuts aligned with Tasky guide (VS Code–safe remaps)
- Settings: `archive.includeProjectTag`, `archive.removeExtraTags`

## 0.1.0

- Tasky language mode, grammar, birch-outline engine
- Toggle done, indent, search, sidebar, decorations
