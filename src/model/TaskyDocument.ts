import * as vscode from 'vscode';
import {
  BirchItem,
  BirchOutline,
  getBirch,
  itemsInDocumentOrder,
  todayDateString,
} from '../birch';
import {
  removeAllTagsFromLine,
  setOrToggleTag,
  toggleBareTag,
  toggleDoneOnLine,
} from './lineTags';
import { parseTaskyLine } from './lineParser';
import { toNote, toProject, toTask } from './lineTypes';
import { searchWithCache } from './outlineCache';

export type ItemType = 'project' | 'task' | 'note';

export interface LineInfo {
  line: number;
  text: string;
  indent: number;
  type: ItemType;
  bodyWithoutIndent: string;
  isDone: boolean;
  tags: { name: string; value: string; start: number; end: number }[];
  /** Absolute column of project trailing ':' or -1 */
  projectColonCol: number;
}

export class TaskyDocument {
  constructor(public readonly document: vscode.TextDocument) {}

  get text(): string {
    return this.document.getText();
  }

  createOutline(): BirchOutline {
    return getBirch().Outline.createTaskPaperOutline(this.text);
  }

  /**
   * Map document lines to birch items (DFS order).
   * Uses content match with unlimited resync (not a 5-item window).
   */
  mapLinesToItems(outline: BirchOutline): (BirchItem | undefined)[] {
    const items = itemsInDocumentOrder(outline);
    const lineCount = this.document.lineCount;
    const map: (BirchItem | undefined)[] = new Array(lineCount);
    const expectedLines = items.map((item) => this.serializeItemLine(item));

    let itemIndex = 0;
    for (let line = 0; line < lineCount; line++) {
      const lineText = this.document.lineAt(line).text;
      const normalized = this.normalizeLine(lineText);

      if (itemIndex >= items.length) {
        map[line] = undefined;
        continue;
      }

      // Fast path: sequential match
      if (
        lineText === expectedLines[itemIndex] ||
        normalized === this.normalizeLine(expectedLines[itemIndex])
      ) {
        map[line] = items[itemIndex];
        itemIndex++;
        continue;
      }

      // Empty line ↔ empty body note
      if (lineText.trim() === '' && items[itemIndex].bodyString === '') {
        map[line] = items[itemIndex];
        itemIndex++;
        continue;
      }

      // Resync: find matching remaining item by exact/normalized body line
      let found = -1;
      for (let j = itemIndex; j < items.length; j++) {
        if (
          lineText === expectedLines[j] ||
          normalized === this.normalizeLine(expectedLines[j])
        ) {
          found = j;
          break;
        }
      }
      if (found >= 0) {
        map[line] = items[found];
        itemIndex = found + 1;
      } else {
        map[line] = undefined;
      }
    }
    return map;
  }

  private serializeItemLine(item: BirchItem): string {
    const depth = Math.max(0, item.depth - 1);
    return '\t'.repeat(depth) + item.bodyString;
  }

  private normalizeLine(s: string): string {
    return s.replace(/\s+$/, '');
  }

  parseLine(lineNumber: number): LineInfo {
    const text = this.document.lineAt(lineNumber).text;
    const parsed = parseTaskyLine(text, lineNumber);
    return {
      line: lineNumber,
      text: parsed.text,
      indent: parsed.indent,
      type: parsed.type,
      bodyWithoutIndent: parsed.bodyWithoutIndent,
      isDone: parsed.isDone,
      tags: parsed.tags,
      projectColonCol: parsed.projectColonCol,
    };
  }


  getSelectedLineNumbers(editor: vscode.TextEditor): number[] {
    const lines = new Set<number>();
    for (const sel of editor.selections) {
      for (let i = sel.start.line; i <= sel.end.line; i++) {
        lines.add(i);
      }
    }
    return Array.from(lines).sort((a, b) => a - b);
  }

  /**
   * Apply per-line text transforms without birch (fast path).
   * Single undo step.
   */
  async applyLineTransforms(
    editor: vscode.TextEditor,
    lineNumbers: number[],
    transform: (lineText: string, line: number) => string
  ): Promise<void> {
    const edits: { line: number; next: string }[] = [];
    for (const line of lineNumbers) {
      if (line < 0 || line >= this.document.lineCount) {
        continue;
      }
      const prev = this.document.lineAt(line).text;
      const next = transform(prev, line);
      if (next !== prev) {
        edits.push({ line, next });
      }
    }
    if (!edits.length) {
      return;
    }
    await editor.edit((edit) => {
      for (const e of edits) {
        edit.replace(this.document.lineAt(e.line).range, e.next);
      }
    });
  }

  /**
   * Apply an outline mutation and write the serialized Tasky text back.
   * Prefer applyLineTransforms for simple tag toggles.
   */
  async applyOutlineMutation(
    editor: vscode.TextEditor,
    mutate: (outline: BirchOutline, lineMap: (BirchItem | undefined)[]) => void
  ): Promise<void> {
    const outline = this.createOutline();
    try {
      const lineMap = this.mapLinesToItems(outline);
      const cursorLine = editor.selection.active.line;
      const cursorChar = editor.selection.active.character;

      mutate(outline, lineMap);

      let serialized = outline.serialize();
      if (!this.text.endsWith('\n') && serialized.endsWith('\n')) {
        serialized = serialized.replace(/\n$/, '');
      }

      const fullRange = new vscode.Range(
        this.document.positionAt(0),
        this.document.positionAt(this.text.length)
      );

      const ok = await editor.edit((edit) => {
        edit.replace(fullRange, serialized);
      });

      if (ok) {
        const newLine = Math.min(cursorLine, editor.document.lineCount - 1);
        const lineLen = editor.document.lineAt(newLine).text.length;
        const pos = new vscode.Position(newLine, Math.min(cursorChar, lineLen));
        editor.selection = new vscode.Selection(pos, pos);
      }
    } finally {
      outline.destroy();
    }
  }

