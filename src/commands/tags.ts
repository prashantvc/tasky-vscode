import * as vscode from 'vscode';
import { TaskyDocument } from '../model/TaskyDocument';
import { todayDateString } from '../birch';
import { collectTags, sortedTagNames } from '../model/tagIndex';
import {
  removeAllTagsFromLine,
  setOrToggleTag,
  toggleBareTag,
} from '../model/lineTags';

/** Toggle @today on selected lines (line-local, no birch). */
export async function toggleToday(editor: vscode.TextEditor): Promise<void> {
  const tp = new TaskyDocument(editor.document);
  const lines = tp.getSelectedLineNumbers(editor);
  await tp.applyLineTransforms(editor, lines, (text) =>
    toggleBareTag(text, 'today')
  );
}

/** Remove all tags from selected lines (line-local). */
export async function removeTags(editor: vscode.TextEditor): Promise<void> {
  const tp = new TaskyDocument(editor.document);
  const lines = tp.getSelectedLineNumbers(editor);
  await tp.applyLineTransforms(editor, lines, (text) =>
    removeAllTagsFromLine(text)
  );
}

/**
 * Tag With… palette — pick existing tags from the document or type a new one.
 */
export async function tagWith(editor: vscode.TextEditor): Promise<void> {
  const tp = new TaskyDocument(editor.document);
  const tagMap = collectTags(editor.document, { includeCommon: true });
  const picks = sortedTagNames(tagMap).map((name) => ({
    label: `@${name}`,
    description:
      name === 'done' ? 'Toggle done' : name === 'today' ? 'Toggle today' : '',
    name,
  }));

  const pick = await vscode.window.showQuickPick(
    [
      {
        label: '$(edit) Type a new tag…',
        description: 'e.g. due or due(2026-07-20)',
        name: '__new__',
      },
      ...picks,
    ],
    { title: 'Tag With…', placeHolder: 'Choose a tag to toggle on the selection' }
  );
  if (!pick) {
    return;
  }

  let tagName = pick.name;
  let tagValue: string | undefined;

  if (tagName === '__new__') {
    const typed = await vscode.window.showInputBox({
      title: 'New tag',
      prompt:
        'Tag name, or name(value). Examples: waiting  |  due(2026-07-20)  |  priority(1)',
      placeHolder: 'due(tomorrow)',
      validateInput: (v) => {
        if (!v.trim()) {
          return 'Enter a tag name';
        }
        return undefined;
      },
    });
    if (!typed) {
      return;
    }
    const m = typed
      .trim()
      .replace(/^@/, '')
      .match(/^([^\s(]+)(?:\((.*)\))?$/);
    if (!m) {
      vscode.window.showErrorMessage('Could not parse tag');
      return;
    }
    tagName = m[1];
    tagValue = m[2];
  } else if (tagName === 'done') {
    await tp.toggleDone(editor);
    return;
  } else if (tagName === 'due' || tagName === 'start') {
    const today = todayDateString();
    const value = await vscode.window.showInputBox({
      title: `@${tagName}`,
      prompt: `Value for @${tagName} (leave empty for bare tag, or enter a date)`,
      value: today,
      placeHolder: today,
    });
    if (value === undefined) {
      return;
    }
    tagValue = value.trim() || undefined;
  }

  const lines = tp.getSelectedLineNumbers(editor);
  await tp.applyLineTransforms(editor, lines, (text) =>
    setOrToggleTag(text, tagName, tagValue)
  );
}
