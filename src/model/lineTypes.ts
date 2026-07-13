/**
 * Convert a Tasky line between project / task / note by editing markers only.
 * Does not use birch — trailing tags are preserved.
 */

/** Strip leading task marker "- ". */
function stripTaskMarker(body: string): string {
  if (body.startsWith('- ')) {
    return body.slice(2);
  }
  if (body === '-') {
    return '';
  }
  return body;
}

/**
 * Split body into content + trailing tags (best-effort, same spirit as birch).
 * Returns [contentWithoutTrailingTags, trailingIncludingLeadingSpace]
 */
function splitTrailingTags(body: string): { content: string; trailing: string } {
  const re =
    /((?:\s+@((?:[A-Za-z_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\-.0-9\u00B7\u0300-\u036F\u203F-\u2040])*)(?:\(((?:\\\(|\\\)|[^()])*)\))?)+)\s*$/;
  const m = body.match(re);
  if (!m || m.index === undefined) {
    return { content: body, trailing: '' };
  }
  return {
    content: body.slice(0, m.index),
    trailing: body.slice(m.index),
  };
}

/** Remove a single trailing structural project colon (before trailing tags). */
function stripProjectColon(content: string): string {
  if (content.endsWith(':') && content.length > 1) {
    // Don't strip if it's only ":"
    return content.slice(0, -1);
  }
  return content;
}

function splitIndent(line: string): { indent: string; body: string } {
  let i = 0;
  while (i < line.length && line[i] === '\t') {
    i++;
  }
  return { indent: line.slice(0, i), body: line.slice(i) };
}

/** Reformat line as a task: "- content" + trailing tags. */
export function toTask(line: string): string {
  if (line.trim() === '') {
    return line;
  }
  const { indent, body } = splitIndent(line);
  let rest = stripTaskMarker(body);
  const { content, trailing } = splitTrailingTags(rest);
  const core = stripProjectColon(content);
  const text = core.length ? core : 'New Task';
  return `${indent}- ${text}${trailing}`;
}

/** Reformat line as a project: "content:" + trailing tags. */
export function toProject(line: string): string {
  if (line.trim() === '') {
    return line;
  }
  const { indent, body } = splitIndent(line);
  let rest = stripTaskMarker(body);
  const { content, trailing } = splitTrailingTags(rest);
  let core = stripProjectColon(content).replace(/\s+$/, '');
  if (!core.length) {
    core = 'New Project';
  }
  return `${indent}${core}:${trailing}`;
}

/** Reformat line as a note: plain content + trailing tags. */
export function toNote(line: string): string {
  if (line.trim() === '') {
    return line;
  }
  const { indent, body } = splitIndent(line);
  let rest = stripTaskMarker(body);
  const { content, trailing } = splitTrailingTags(rest);
  const core = stripProjectColon(content);
  return `${indent}${core}${trailing}`;
}
