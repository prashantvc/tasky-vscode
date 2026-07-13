import * as vscode from 'vscode';
import * as path from 'path';
import { TaskyDocument } from './model/TaskyDocument';
import { runSearch } from './commands/search';
import { archiveDone } from './commands/archive';
import { toggleToday, removeTags, tagWith } from './commands/tags';
import {
  newTask,
  newNote,
  newProject,
  duplicateItems,
  groupItems,
  moveToProject,
} from './commands/items';
import { goToAnything } from './commands/goToAnything';
import { TaskyDecorator } from './providers/decorations';
import { TaskyFoldingProvider } from './providers/folding';
import { TaskySymbolProvider } from './providers/symbols';
import { TaskyTagCompletionProvider } from './providers/tagCompletion';
import { TaskySidebarProvider } from './sidebar/sidebarProvider';
import { SidebarNode } from './sidebar/sidebarModel';
import { pruneDocumentAnalysis } from './model/documentCache';
import { pruneOutlineCache } from './model/outlineCache';

function activeTaskyEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === 'tasky') {
    return editor;
  }
  return undefined;
}

function updateHasOpenDocumentContext(): void {
  const has =
    vscode.window.visibleTextEditors.some((e) => e.document.languageId === 'tasky') ||
    vscode.workspace.textDocuments.some((d) => d.languageId === 'tasky');
  void vscode.commands.executeCommand('setContext', 'tasky.hasOpenDocument', has);
}