  /** Fast local @done toggle (no full-document birch rewrite). */
  async toggleDone(editor: vscode.TextEditor): Promise<void> {
    const includeDate = vscode.workspace
      .getConfiguration('tasky')
      .get<boolean>('includeDateWhenTaggingDone', true);
    const dateStr = todayDateString();
    const lines = this.getSelectedLineNumbers(editor);
    await this.applyLineTransforms(editor, lines, (text) =>
      toggleDoneOnLine(text, includeDate, dateStr)
    );
  }

  /** Convert selected lines to task/project/note via local text edits (no birch). */
  async setType(editor: vscode.TextEditor, type: ItemType): Promise<void> {
    const lines = this.getSelectedLineNumbers(editor);
    const transform =
      type === 'task' ? toTask : type === 'project' ? toProject : toNote;
    await this.applyLineTransforms(editor, lines, (text) => transform(text));
  }

  async indent(editor: vscode.TextEditor): Promise<void> {
    const lines = this.getSelectedLineNumbers(editor);
    await editor.edit((edit) => {
      for (const line of lines) {
        edit.insert(new vscode.Position(line, 0), '\t');
      }
    });
  }

  async outdent(editor: vscode.TextEditor): Promise<void> {
    const lines = this.getSelectedLineNumbers(editor);
    await editor.edit((edit) => {
      for (const line of lines) {
        const text = this.document.lineAt(line).text;
        if (text.startsWith('\t')) {
          edit.delete(new vscode.Range(line, 0, line, 1));
        }
      }
    });
  }

  async moveBlock(editor: vscode.TextEditor, direction: -1 | 1): Promise<void> {
    const lines = this.getSelectedLineNumbers(editor);
    if (lines.length === 0) {
      return;
    }

    const start = lines[0];
    let end = lines[lines.length - 1];
    const baseIndent = this.lineIndent(start);
    while (end + 1 < this.document.lineCount) {
      const next = this.document.lineAt(end + 1).text;
      if (next.trim() === '') {
        break;
      }
      if (this.lineIndent(end + 1) > baseIndent) {
        end++;
      } else {
        break;
      }
    }

    if (direction === -1 && start === 0) {
      return;
    }
    if (direction === 1 && end >= this.document.lineCount - 1) {
      return;
    }

    const blockLines: string[] = [];
    for (let i = start; i <= end; i++) {
      blockLines.push(this.document.lineAt(i).text);
    }

    if (direction === -1) {
      let prevStart = start - 1;
      while (prevStart > 0 && this.lineIndent(prevStart) > baseIndent) {
        prevStart--;
      }
      const pEnd = start - 1;
      const prevBlock: string[] = [];
      for (let i = prevStart; i <= pEnd; i++) {
        prevBlock.push(this.document.lineAt(i).text);
      }

      const newText = [...blockLines, ...prevBlock].join('\n');
      const range = new vscode.Range(
        prevStart,
        0,
        end,
        this.document.lineAt(end).text.length
      );
      await editor.edit((edit) => edit.replace(range, newText));
      const newStart = prevStart;
      const newEnd = prevStart + blockLines.length - 1;
      editor.selection = new vscode.Selection(
        newStart,
        0,
        newEnd,
        editor.document.lineAt(newEnd).text.length
      );
    } else {
      let nextStart = end + 1;
      if (nextStart >= this.document.lineCount) {
        return;
      }
      const nextIndent = this.lineIndent(nextStart);
      let nextEnd = nextStart;
      while (nextEnd + 1 < this.document.lineCount) {
        const n = this.document.lineAt(nextEnd + 1).text;
        if (n.trim() === '') {
          break;
        }
        if (this.lineIndent(nextEnd + 1) > nextIndent) {
          nextEnd++;
        } else {
          break;
        }
      }
      const nextBlock: string[] = [];
      for (let i = nextStart; i <= nextEnd; i++) {
        nextBlock.push(this.document.lineAt(i).text);
      }
      const newText = [...nextBlock, ...blockLines].join('\n');
      const range = new vscode.Range(
        start,
        0,
        nextEnd,
        this.document.lineAt(nextEnd).text.length
      );
      await editor.edit((edit) => edit.replace(range, newText));
      const newStart = start + nextBlock.length;
      const newEnd = newStart + blockLines.length - 1;
      editor.selection = new vscode.Selection(
        newStart,
        0,
        newEnd,
        editor.document.lineAt(newEnd).text.length
      );
    }
  }

  private lineIndent(line: number): number {
    const text = this.document.lineAt(line).text;
    let i = 0;
    while (i < text.length && text[i] === '\t') {
      i++;
    }
    return i;
  }

  /**
   * Item-path search via versioned birch outline cache.
   * Repeated searches on an unchanged document do not re-parse.
   */
  search(itemPath: string): { item: BirchItem; line: number; preview: string }[] {
    return searchWithCache(this.document, itemPath);
  }

  getProjects(): { name: string; line: number }[] {
    const projects: { name: string; line: number }[] = [];
    for (let i = 0; i < this.document.lineCount; i++) {
      const info = this.parseLine(i);
      if (info.type === 'project') {
        const name = info.bodyWithoutIndent
          .replace(/:(?:\s+@\S+)*\s*$/, '')
          .replace(/:$/, '');
        projects.push({ name, line: i });
      }
    }
    return projects;
  }
}
