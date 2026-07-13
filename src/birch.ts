import * as fs from 'fs';
import * as path from 'path';

/** Minimal typings for the birch-outline webpack bundle. */
export interface BirchItem {
  bodyString: string;
  depth: number;
  parent: BirchItem | null;
  firstChild: BirchItem | null;
  lastChild: BirchItem | null;
  nextSibling: BirchItem | null;
  previousSibling: BirchItem | null;
  children: BirchItem[];
  descendants: BirchItem[];
  attributeNames: string[];
  getAttribute(name: string): string | undefined;
  setAttribute(name: string, value?: string | null): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;
  removeFromParent(): void;
  insertChildren(children: BirchItem[], beforeSibling?: BirchItem | null): void;
  insertChildrenBefore(children: BirchItem[], beforeSibling?: BirchItem | null): void;
  appendChildren(children: BirchItem[] | BirchItem): void;
  contains(item: BirchItem): boolean;
  bodyContentString?: string;
  clone(deep?: boolean): BirchItem;
}

export interface BirchOutline {
  root: BirchItem;
  items: BirchItem[];
  serialize(options?: { type?: string }): string;
  evaluateItemPath(path: string, contextItem?: BirchItem | null): BirchItem[];
  createItem(text: string): BirchItem;
  groupUndo(callback: () => void): void;
  groupChanges(callback: () => void): void;
  groupUndoAndChanges?(callback: () => void): void;
  destroy(): void;
}

export interface BirchModule {
  Outline: {
    createTaskPaperOutline(content?: string): BirchOutline;
    createOutline(type?: string, content?: string): BirchOutline;
  };
  Item: {
    getCommonAncestors(items: BirchItem[]): BirchItem[];
  };
  ItemPath: {
    parse(
      path: string,
      startRule?: string,
      types?: Record<string, boolean>
    ): {
      parsedPath: unknown;
      keywords: unknown[];
      error: { message?: string; location?: { start: { offset: number } } } | null;
    };
  };
  DateTime: {
    format(dateOrString: Date | string, showMs?: boolean, showSec?: boolean): string;
    parse(string: string): Date | null;
  };
  ItemSerializer: {
    TaskPaperType: string;
  };
}

let cached: BirchModule | undefined;

/**
 * Load the official birch-outline webpack bundle (vendored birch-outline (TaskPaper format engine)).
 * The bundle assigns `var birchoutline = ...` (library export).
 *
 * Uses indirect eval so the `var birchoutline` binding is created in the
 * current scope. (vm.runInContext was unreliable/slow with this large bundle.)
 */
export function getBirch(): BirchModule {
  if (cached) {
    return cached;
  }

  const bundlePath = path.join(__dirname, '..', 'vendor', 'birchoutline.js');
  const code = fs.readFileSync(bundlePath, 'utf8');
  // eslint-disable-next-line no-eval
  const birchoutline = (0, eval)(`${code}; birchoutline`) as BirchModule;

  if (!birchoutline || !birchoutline.Outline) {
    throw new Error('Failed to load birchoutline.js — birchoutline global missing');
  }
  cached = birchoutline;
  return birchoutline;
}

/** Depth-first list of items under root (document line order). */
export function itemsInDocumentOrder(outline: BirchOutline): BirchItem[] {
  const result: BirchItem[] = [];
  const walk = (item: BirchItem) => {
    for (const child of item.children) {
      result.push(child);
      walk(child);
    }
  };
  walk(outline.root);
  return result;
}

/** Today's date as YYYY-MM-DD (TaskPaper default for @done). */
export function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
