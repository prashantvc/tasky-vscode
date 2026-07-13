import * as vscode from 'vscode';
import { TaskyDocument } from '../model/TaskyDocument';
import { TaskyDecorator } from '../providers/decorations';
import { buildSidebarTree, SidebarNode } from './sidebarModel';

class SidebarTreeItem extends vscode.TreeItem {
  constructor(public readonly node: SidebarNode) {
    super(
      node.label,
      node.collapsible || (node.children && node.children.length)
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );

    this.id = node.id;
    this.description = node.description;
    this.contextValue = node.kind;
    this.iconPath = iconFor(node.kind);
    this.tooltip = tooltipFor(node);

    if (node.kind !== 'group' && node.kind !== 'empty') {
      this.command = {
        command: 'tasky.sidebar.select',
        title: 'Select',
        arguments: [node],
      };
    }
  }
}

function iconFor(kind: SidebarNode['kind']): vscode.ThemeIcon {
  switch (kind) {
    case 'home':
      return new vscode.ThemeIcon('home');
    case 'group':
      return new vscode.ThemeIcon('list-tree');
    case 'project':
      return new vscode.ThemeIcon('folder');
    case 'search':
      return new vscode.ThemeIcon('search');
    case 'tag':
      return new vscode.ThemeIcon('tag');
    case 'tag-value':
      return new vscode.ThemeIcon('symbol-string');
    case 'empty':
    default:
      return new vscode.ThemeIcon('info');
  }
}

function tooltipFor(node: SidebarNode): string | vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${node.label}**\n\n`);
  switch (node.kind) {
    case 'home':
      md.appendMarkdown('Show the entire document (clear focus & filter).');
      break;
    case 'project':
      md.appendMarkdown(
        'Focus this project and its children.\n\n' +
          (node.itemPath ? `\`${node.itemPath}\`` : '')
      );
      break;
    case 'search':
    case 'tag':
    case 'tag-value':
      md.appendMarkdown(
        'Filter the document.\n\n' +
          (node.itemPath ? `\`${node.itemPath}\`` : '')
      );
      break;
    case 'group':
      md.appendMarkdown('Sidebar section');
      break;
    default:
      md.appendMarkdown(node.description ?? '');
  }
  return md;
}

/**
 * Activity-bar sidebar mirroring Tasky’s Projects / Searches / Tags pane.
 */
