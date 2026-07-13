import * as vscode from 'vscode';
import { TaskyDocument } from '../model/TaskyDocument';
import { collectTags, EXCLUDE_TAGS } from '../model/tagIndex';

export type SidebarKind =
  | 'home'
  | 'group'
  | 'project'
  | 'search'
  | 'tag'
  | 'tag-value'
  | 'empty';

export interface SidebarNode {
  id: string;
  kind: SidebarKind;
  label: string;
  description?: string;
  /** Item-path filter to apply when selected (searches / tags). */
  itemPath?: string;
  /** Document line for projects (0-based). */
  line?: number;
  /** Indent depth for nested projects (0 = top-level under Projects). */
  depth?: number;
  children?: SidebarNode[];
  collapsible?: boolean;
}

/** Built-in searches matching Tasky’s default configuration spirit. */
export const DEFAULT_SEARCHES: { title: string; itemPath: string }[] = [
  { title: 'Not Done', itemPath: 'not @done except @done//*' },
  { title: 'Today', itemPath: '@today union @due <[d] tomorrow' },
  { title: 'All Tasks', itemPath: '//task' },
  { title: 'Done', itemPath: '//@done' },
];


/**
 * Build a Tasky-style sidebar tree for the given document:
 * Home · Projects · Searches · Tags
 */
export function buildSidebarTree(
  document: vscode.TextDocument | undefined
): SidebarNode[] {
  if (!document || document.languageId !== 'tasky') {
    return [
      {
        id: 'empty',
        kind: 'empty',
        label: 'Open a .taskpaper or .tasks file',
        description: 'Sidebar mirrors Projects, Searches, and Tags',
      },
    ];
  }

  const tp = new TaskyDocument(document);
  const home: SidebarNode = {
    id: 'home',
    kind: 'home',
    label: 'Home',
    description: 'Show entire document',
  };

  const projectsGroup: SidebarNode = {
    id: 'projects',
    kind: 'group',
    label: 'Projects',
    collapsible: true,
    children: buildProjectTree(tp, document),
  };

  const searchesGroup: SidebarNode = {
    id: 'searches',
    kind: 'group',
    label: 'Searches',
    collapsible: true,
    children: buildSearches(tp, document),
  };

  const tagsGroup: SidebarNode = {
    id: 'tags',
    kind: 'group',
    label: 'Tags',
    collapsible: true,
    children: buildTags(document),
  };

  return [home, projectsGroup, searchesGroup, tagsGroup];
}

function projectTitle(body: string): string {
  return body
    .replace(/:(?:\s+@\S+)*\s*$/, '')
    .replace(/:$/, '')
    .trim();
}

function buildProjectTree(
  tp: TaskyDocument,
  document: vscode.TextDocument
): SidebarNode[] {
  interface Proj {
    line: number;
    indent: number;
    title: string;
  }
  const projects: Proj[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    const info = tp.parseLine(i);
    if (info.type === 'project') {
      const title = projectTitle(info.bodyWithoutIndent);
      if (title) {
        projects.push({ line: i, indent: info.indent, title });
      }
    }
  }

  if (projects.length === 0) {
    return [
      {
        id: 'projects-empty',
        kind: 'empty',
        label: 'No projects',
        description: 'Lines ending with :',
      },
    ];
  }

  // Nest by indent (same as Tasky sidebar)
  const roots: SidebarNode[] = [];
  const stack: { indent: number; node: SidebarNode }[] = [];

  for (const p of projects) {
    const node: SidebarNode = {
      id: `project:${p.line}:${p.title}`,
      kind: 'project',
      label: p.title,
      line: p.line,
      depth: p.indent,
      // Focus: project item and its descendants via item path
      itemPath: `project ${escapeItemPathLiteral(p.title)} union project ${escapeItemPathLiteral(
        p.title
      )}//*`,
      children: [],
      collapsible: false,
    };

    while (stack.length && stack[stack.length - 1].indent >= p.indent) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      parent.children = parent.children ?? [];
      parent.children.push(node);
      parent.collapsible = true;
    }
    stack.push({ indent: p.indent, node });
  }

  return roots;
}

function escapeItemPathLiteral(s: string): string {
  // Quote if contains spaces or special chars
  if (/^[\w-]+$/.test(s)) {
    return s;
  }
  return `"${s.replace(/"/g, '\\"')}"`;
}

function buildSearches(
  tp: TaskyDocument,
  document: vscode.TextDocument
): SidebarNode[] {
  const nodes: SidebarNode[] = [];
  const seen = new Set<string>();

  // Embedded @search(...) tags in the document (Tasky convention)
  for (let i = 0; i < document.lineCount; i++) {
    const info = tp.parseLine(i);
    for (const tag of info.tags) {
      if (tag.name === 'search' && tag.value) {
        const title =
          info.type === 'project'
            ? projectTitle(info.bodyWithoutIndent)
            : info.bodyWithoutIndent
                .replace(/^-\s*/, '')
                .replace(
                  /(?:\s+@[\w][\w\-.]*(?:\((?:\\\(|\\\)|[^()])*\))?)+$/g,
                  ''
                )
                .trim() || tag.value;
        const key = `search:${title}:${tag.value}`;
        if (!seen.has(key)) {
          seen.add(key);
          nodes.push({
            id: key,
            kind: 'search',
            label: title,
            description: tag.value,
            itemPath: tag.value,
          });
        }
      }
    }
  }

  // Always offer built-in defaults (skip duplicates by title)
  const titles = new Set(nodes.map((n) => n.label.toLowerCase()));
  for (const def of DEFAULT_SEARCHES) {
    if (!titles.has(def.title.toLowerCase())) {
      nodes.push({
        id: `search-default:${def.title}`,
        kind: 'search',
        label: def.title,
        description: def.itemPath,
        itemPath: def.itemPath,
      });
    }
  }

  return nodes;
}

function buildTags(document: vscode.TextDocument): SidebarNode[] {
  // Line-scan index (same source as autocomplete / Tag With…)
  const map = collectTags(document, { includeCommon: false });
  // Drop internal/config tags from sidebar
  for (const name of [...map.keys()]) {
    if (EXCLUDE_TAGS.has(name) || name === 'search') {
      map.delete(name);
    }
  }

  const tagNames = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  if (tagNames.length === 0) {
    return [
      {
        id: 'tags-empty',
        kind: 'empty',
        label: 'No tags',
        description: 'Use @tag or @tag(value)',
      },
    ];
  }

  return tagNames.map((name) => {
    const stats = map.get(name)!;
    const values = Array.from(stats.values).sort((a, b) => a.localeCompare(b));
    const tagLabel = `@${name}`;
    const children: SidebarNode[] = values.map((value) => ({
      id: `tag:${name}:${value}`,
      kind: 'tag-value' as const,
      label: value,
      itemPath: `${tagLabel} contains[l] "${value.replace(/"/g, '\\"')}"`,
    }));
    return {
      id: `tag:${name}`,
      kind: 'tag' as const,
      label: tagLabel,
      itemPath: tagLabel,
      children: children.length ? children : undefined,
      collapsible: children.length > 0,
    };
  });
}

