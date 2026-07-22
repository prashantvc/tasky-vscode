import * as vscode from 'vscode';
import { LineInfo } from './TaskyDocument';
import { parseTaskyLine } from './lineParser';
import { markLinesUnderArchive } from './archiveScope';
import { COMMON_TAGS, EXCLUDE_TAGS, TagStats } from './tagTypes';

export interface DocumentAnalysis {
  version: number;
  uri: string;
  lines: LineInfo[];
  indents: number[];
  taskCount: number;
  doneCount: number;
  tagStats: Map<string, TagStats>;
}

const cache = new Map<string, DocumentAnalysis>();

function lineInfoFromParsed(parsed: ReturnType<typeof parseTaskyLine>, line: number): LineInfo {
  return {
    line,
    text: parsed.text,
    indent: parsed.indent,
    type: parsed.type,
    bodyWithoutIndent: parsed.bodyWithoutIndent,
    isDone: parsed.isDone,
    tags: parsed.tags,
    projectColonCol: parsed.projectColonCol,
  };
}

function buildFull(document: vscode.TextDocument): DocumentAnalysis {
  const n = document.lineCount;
  const lines: LineInfo[] = new Array(n);
  const indents: number[] = new Array(n);
  const tagStats = new Map<string, TagStats>();
  let taskCount = 0;
  let doneCount = 0;

  const ensure = (name: string): TagStats => {
    let s = tagStats.get(name);
    if (!s) {
      s = { name, values: new Set(), count: 0 };
      tagStats.set(name, s);
    }
    return s;
  };

  for (let i = 0; i < n; i++) {
    const text = document.lineAt(i).text;
    const parsed = parseTaskyLine(text, i);
    const info = lineInfoFromParsed(parsed, i);
    lines[i] = info;
    indents[i] = info.indent;
    if (info.type === 'task') {
      taskCount++;
      if (info.isDone) {
        doneCount++;
      }
    }
    for (const tag of info.tags) {
      if (EXCLUDE_TAGS.has(tag.name)) {
        continue;
      }
      const s = ensure(tag.name);
      s.count += 1;
      if (tag.value) {
        s.values.add(tag.value);
      }
    }
  }

  return {
    version: document.version,
    uri: document.uri.toString(),
    lines,
    indents,
    taskCount,
    doneCount,
    tagStats,
  };
}

/**
 * True if all content changes stay within existing single lines (no insert/delete of newlines).
 * Safe for O(changed-lines) incremental update.
 */
export function isSingleLineOnlyChange(
  e: vscode.TextDocumentContentChangeEvent[]
): boolean {
  if (!e.length) {
    return true;
  }
  for (const c of e) {
    if (c.range.start.line !== c.range.end.line) {
      return false;
    }
    if (c.text.indexOf('\n') !== -1 || c.text.indexOf('\r') !== -1) {
      return false;
    }
  }
  return true;
}

/**
 * Versioned analysis. Prefer incremental update for typing within a line.
 */
export function getDocumentAnalysis(
  document: vscode.TextDocument,
  changeEvent?: vscode.TextDocumentChangeEvent
): DocumentAnalysis {
  const key = document.uri.toString();
  const hit = cache.get(key);
  if (hit && hit.version === document.version) {
    return hit;
  }

  // Incremental: previous version + single-line edits only
  if (
    hit &&
    changeEvent &&
    changeEvent.document.uri.toString() === key &&
    hit.version === document.version - changeEvent.contentChanges.length &&
    // vscode version increments by 1 per edit batch typically
    isSingleLineOnlyChange([...changeEvent.contentChanges]) &&
    hit.lines.length === document.lineCount
  ) {
    // version delta can be 1 per onDidChangeTextDocument event
  }

  if (
    hit &&
    changeEvent &&
    hit.lines.length === document.lineCount &&
    isSingleLineOnlyChange([...changeEvent.contentChanges]) &&
    // accept any previous version if line count stable and single-line
    hit.version < document.version
  ) {
    const next = incrementalUpdate(hit, document, changeEvent.contentChanges);
    if (next) {
      cache.set(key, next);
      return next;
    }
  }

  const analysis = buildFull(document);
  cache.set(key, analysis);
  return analysis;
}

/**
 * Force full rebuild (e.g. after bulk commands).
 */
export function rebuildDocumentAnalysis(
  document: vscode.TextDocument
): DocumentAnalysis {
  const analysis = buildFull(document);
  cache.set(document.uri.toString(), analysis);
  return analysis;
}