export class TaskySidebarProvider
  implements vscode.TreeDataProvider<SidebarNode>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    SidebarNode | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;
  private selectedId: string | undefined;

  constructor(private readonly decorator: TaskyDecorator) {
    this.disposables.push(
      this._onDidChangeTreeData,
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const active = vscode.window.activeTextEditor;
        if (active && e.document === active.document && e.document.languageId === 'tasky') {
          // Skip sidebar rebuild for plain typing (letters/spaces mid-line)
          let structural = false;
          for (const c of e.contentChanges) {
            if (c.range.start.line !== c.range.end.line) {
              structural = true;
              break;
            }
            if (/[\n\r\t@:]/.test(c.text)) {
              structural = true;
              break;
            }
            // Task marker or edit at indent edge
            if (c.text.includes('-') && c.range.start.character <= 2) {
              structural = true;
              break;
            }
            if (c.rangeLength > 0 && c.range.start.character === 0) {
              structural = true;
              break;
            }
          }
          if (structural) {
            this.scheduleRefresh();
          }
        }
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId === 'tasky') {
          this.refresh();
        }
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.languageId === 'tasky') {
          this.refresh();
        }
      })
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => this.refresh(), 450);
  }

  getTreeItem(element: SidebarNode): vscode.TreeItem {
    const item = new SidebarTreeItem(element);
    if (this.selectedId && element.id === this.selectedId) {
      item.description = [item.description, '●'].filter(Boolean).join(' ');
    }
    return item;
  }

  getChildren(element?: SidebarNode): SidebarNode[] {
    if (!element) {
      const doc = this.activeTaskyDocument();
      return buildSidebarTree(doc);
    }
    return element.children ?? [];
  }

  private activeTaskyDocument(): vscode.TextDocument | undefined {
    const ed = vscode.window.activeTextEditor;
    if (ed && ed.document.languageId === 'tasky') {
      return ed.document;
    }
    // Prefer any visible tasky editor
    for (const e of vscode.window.visibleTextEditors) {
      if (e.document.languageId === 'tasky') {
        return e.document;
      }
    }
    return undefined;
  }

  private activeEditor(): vscode.TextEditor | undefined {
    const ed = vscode.window.activeTextEditor;
    if (ed && ed.document.languageId === 'tasky') {
      return ed;
    }
    for (const e of vscode.window.visibleTextEditors) {
      if (e.document.languageId === 'tasky') {
        return e;
      }
    }
    return undefined;
  }

  async select(node: SidebarNode): Promise<void> {
    const editor = this.activeEditor();
    if (!editor) {
      vscode.window.showWarningMessage('Open a Tasky file to use the sidebar.');
      return;
    }

    // Clicking the already-selected item toggles back to Home (full document)
    if (
      this.selectedId === node.id &&
      node.kind !== 'home' &&
      node.kind !== 'group' &&
      node.kind !== 'empty'
    ) {
      await this.goHome(editor);
      return;
    }

    this.selectedId = node.id;

    switch (node.kind) {
      case 'home':
        await this.goHome(editor);
        break;

      case 'project':
        await this.focusProject(editor, node);
        break;

      case 'search':
      case 'tag':
      case 'tag-value':
        await this.applyItemPath(editor, node.itemPath ?? '', node.label);
        break;

      default:
        break;
    }

    this.refresh();
  }

  private async goHome(editor: vscode.TextEditor): Promise<void> {
    this.selectedId = 'home';
    this.decorator.clearFilter(editor);
    vscode.window.setStatusBarMessage('Tasky: Home — full document', 2000);
    this.refresh();
  }

  private async focusProject(
    editor: vscode.TextEditor,
    node: SidebarNode
  ): Promise<void> {
    if (node.line !== undefined) {
      const pos = new vscode.Position(node.line, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenter
      );
    }

    // Dim lines outside this project’s branch (indent range) — Tasky “focus”
    if (node.line === undefined) {
      return;
    }
    const doc = editor.document;
    const tp = new TaskyDocument(doc);
    const startIndent = tp.parseLine(node.line).indent;
    const lines: number[] = [node.line];
    for (let i = node.line + 1; i < doc.lineCount; i++) {
      const text = doc.lineAt(i).text;
      if (text.trim() === '') {
        // keep blanks inside focus only if still nested after
        let k = i + 1;
        while (k < doc.lineCount && doc.lineAt(k).text.trim() === '') {
          k++;
        }
        if (k < doc.lineCount && tp.parseLine(k).indent > startIndent) {
          lines.push(i);
          continue;
        }
        break;
      }
      const ind = tp.parseLine(i).indent;
      if (ind > startIndent) {
        lines.push(i);
      } else {
        break;
      }
    }

    this.decorator.setFilter(editor, lines, `project:${node.label}`);
    vscode.window.setStatusBarMessage(
      `Tasky: focused project “${node.label}”`,
      2500
    );
  }

  private async applyItemPath(
    editor: vscode.TextEditor,
    itemPath: string,
    label: string
  ): Promise<void> {
    if (!itemPath) {
      return;
    }
    const doc = new TaskyDocument(editor.document);
    let results: { line: number; preview: string }[];
    try {
      results = doc.search(itemPath);
    } catch (e) {
      vscode.window.showErrorMessage(
        `Search “${label}” failed: ${e instanceof Error ? e.message : String(e)}`
      );
      return;
    }

    if (results.length === 0) {
      this.decorator.clearFilter(editor);
      vscode.window.showInformationMessage(`No matches for ${label}`);
      return;
    }

    this.decorator.setFilter(
      editor,
      results.map((r) => r.line),
      itemPath
    );

    // Jump to first match
    const first = results[0];
    const pos = new vscode.Position(first.line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenter
    );

    vscode.window.setStatusBarMessage(
      `Tasky: ${results.length} match(es) — ${label}`,
      3000
    );
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
