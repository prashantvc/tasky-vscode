import * as vscode from 'vscode';
import { BirchItem, BirchOutline, getBirch, itemsInDocumentOrder } from '../birch';
import { TaskyDocument } from './TaskyDocument';

interface OutlineCacheEntry {
  version: number;
  outline: BirchOutline;
  /** Parallel to document lines */
  lineMap: (BirchItem | undefined)[];
  itemToLine: Map<BirchItem, number>;
}

const cache = new Map<string, OutlineCacheEntry>();

/**
 * Versioned birch-outline cache.
 * Search/filter reuse the same parse until the document version changes.
 */
export function getCachedOutline(document: vscode.TextDocument): BirchOutline {
  return getOutlineEntry(document).outline;
}

function getOutlineEntry(document: vscode.TextDocument): OutlineCacheEntry {
  const key = document.uri.toString();
  const hit = cache.get(key);
  if (hit && hit.version === document.version) {
    return hit;
  }

  if (hit) {
    try {
      hit.outline.destroy();
    } catch {
      /* ignore */
    }
  }

  const tp = new TaskyDocument(document);
  const outline = getBirch().Outline.createTaskPaperOutline(document.getText());
  const lineMap = tp.mapLinesToItems(outline);
  const itemToLine = new Map<BirchItem, number>();
  lineMap.forEach((item, line) => {
    if (item) {
      itemToLine.set(item, line);
    }
  });

  const entry: OutlineCacheEntry = {
    version: document.version,
    outline,
    lineMap,
    itemToLine,
  };
  cache.set(key, entry);
  return entry;
}

/**
 * Item-path search using the versioned outline cache (no re-parse if unchanged).
 */
export function searchWithCache(
  document: vscode.TextDocument,
  itemPath: string
): { item: BirchItem; line: number; preview: string }[] {
  const entry = getOutlineEntry(document);
  const matches = entry.outline.evaluateItemPath(itemPath);
  return matches
    .map((item) => {
      const line = entry.itemToLine.get(item) ?? -1;
      return {
        item,
        line,
        preview: item.bodyString,
      };
    })
    .filter((m) => m.line >= 0);
}

/** Drop and destroy outlines not in the open set. */
export function pruneOutlineCache(openUris: ReadonlySet<string>): void {
  for (const [key, entry] of cache) {
    if (!openUris.has(key)) {
      try {
        entry.outline.destroy();
      } catch {
        /* ignore */
      }
      cache.delete(key);
    }
  }
}

export function invalidateOutlineCache(uri: vscode.Uri): void {
  const key = uri.toString();
  const hit = cache.get(key);
  if (hit) {
    try {
      hit.outline.destroy();
    } catch {
      /* ignore */
    }
    cache.delete(key);
  }
}
