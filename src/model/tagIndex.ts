import * as vscode from 'vscode';
import { collectTagsCached } from './documentCache';
export { COMMON_TAGS, EXCLUDE_TAGS, TagStats } from './tagTypes';
import type { TagStats } from './tagTypes';

/**
 * Collect tag names and values (versioned document cache).
 * @param options.excludeArchived — omit tags on lines under the Archive: project
 */
export function collectTags(
  document: vscode.TextDocument,
  options?: { includeCommon?: boolean; excludeArchived?: boolean }
): Map<string, TagStats> {
  return collectTagsCached(document, options);
}

/** Sorted tag names: document tags by frequency, then remaining common tags. */
export function sortedTagNames(tags: Map<string, TagStats>): string[] {
  return Array.from(tags.values())
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    })
    .map((s) => s.name);
}