function incrementalUpdate(
  prev: DocumentAnalysis,
  document: vscode.TextDocument,
  changes: readonly vscode.TextDocumentContentChangeEvent[]
): DocumentAnalysis | undefined {
  const lines = prev.lines.slice();
  const indents = prev.indents.slice();
  let taskCount = prev.taskCount;
  let doneCount = prev.doneCount;

  // Tag stats: rebuild from touched lines only is error-prone; for single-line
  // typing we recompute stats lazily only if tags likely changed.
  let tagsDirty = false;

  const touched = new Set<number>();
  for (const c of changes) {
    touched.add(c.range.start.line);
  }

  for (const line of touched) {
    if (line < 0 || line >= document.lineCount) {
      return undefined;
    }
    const oldInfo = lines[line];
    const text = document.lineAt(line).text;
    const parsed = parseTaskyLine(text, line);
    const info = lineInfoFromParsed(parsed, line);

    // Adjust counts
    if (oldInfo.type === 'task') {
      taskCount--;
      if (oldInfo.isDone) {
        doneCount--;
      }
    }
    if (info.type === 'task') {
      taskCount++;
      if (info.isDone) {
        doneCount++;
      }
    }
    if (
      oldInfo.tags.length !== info.tags.length ||
      oldInfo.tags.some((t, i) => t.name !== info.tags[i]?.name || t.value !== info.tags[i]?.value)
    ) {
      tagsDirty = true;
    }

    lines[line] = info;
    indents[line] = info.indent;
  }

  let tagStats = prev.tagStats;
  if (tagsDirty) {
    // Full tag recount is still O(n) but rare while typing plain text
    tagStats = recountTags(lines);
  }

  return {
    version: document.version,
    uri: document.uri.toString(),
    lines,
    indents,
    taskCount,
    doneCount,
    tagStats,
  };
}

function recountTags(
  lines: LineInfo[],
  options?: { excludeArchived?: boolean }
): Map<string, TagStats> {
  const skip =
    options?.excludeArchived === true
      ? markLinesUnderArchive(lines)
      : undefined;
  const tagStats = new Map<string, TagStats>();
  for (let i = 0; i < lines.length; i++) {
    if (skip && skip[i]) {
      continue;
    }
    const info = lines[i];
    for (const tag of info.tags) {
      if (EXCLUDE_TAGS.has(tag.name)) {
        continue;
      }
      let s = tagStats.get(tag.name);
      if (!s) {
        s = { name: tag.name, values: new Set(), count: 0 };
        tagStats.set(tag.name, s);
      }
      s.count += 1;
      if (tag.value) {
        s.values.add(tag.value);
      }
    }
  }
  return tagStats;
}

export function invalidateDocumentAnalysis(uri: vscode.Uri): void {
  cache.delete(uri.toString());
}

export function pruneDocumentAnalysis(openUris: ReadonlySet<string>): void {
  for (const key of cache.keys()) {
    if (!openUris.has(key)) {
      cache.delete(key);
    }
  }
}

export function collectTagsCached(
  document: vscode.TextDocument,
  options?: { includeCommon?: boolean; excludeArchived?: boolean }
): Map<string, TagStats> {
  const analysis = getDocumentAnalysis(document);
  const includeCommon = options?.includeCommon !== false;
  const excludeArchived = options?.excludeArchived === true;

  // Full analysis includes Archive:; re-count when sidebar needs active tags only.
  const sourceStats = excludeArchived
    ? recountTags(analysis.lines, { excludeArchived: true })
    : analysis.tagStats;

  const map = new Map<string, TagStats>();
  for (const [name, stats] of sourceStats) {
    map.set(name, {
      name,
      values: new Set(stats.values),
      count: stats.count,
    });
  }
  if (includeCommon) {
    for (const name of COMMON_TAGS) {
      if (!EXCLUDE_TAGS.has(name) && !map.has(name)) {
        map.set(name, { name, values: new Set(), count: 0 });
      }
    }
  }
  return map;
}

export function computeFoldingRanges(
  document: vscode.TextDocument,
  analysis: DocumentAnalysis
): vscode.FoldingRange[] {
  const n = document.lineCount;
  const { indents, lines } = analysis;
  const ranges: vscode.FoldingRange[] = [];
  const nonempty: number[] = [];
  for (let i = 0; i < n; i++) {
    if (lines[i].text.trim() !== '') {
      nonempty.push(i);
    }
  }
  for (let a = 0; a < nonempty.length; a++) {
    const i = nonempty[a];
    const indent = indents[i];
    let end = i;
    for (let b = a + 1; b < nonempty.length; b++) {
      const j = nonempty[b];
      if (indents[j] > indent) {
        end = j;
      } else {
        break;
      }
    }
    if (end > i) {
      const kind =
        lines[i].type === 'project'
          ? vscode.FoldingRangeKind.Region
          : undefined;
      ranges.push(new vscode.FoldingRange(i, end, kind));
    }
  }
  return ranges;
}

/**
 * Notify cache of a document change so the next getDocumentAnalysis can be incremental.
 * Call from onDidChangeTextDocument before other consumers.
 */
export function noteDocumentChange(e: vscode.TextDocumentChangeEvent): void {
  if (e.document.languageId !== 'tasky') {
    return;
  }
  // Warm / update cache immediately with incremental path
  getDocumentAnalysis(e.document, e);
}
