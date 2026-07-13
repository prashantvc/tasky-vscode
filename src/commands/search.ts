import * as vscode from 'vscode';
import { TaskyDocument } from '../model/TaskyDocument';
import { TaskyDecorator } from '../providers/decorations';
import { getBirch } from '../birch';

const SEARCH_HISTORY_KEY = 'tasky.searchHistory';

export async function runSearch(
  context: vscode.ExtensionContext,
  decorator: TaskyDecorator
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'tasky') {
    vscode.window.showWarningMessage('Open a Tasky file to search.');
    return;
  }

  const history = context.workspaceState.get<string[]>(SEARCH_HISTORY_KEY, []);

  const itemPath = await vscode.window.showInputBox({
    title: 'Tasky Search (Item Path)',
    prompt:
      'Item path query. Leave empty and press Enter to clear the current filter. Examples: //task  |  //not @done  |  @due',
    placeHolder: decorator.isFilterActive
      ? `Filter active: ${decorator.activeFilterQuery ?? ''} — empty Enter clears`
      : '//not @done',
    value: decorator.activeFilterQuery ?? history[0] ?? '',
    validateInput: (value) => {
      // Empty is allowed — means clear filter
      if (!value.trim()) {
        return undefined;
      }
      try {
        const parsed = getBirch().ItemPath.parse(value.trim());
        if (parsed.error) {
          return parsed.error.message ?? 'Invalid item path';
        }
      } catch (e) {
        return e instanceof Error ? e.message : 'Invalid item path';
      }
      return undefined;
    },
  });

  // Esc / cancel — if a filter is already on, offer to clear it rather than trap the user
  if (itemPath === undefined) {
    if (decorator.isFilterActive) {
      const choice = await vscode.window.showInformationMessage(
        'Search filter is still active (text looks dimmed). Clear it?',
        'Clear Filter',
        'Keep Filter'
      );
      if (choice === 'Clear Filter') {
        decorator.clearFilter(editor);
      }
    }
    return;
  }

  const query = itemPath.trim();
  if (!query) {
    decorator.clearFilter(editor);
    vscode.window.setStatusBarMessage('Tasky: search filter cleared', 2000);
    return;
  }

  const doc = new TaskyDocument(editor.document);
  let results: { line: number; preview: string }[];
  try {
    results = doc.search(query);
  } catch (e) {
    vscode.window.showErrorMessage(
      `Search failed: ${e instanceof Error ? e.message : String(e)}`
    );
    return;
  }

  const nextHistory = [query, ...history.filter((h) => h !== query)].slice(0, 20);
  await context.workspaceState.update(SEARCH_HISTORY_KEY, nextHistory);

  if (results.length === 0) {
    // Do NOT apply an empty filter — that used to dim the entire document
    decorator.clearFilter(editor);
    vscode.window.showInformationMessage(`No matches for: ${query}`);
    return;
  }

  decorator.setFilter(
    editor,
    results.map((r) => r.line),
    query
  );

  type PickItem = vscode.QuickPickItem & {
    line?: number;
    clear?: boolean;
  };

  const items: PickItem[] = [
    {
      label: '$(close) Clear filter — show all lines',
      description: 'Restore normal view',
      clear: true,
    },
    ...results.map((r) => ({
      label: r.preview,
      description: `line ${r.line + 1}`,
      line: r.line,
    })),
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: `${results.length} match(es) for “${query}”`,
    placeHolder: 'Jump to a match, or clear the filter',
    matchOnDescription: true,
  });

  if (!pick) {
    // Esc on quick pick: keep filter but remind how to clear
    vscode.window.setStatusBarMessage(
      'Tasky: filter on — Escape or “Clear Search Filter” to restore',
      4000
    );
    return;
  }

  if (pick.clear) {
    decorator.clearFilter(editor);
    vscode.window.setStatusBarMessage('Tasky: search filter cleared', 2000);
    return;
  }

  if (pick.line !== undefined) {
    const pos = new vscode.Position(pick.line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }
}