export function activate(context: vscode.ExtensionContext): void {
  // birch-outline is lazy-loaded on first search/archive/type conversion

  const decorator = new TaskyDecorator();
  context.subscriptions.push(decorator);

  const sidebar = new TaskySidebarProvider(decorator);
  context.subscriptions.push(sidebar);

  const treeView = vscode.window.createTreeView('tasky.sidebar', {
    treeDataProvider: sidebar,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: 'tasky' },
      new TaskyFoldingProvider()
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'tasky' },
      new TaskySymbolProvider()
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'tasky' },
      new TaskyTagCompletionProvider(),
      '@',
      '('
    )
  );

  const register = (
    command: string,
    fn: (editor: vscode.TextEditor) => void | Promise<void>
  ) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, async () => {
        const editor = activeTaskyEditor();
        if (!editor) {
          vscode.window.showWarningMessage('Open a Tasky file (.taskpaper or .tasks) first.');
          return;
        }
        await fn(editor);
      })
    );
  };

  const afterEdit = (editor: vscode.TextEditor) => {
    // Force one refresh after command (not every keystroke)
    decorator.refresh(editor);
    sidebar.refresh();
    updateStatus(editor);
  };

  register('tasky.toggleDone', async (editor) => {
    await new TaskyDocument(editor.document).toggleDone(editor);
    afterEdit(editor);
  });

  register('tasky.makeTask', async (editor) => {
    await new TaskyDocument(editor.document).setType(editor, 'task');
    afterEdit(editor);
  });

  register('tasky.makeProject', async (editor) => {
    await new TaskyDocument(editor.document).setType(editor, 'project');
    afterEdit(editor);
  });

  register('tasky.makeNote', async (editor) => {
    await new TaskyDocument(editor.document).setType(editor, 'note');
    afterEdit(editor);
  });

  register('tasky.indent', async (editor) => {
    const sel = editor.selection;
    if (sel.isEmpty && sel.active.character > 0) {
      await editor.edit((edit) => edit.insert(sel.active, '\t'));
    } else {
      await new TaskyDocument(editor.document).indent(editor);
    }
    sidebar.refresh();
  });

  register('tasky.outdent', async (editor) => {
    await new TaskyDocument(editor.document).outdent(editor);
    sidebar.refresh();
  });

  register('tasky.moveUp', async (editor) => {
    await new TaskyDocument(editor.document).moveBlock(editor, -1);
    sidebar.refresh();
  });

  register('tasky.moveDown', async (editor) => {
    await new TaskyDocument(editor.document).moveBlock(editor, 1);
    sidebar.refresh();
  });

  register('tasky.archiveDone', async (editor) => {
    await archiveDone(editor);
    afterEdit(editor);
  });

  register('tasky.toggleToday', async (editor) => {
    await toggleToday(editor);
    afterEdit(editor);
  });

  register('tasky.tagWith', async (editor) => {
    await tagWith(editor);
    afterEdit(editor);
  });

  register('tasky.removeTags', async (editor) => {
    await removeTags(editor);
    afterEdit(editor);
  });

  register('tasky.newTask', async (editor) => {
    await newTask(editor);
    sidebar.refresh();
  });

  register('tasky.newNote', async (editor) => {
    await newNote(editor);
    sidebar.refresh();
  });

  register('tasky.newProject', async (editor) => {
    await newProject(editor);
    sidebar.refresh();
  });

  register('tasky.duplicateItems', async (editor) => {
    await duplicateItems(editor);
    afterEdit(editor);
  });

  register('tasky.groupItems', async (editor) => {
    await groupItems(editor);
    afterEdit(editor);
  });

  register('tasky.moveToProject', async (editor) => {
    await moveToProject(editor);
    afterEdit(editor);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('tasky.goToAnything', () => goToAnything(decorator))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tasky.goHome', () => {
      const editor = activeTaskyEditor();
      decorator.clearFilter(editor);
      sidebar.refresh();
      vscode.window.setStatusBarMessage('Tasky: Home — full document', 2000);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tasky.search', async () => {
      await runSearch(context, decorator);
      sidebar.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tasky.clearSearch', () => {
      const editor = activeTaskyEditor();
      decorator.clearFilter(editor);
      vscode.window.setStatusBarMessage('Tasky: search filter cleared', 2000);
      sidebar.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'tasky.sidebar.select',
      async (node: SidebarNode) => {
        await sidebar.select(node);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tasky.sidebar.refresh', () => {
      sidebar.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tasky.focusSidebar', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.tasky');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tasky.openWelcome', async () => {
      const welcomePath = path.join(
        context.extensionPath,
        'examples',
        'Welcome.taskpaper'
      );
      const uri = vscode.Uri.file(welcomePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
      sidebar.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tasky.newFile', async () => {
      const doc = await vscode.workspace.openTextDocument({
        language: 'tasky',
        content: 'Inbox:\n\t- First task\n\t- Second task @due(tomorrow)\n',
      });
      await vscode.window.showTextDocument(doc);
      sidebar.refresh();
    })
  );

  register('tasky.insertDateTag', async (editor) => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const tag = ` @due(${y}-${m}-${d})`;
    await editor.edit((edit) => {
      for (const sel of editor.selections) {
        edit.insert(sel.active, tag);
      }
    });
    sidebar.refresh();
  });

  register('tasky.goToProject', async (editor) => {
    const projects = new TaskyDocument(editor.document).getProjects();
    if (projects.length === 0) {
      vscode.window.showInformationMessage('No projects found (lines ending with :).');
      return;
    }
    const pick = await vscode.window.showQuickPick(
      projects.map((p) => ({
        label: p.name,
        description: `line ${p.line + 1}`,
        line: p.line,
      })),
      { title: 'Go to Project' }
    );
    if (pick) {
      const pos = new vscode.Position(pick.line, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenter
      );
    }
  });

  // Status bar
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(status);

  const filterStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    101
  );
  filterStatus.command = 'tasky.clearSearch';
  filterStatus.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  context.subscriptions.push(filterStatus);

  let statusTimer: NodeJS.Timeout | undefined;
  const updateStatus = (editor: vscode.TextEditor | undefined) => {
    updateHasOpenDocumentContext();

    if (!editor || editor.document.languageId !== 'tasky') {
      status.hide();
      if (!decorator.isFilterActive) {
        filterStatus.hide();
      }
      return;
    }
    // Prefer counts from decorator (already paid for analysis on refresh)
    const tasks = decorator.lastTaskCount;
    const done = decorator.lastDoneCount;
    status.text = `$(checklist) ${done}/${tasks}`;
    status.tooltip =
      'Tasky: done/total\nClick to search\nArchive @done: Cmd/Ctrl+Shift+A';
    status.command = 'tasky.search';
    status.show();

    if (decorator.isFilterActive) {
      const q = decorator.activeFilterQuery ?? '';
      filterStatus.text = `$(filter) ${q || 'filter'} $(close)`;
      filterStatus.tooltip = `Filter active: ${q}\nClick to clear`;
      filterStatus.show();
    } else {
      filterStatus.hide();
    }
  };

  const scheduleStatus = (editor: vscode.TextEditor | undefined) => {
    if (statusTimer) {
      clearTimeout(statusTimer);
    }
    statusTimer = setTimeout(() => updateStatus(editor), 280);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => {
      updateStatus(e);
      // Sidebar only needs rebuild on editor switch, not every keystroke
      if (e?.document.languageId === 'tasky') {
        sidebar.refresh();
      }
    }),
    // Status updates after decorations refresh (debounced together)
    decorator.onDidRefresh((ed) => updateStatus(ed)),
    decorator.onFilterChanged(() => updateStatus(vscode.window.activeTextEditor)),
    vscode.workspace.onDidOpenTextDocument(() => updateHasOpenDocumentContext()),
    vscode.workspace.onDidCloseTextDocument(() => {
      updateHasOpenDocumentContext();
      const open = new Set(
        vscode.workspace.textDocuments.map((d) => d.uri.toString())
      );
      pruneDocumentAnalysis(open);
      pruneOutlineCache(open);
    }),
    { dispose: () => { if (statusTimer) clearTimeout(statusTimer); } }
  );
  // Initial status without blocking activation
  setTimeout(() => updateStatus(vscode.window.activeTextEditor), 0);
  updateHasOpenDocumentContext();
}

export function deactivate(): void {}
