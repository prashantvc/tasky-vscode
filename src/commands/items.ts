import * as vscode from 'vscode';
import { TaskyDocument } from '../model/TaskyDocument';

/** Insert a new task on the next line, matching current indent. */
export async function newTask(editor: vscode.TextEditor): Promise<void> {
  await insertItem(editor, 'task');
}

export async function newNote(editor: vscode.TextEditor): Promise<void> {
  await insertItem(editor, 'note');
}

export async function newProject(editor: vscode.TextEditor): Promise<void> {
  await insertItem(editor, 'project');
}

async function insertItem(
  editor: vscode.TextEditor,
  kind: 'task' | 'note' | 'project'
): Promise<void> {
  const line = editor.selection.active.line;
  const text = editor.document.lineAt(line).text;
  let indent = 0;
  while (indent < text.length && text[indent] === '\t') {
    indent++;
  }
  // If current line is a project, nest new items one level deeper
  const tp = new TaskyDocument(editor.document);
  const info = tp.parseLine(line);
  if (info.type === 'project' && kind !== 'project') {
    indent += 1;
  }

  let body: string;
  let cursorOffset: number;
  switch (kind) {
    case 'task':
      body = `${'\t'.repeat(indent)}- `;
      cursorOffset = body.length;
      break;
    case 'project':
      body = `${'\t'.repeat(indent)}New Project:`;
      cursorOffset = body.length - 1; // before colon
      break;
    default:
      body = `${'\t'.repeat(indent)}`;
      cursorOffset = body.length;
      break;
  }

  const insertPos = new vscode.Position(line, text.length);
  const insertText = '\n' + body;
  await editor.edit((edit) => edit.insert(insertPos, insertText));
  const newLine = line + 1;
  const pos = new vscode.Position(newLine, cursorOffset);
  editor.selection = new vscode.Selection(pos, pos);
  if (kind === 'project') {
    // Select "New Project" for easy rename
    const start = new vscode.Position(newLine, indent);
    const end = new vscode.Position(newLine, body.length - 1);
    editor.selection = new vscode.Selection(start, end);
  }
}

/** Duplicate selected lines (including nested children of the block). */
export async function duplicateItems(editor: vscode.TextEditor): Promise<void> {
  const tp = new TaskyDocument(editor.document);
  const lines = tp.getSelectedLineNumbers(editor);
  if (!lines.length) {
    return;
  }
  const start = lines[0];
  let end = lines[lines.length - 1];
  const baseIndent = lineIndent(editor.document, start);
  while (end + 1 < editor.document.lineCount) {
    const t = editor.document.lineAt(end + 1).text;
    if (t.trim() === '') {
      break;
    }
    if (lineIndent(editor.document, end + 1) > baseIndent) {
      end++;
    } else {
      break;
    }
  }
  const block: string[] = [];
  for (let i = start; i <= end; i++) {
    block.push(editor.document.lineAt(i).text);
  }
  const insertAt = new vscode.Position(end, editor.document.lineAt(end).text.length);
  await editor.edit((edit) => edit.insert(insertAt, '\n' + block.join('\n')));
  const newStart = end + 1;
  const newEnd = end + block.length;
  editor.selection = new vscode.Selection(
    newStart,
    0,
    newEnd,
    editor.document.lineAt(newEnd).text.length
  );
}

/** Group selection under a new project. */
export async function groupItems(editor: vscode.TextEditor): Promise<void> {
  const tp = new TaskyDocument(editor.document);
  const lines = tp.getSelectedLineNumbers(editor);
  if (!lines.length) {
    return;
  }
  const start = lines[0];
  const end = lines[lines.length - 1];
  const baseIndent = lineIndent(editor.document, start);
  const name = await vscode.window.showInputBox({
    title: 'Group Items',
    prompt: 'Name for the new project',
    value: 'Group',
  });
  if (!name) {
    return;
  }
  const projectLine = `${'\t'.repeat(baseIndent)}${name}:`;
  // Indent each selected line by one tab
  await editor.edit((edit) => {
    edit.insert(new vscode.Position(start, 0), projectLine + '\n');
    for (let i = start; i <= end; i++) {
      // after inserting project, lines shift by 1
      edit.insert(new vscode.Position(i + 1, 0), '\t');
    }
  });
}

