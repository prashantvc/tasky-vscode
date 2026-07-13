import * as vscode from 'vscode';
import { BirchItem, getBirch } from '../birch';
import { TaskyDocument } from '../model/TaskyDocument';

/**
 * Archive @done items — same algorithm as Tasky's tasky.coffee plugin:
 * - Find //@done except those already under Archive:
 * - Collapse to common ancestors
 * - Optionally strip extra tags / add @project(...)
 * - Move under Archive: (create if missing), newest first
 *
 * Guide: Tag > Archive @done Items (Command-Shift-A)
 * https://www.taskpaper.com/guide/using-taskpaper/making-lists.html
 */
export async function archiveDone(editor: vscode.TextEditor): Promise<number> {
  const tp = new TaskyDocument(editor.document);
  const birch = getBirch();
  const outline = tp.createOutline();
  let moved = 0;

  try {
    const config = vscode.workspace.getConfiguration('tasky');
    const removeExtraTags = config.get<boolean>('archive.removeExtraTags', false);
    const includeProject = config.get<boolean>('archive.includeProjectTag', true);

    const doneItems = birch.Item.getCommonAncestors(
      outline.evaluateItemPath('//@done except //@text = Archive://@done')
    );

    if (doneItems.length === 0) {
      vscode.window.showInformationMessage(
        'Nothing to archive — no @done items outside Archive.'
      );
      return 0;
    }

    const run = () => {
      let archive = outline.evaluateItemPath('//@text = Archive:')[0];
      if (!archive) {
        archive = outline.createItem('Archive:');
        outline.root.appendChildren(archive);
        archive = outline.evaluateItemPath('//@text = Archive:')[0] ?? archive;
      }

      for (const each of doneItems) {
        if (removeExtraTags) {
          for (const name of [...each.attributeNames]) {
            if (
              name.indexOf('data-') === 0 &&
              name !== 'data-type' &&
              name !== 'data-done'
            ) {
              each.removeAttribute(name);
            }
          }
        }
        if (includeProject) {
          const projects = outline.evaluateItemPath('ancestor::@type=project', each);
          if (projects.length) {
            const labels = projects
              .map((p) => {
                const s = p.bodyContentString ?? p.bodyString;
                return s.replace(/:$/, '').trim();
              })
              .filter(Boolean);
            if (labels.length) {
              each.setAttribute('data-project', labels.join(' / '));
            }
          }
        }
      }

      const before = archive.firstChild;
      archive.insertChildrenBefore(doneItems, before);
      moved = doneItems.length;
    };

    if (typeof outline.groupChanges === 'function') {
      outline.groupChanges(run);
    } else {
      run();
    }

    let serialized = outline.serialize();
    if (!editor.document.getText().endsWith('\n') && serialized.endsWith('\n')) {
      serialized = serialized.replace(/\n$/, '');
    }
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );
    await editor.edit((edit) => edit.replace(fullRange, serialized));
  } finally {
    outline.destroy();
  }

  vscode.window.showInformationMessage(
    moved === 1
      ? 'Archived 1 item under Archive:'
      : `Archived ${moved} items under Archive:`
  );
  return moved;
}
