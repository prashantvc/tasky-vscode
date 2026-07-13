import * as vscode from 'vscode';
import { TaskyDocument } from '../model/TaskyDocument';
import { TaskyDecorator } from '../providers/decorations';
import { buildSidebarTree, DEFAULT_SEARCHES } from '../sidebar/sidebarModel';

/**
 * Go to Anything — projects, searches, and tags (Tasky Command palette spirit).
 */
export async function goToAnything(
  decorator: TaskyDecorator
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'tasky') {
    vscode.window.showWarningMessage('Open a Tasky file first.');
    return;
  }

  type Pick = vscode.QuickPickItem & {
    action: 'home' | 'project' | 'search' | 'tag';
    line?: number;
    itemPath?: string;
  };

  const items: Pick[] = [
    {
      label: '$(home) Home',
      description: 'Show entire document',
      action: 'home',
    },
  ];

  const tree = buildSidebarTree(editor.document);
  for (const section of tree) {
    if (section.kind === 'group' && section.children) {
      for (const child of walk(section.children)) {
        if (child.kind === 'project') {
          items.push({
            label: `$(folder) ${child.label}`,
            description: 'Project',
            detail: child.line !== undefined ? `line ${child.line + 1}` : undefined,
            action: 'project',
            line: child.line,
            itemPath: child.itemPath,
          });
        } else if (child.kind === 'search') {
          items.push({
            label: `$(search) ${child.label}`,
            description: child.itemPath ?? 'Search',
            action: 'search',
            itemPath: child.itemPath,
          });
        } else if (child.kind === 'tag' || child.kind === 'tag-value') {
          items.push({
            label: `$(tag) ${child.label}`,
            description: child.itemPath ?? 'Tag',
            action: 'tag',
            itemPath: child.itemPath,
          });
        }
      }
    }
  }

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Go to Anything',
    placeHolder: 'Project, search, or tag',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!pick) {
    return;
  }

  if (pick.action === 'home') {
    decorator.clearFilter(editor);
    return;
  }

  if (pick.action === 'project' && pick.line !== undefined) {
    const pos = new vscode.Position(pick.line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    // Focus branch
    const tp = new TaskyDocument(editor.document);
    const startIndent = tp.parseLine(pick.line).indent;
    const focusLines: number[] = [pick.line];
    for (let i = pick.line + 1; i < editor.document.lineCount; i++) {
      if (editor.document.lineAt(i).text.trim() === '') {
        continue;
      }
      if (tp.parseLine(i).indent > startIndent) {
        focusLines.push(i);
      } else {
        break;
      }
    }
    decorator.setFilter(editor, focusLines, `project:${pick.label}`);
    return;
  }

  if (pick.itemPath) {
    const doc = new TaskyDocument(editor.document);
    const results = doc.search(pick.itemPath);
    if (!results.length) {
      decorator.clearFilter(editor);
      vscode.window.showInformationMessage(`No matches for ${pick.label}`);
      return;
    }
    decorator.setFilter(
      editor,
      results.map((r) => r.line),
      pick.itemPath
    );
    const pos = new vscode.Position(results[0].line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }
}

function walk<T extends { children?: T[] }>(nodes: T[]): T[] {
  const out: T[] = [];
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) {
      out.push(...walk(n.children));
    }
  }
  return out;
}

// silence unused import if tree builder already includes defaults
void DEFAULT_SEARCHES;