/** Move selected block under a chosen project. */
export async function moveToProject(editor: vscode.TextEditor): Promise<void> {
  const tp = new TaskyDocument(editor.document);
  const projects = tp.getProjects();
  const lines = tp.getSelectedLineNumbers(editor);
  if (!lines.length) {
    return;
  }

  type Pick = vscode.QuickPickItem & { line?: number; create?: boolean };
  const items: Pick[] = [
    {
      label: '$(add) New project…',
      create: true,
    },
    ...projects.map((p) => ({
      label: p.name,
      description: `line ${p.line + 1}`,
      line: p.line,
    })),
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Move to Project…',
    placeHolder: 'Choose destination project',
  });
  if (!pick) {
    return;
  }

  let targetLine: number;
  let targetName: string;

  if (pick.create) {
    const name = await vscode.window.showInputBox({
      title: 'New project',
      prompt: 'Project name',
      value: 'New Project',
    });
    if (!name) {
      return;
    }
    // Append project at end of document
    const last = editor.document.lineCount - 1;
    const endPos = new vscode.Position(last, editor.document.lineAt(last).text.length);
    await editor.edit((edit) => edit.insert(endPos, `\n${name}:\n`));
    targetLine = editor.document.lineCount - 2;
    // find the project we just added
    const refreshed = new TaskyDocument(editor.document).getProjects();
    const found = refreshed.find((p) => p.name === name);
    targetLine = found?.line ?? targetLine;
    targetName = name;
  } else {
    targetLine = pick.line!;
    targetName = pick.label;
  }

  // Collect block including children
  const start = lines[0];
  let end = lines[lines.length - 1];
  const baseIndent = lineIndent(editor.document, start);
  while (end + 1 < editor.document.lineCount) {
    const t = editor.document.lineAt(end + 1).text;
    if (t.trim() === '') {
      break;
    }
    if (lineIndent(editor.document, end + 1) > baseIndent) {
      end++;
    } else {
      break;
    }
  }

  // Don't move project into itself
  if (targetLine >= start && targetLine <= end) {
    vscode.window.showWarningMessage('Cannot move a project into itself.');
    return;
  }

  const block: string[] = [];
  for (let i = start; i <= end; i++) {
    block.push(editor.document.lineAt(i).text);
  }

  // Re-indent so block sits one level under target project
  const targetIndent = lineIndent(editor.document, targetLine);
  const desiredBase = targetIndent + 1;
  const delta = desiredBase - baseIndent;
  const reindented = block.map((line) => {
    if (delta > 0) {
      return '\t'.repeat(delta) + line;
    }
    if (delta < 0) {
      let i = 0;
      while (i < -delta && line[i] === '\t') {
        i++;
      }
      return line.slice(i);
    }
    return line;
  });

  // Delete original then insert after target project's current children end
  // Compute insert line after target's nested content
  let insertAfter = targetLine;
  const tIndent = targetIndent;
  for (let i = targetLine + 1; i < editor.document.lineCount; i++) {
    if (i >= start && i <= end) {
      // skip lines we're about to delete — use logical structure after delete is hard
      // simpler approach: delete first, then find project again
      break;
    }
    const t = editor.document.lineAt(i).text;
    if (t.trim() === '') {
      continue;
    }
    if (lineIndent(editor.document, i) > tIndent) {
      insertAfter = i;
    } else {
      break;
    }
  }

  // Simpler reliable approach: delete block, re-find project, append under it
  const blockText = reindented.join('\n');
  await editor.edit((edit) => {
    const delRange = new vscode.Range(
      start,
      0,
      end,
      editor.document.lineAt(end).text.length
    );
    // include trailing newline if present
    if (end + 1 < editor.document.lineCount) {
      edit.delete(new vscode.Range(start, 0, end + 1, 0));
    } else if (start > 0) {
      edit.delete(new vscode.Range(start - 1, editor.document.lineAt(start - 1).text.length, end, editor.document.lineAt(end).text.length));
    } else {
      edit.delete(delRange);
    }
  });

  // Re-find target project by name
  const projects2 = new TaskyDocument(editor.document).getProjects();
  const dest = projects2.find((p) => p.name === targetName);
  if (!dest) {
    // fallback append at end
    const last = editor.document.lineCount - 1;
    await editor.edit((edit) =>
      edit.insert(
        new vscode.Position(last, editor.document.lineAt(last).text.length),
        '\n' + blockText
      )
    );
    return;
  }

  let insertLine = dest.line;
  const di = lineIndent(editor.document, dest.line);
  for (let i = dest.line + 1; i < editor.document.lineCount; i++) {
    const t = editor.document.lineAt(i).text;
    if (t.trim() === '') {
      continue;
    }
    if (lineIndent(editor.document, i) > di) {
      insertLine = i;
    } else {
      break;
    }
  }

  const pos = new vscode.Position(
    insertLine,
    editor.document.lineAt(insertLine).text.length
  );
  await editor.edit((edit) => edit.insert(pos, '\n' + blockText));
}

function lineIndent(document: vscode.TextDocument, line: number): number {
  const text = document.lineAt(line).text;
  let i = 0;
  while (i < text.length && text[i] === '\t') {
    i++;
  }
  return i;
}
