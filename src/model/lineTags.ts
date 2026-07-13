/**
 * Line-local tag text mutations (no birch). Fast path for toggle done/today/tags.
 */

const TAG_BODY =
  '(?:[A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD]|[\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040])*';

function tagPattern(name: string): RegExp {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(^|\\s)@(${esc})(?:\\(((?:\\\\\\(|\\\\\\)|[^()])*)\\))?(?=\\s|$)`,
    'g'
  );
}

/** Remove a specific @tag / @tag(value) from a line. */
export function removeTagFromLine(line: string, tagName: string): string {
  const re = tagPattern(tagName);
  return line
    .replace(re, (match, lead: string) => (lead === ' ' || lead === '\t' ? '' : lead))
    .replace(/[ \t]+$/g, '');
}

/** True if line has @tagName (any value). */
export function lineHasTag(line: string, tagName: string): boolean {
  const re = tagPattern(tagName);
  re.lastIndex = 0;
  return re.test(line);
}

/** Get attribute value or '' for bare tag; undefined if missing. */
export function getTagValue(line: string, tagName: string): string | undefined {
  const re = tagPattern(tagName);
  re.lastIndex = 0;
  const m = re.exec(line);
  if (!m) {
    return undefined;
  }
  return m[3] !== undefined ? m[3] : '';
}

/**
 * Toggle bare @tag (no value). If present, remove; else append.
 */
export function toggleBareTag(line: string, tagName: string): string {
  if (lineHasTag(line, tagName)) {
    return removeTagFromLine(line, tagName);
  }
  if (line.trim() === '') {
    return line;
  }
  return line.replace(/[ \t]+$/g, '') + ` @${tagName}`;
}

/**
 * Toggle @done, optionally with date value when adding.
 */
export function toggleDoneOnLine(
  line: string,
  includeDate: boolean,
  dateStr: string
): string {
  if (lineHasTag(line, 'done')) {
    return removeTagFromLine(line, 'done');
  }
  if (line.trim() === '') {
    return line;
  }
  const tag = includeDate ? `@done(${dateStr})` : '@done';
  return line.replace(/[ \t]+$/g, '') + ' ' + tag;
}

/**
 * Set or toggle valued tag.
 * - If same value already present → remove
 * - Else set/replace tag with value (or bare if value is '')
 */
export function setOrToggleTag(
  line: string,
  tagName: string,
  value: string | undefined
): string {
  if (value === undefined) {
    return toggleBareTag(line, tagName);
  }
  const current = getTagValue(line, tagName);
  if (current === value) {
    return removeTagFromLine(line, tagName);
  }
  let next = removeTagFromLine(line, tagName);
  if (next.trim() === '') {
    return next;
  }
  const encoded =
    value === ''
      ? `@${tagName}`
      : `@${tagName}(${value.replace(/\)/g, '\\)').replace(/\(/g, '\\(')})`;
  return next.replace(/[ \t]+$/g, '') + ' ' + encoded;
}

/** Remove all @tags from a line (keeps task/project/note markers). */
export function removeAllTagsFromLine(line: string): string {
  const re = new RegExp(
    `(^|\\s)@(${TAG_BODY})(?:\\(((?:\\\\\\(|\\\\\\)|[^()])*)\\))?(?=\\s|$)`,
    'g'
  );
  return line
    .replace(re, (match, lead: string) => (lead === ' ' || lead === '\t' ? '' : lead))
    .replace(/[ \t]+$/g, '');
}
