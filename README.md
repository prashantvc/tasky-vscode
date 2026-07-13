# Tasky

Plain-text task lists and outlines for VS Code — **compatible with [TaskPaper](https://www.taskpaper.com) format**.

Open `.taskpaper`, `.tasks`, or `.todo` files. Use projects, tasks, notes, `@tags`, archive, sidebar, and item-path search.

> **Unofficial.** Tasky works with TaskPaper-compatible plain text. Not affiliated with Hog Bay Software.

## Features

| Feature | Details |
|--------|---------|
| File types | `.taskpaper`, `.tasks`, `.todo` |
| Format | TaskPaper-compatible: projects (`:`), tasks (`- `), notes, `@tags` |
| Toggle Done | `@done` / `@done(YYYY-MM-DD)` |
| Archive @done | Move completed items to `Archive:` |
| Activity Bar sidebar | Home · Projects · Searches · Tags |
| Item-path search | e.g. `//not @done`, `project Inbox //task` |
| Tag autocomplete | Type `@` and `@tag(` |
| Folding & symbols | Indent folding, Outline view |
| Status bar | `done/total` tasks + active filter |

## Quick start

1. Install **Tasky**
2. Open or create a `*.taskpaper` or `*.tasks` file
3. Use the **Tasky** Activity Bar icon for the outline sidebar
4. Command Palette → **Tasky: Open Welcome Example**

```tasky
Inbox:
	- Write the report @due(2026-07-15)
	- Review PR @today
	- Ship it @done(2026-07-13)
```

## Keyboard shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|----------------|
| Toggle Done | `⌘D` | `Ctrl+D` |
| Archive @done | `⌘⇧A` | `Ctrl+Shift+A` |
| Toggle @today | `⌘⌥Y` | `Ctrl+Alt+Y` |
| Tag With… | `⌘⌥T` | `Ctrl+Alt+T` |
| New Task | `⌘↩` | `Ctrl+Enter` |
| New Project | `⌘⌥↩` | `Ctrl+Alt+Enter` |
| Search (item path) | `⌘⌥F` | `Ctrl+Alt+F` |
| Clear filter | `Esc` | `Esc` |
| Go to Anything | `⌘⌥P` | `Ctrl+Alt+P` |
| Go Home | `⌘⌥H` | `Ctrl+Alt+H` |
| Indent / Outdent | `Tab` / `⇧Tab` | same |

More: **Command Palette** → type `Tasky`.

## Archiving

1. Mark tasks done (`⌘D` / `Ctrl+D`)
2. **Archive @done Items** (`⌘⇧A` / `Ctrl+Shift+A`) moves them under `Archive:`

Settings: `tasky.archive.*`, `tasky.includeDateWhenTaggingDone`.

## Search examples

```
//task
//not @done
project Inbox //task
@due
@today
```

## Compatibility

Tasky files use the same plain-text conventions as TaskPaper. Files round-trip with TaskPaper for Mac and other TaskPaper-compatible tools.

## Development

```bash
npm install
npm run compile
npm run unit
npm run package   # → tasky-0.4.0.vsix
```

## Credits

- [TaskPaper](https://www.taskpaper.com) format — Hog Bay Software  
- [birch-outline](https://github.com/jessegrosjean/birch-outline) (MIT) — outline model  
- [vscode-codicons](https://github.com/microsoft/vscode-codicons)  

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License

MIT — see [LICENSE](./LICENSE).
