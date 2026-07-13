/**
 * Fast line classification for Tasky (no VS Code dependency).
 * Optimized for the typing hot path: full-document rescans.
 */

export type ItemType = 'project' | 'task' | 'note';

export interface ParsedLine {
  text: string;
  indent: number;
  type: ItemType;
  bodyWithoutIndent: string;
  isDone: boolean;
  tags: { name: string; value: string; start: number; end: number }[];
  projectColonCol: number;
}

/** Fast tag scan: only runs when '@' is present. Simpler than full Unicode class. */
const TAG_RE =
  /(^|\s)@([A-Za-z_][\w\-.]*)(?:\(((?:\\\(|\\\)|[^()])*)\))?(?=\s|$)/g;

/**
 * Parse one Tasky line. Pure function — used by document cache.
 */
export function parseTaskyLine(text: string, lineNumber = 0): ParsedLine {
  let indent = 0;
  const len = text.length;
  while (indent < len && text.charCodeAt(indent) === 9 /* \t */) {
    indent++;
  }
  const body = text.slice(indent);
  let type: ItemType = 'note';
  let projectColonCol = -1;

  // Task: "- " prefix
  if (body.length >= 2 && body.charCodeAt(0) === 45 /* - */ && body.charCodeAt(1) === 32) {
    type = 'task';
  } else if (body.length >= 1 && body.charCodeAt(0) === 45 && body.length === 1) {
    type = 'task';
  } else {
    const colonCol = findProjectColon(body);
    if (colonCol >= 0) {
      type = 'project';
      projectColonCol = indent + colonCol;
    }
  }

  const tags: ParsedLine['tags'] = [];
  let isDone = false;

  // Only scan tags if '@' exists (common lines have none)
  if (body.indexOf('@') !== -1) {
    TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG_RE.exec(body)) !== null) {
      const leading = m[1] ?? '';
      const name = m[2];
      const value = m[3] ?? '';
      const startInBody = m.index + leading.length;
      const endInBody = m.index + m[0].length;
      tags.push({
        name,
        value,
        start: indent + startInBody,
        end: indent + endInBody,
      });
      if (name === 'done') {
        isDone = true;
      }
    }
  }

  return {
    text,
    indent,
    type,
    bodyWithoutIndent: body,
    isDone,
    tags,
    projectColonCol,
  };
}

function findProjectColon(body: string): number {
  if (!body || body.charCodeAt(0) === 45) {
    return -1;
  }
  // Strip trailing tags quickly if '@' present
  let content = body;
  if (body.indexOf('@') !== -1) {
    // remove trailing " @tag" / " @tag(val)" runs
    content = body.replace(/(?:\s+@[A-Za-z_][\w\-.]*(?:\((?:\\\(|\\\)|[^()])*\))?)+$/, '');
  }
  if (content.length > 1 && content.charCodeAt(content.length - 1) === 58 /* : */) {
    return content.length - 1;
  }
  return -1;
}
