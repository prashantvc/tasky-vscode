export type TagCompletionContext =
  | {
      kind: 'name';
      /** Partial tag name after @ (may be empty) */
      prefix: string;
      /** Start column of the @ character */
      atCol: number;
    }
  | {
      kind: 'value';
      tagName: string;
      /** Partial value inside parentheses */
      prefix: string;
      /** Start column of the value (char after '(') */
      valueStartCol: number;
      /** Whether a closing ) already exists after the cursor */
      hasClosingParen: boolean;
    }
  | { kind: 'none' };

/**
 * Detect whether the cursor is completing a tag name or tag value.
 * Pure function — unit-testable without VS Code.
 *
 * @param lineText full line text
 * @param character cursor column (0-based)
 */
export function detectTagCompletionContext(
  lineText: string,
  character: number
): TagCompletionContext {
  const left = lineText.slice(0, character);
  const right = lineText.slice(character);

  // Value context: @tagName(partial
  const valueMatch = left.match(
    /(?:^|[\s\t])@([A-Za-z_\u00C0-\u024F][\w\u00C0-\u024F\-.]*)\(([^)]*)$/
  );
  if (valueMatch) {
    const tagName = valueMatch[1];
    const prefix = valueMatch[2] ?? '';
    const openParen = left.lastIndexOf('(');
    const hasClose = /^\s*\)/.test(right);
    return {
      kind: 'value',
      tagName,
      prefix,
      valueStartCol: openParen + 1,
      hasClosingParen: hasClose,
    };
  }

  // Name context: @partial (must be preceded by start or whitespace)
  const nameMatch = left.match(/(?:^|[\s\t])@([A-Za-z_\u00C0-\u024F\w\-.]*)$/);
  if (nameMatch) {
    const prefix = nameMatch[1] ?? '';
    const atCol = left.length - prefix.length - 1;
    return {
      kind: 'name',
      prefix,
      atCol,
    };
  }

  return { kind: 'none' };
}
