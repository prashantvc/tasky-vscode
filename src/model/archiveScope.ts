/**
 * Detect lines under the TaskPaper Archive: project (indent subtree).
 * Matches archive command semantics: //@text = Archive:
 */

export interface ArchiveLineShape {
  type: string;
  indent: number;
  /** Full body after tabs (may include tags / trailing colon). */
  bodyWithoutIndent: string;
  /** Raw line text — used to treat blank lines as non-structural. */
  text?: string;
}

/** Project title with trailing ":" and tags stripped (e.g. "Archive", "Inbox"). */
export function projectTitleFromBody(bodyWithoutIndent: string): string {
  return bodyWithoutIndent
    .replace(/:(?:\s+@\S+)*\s*$/, '')
    .replace(/:$/, '')
    .trim();
}

function isBlankLine(line: ArchiveLineShape): boolean {
  const raw = line.text ?? line.bodyWithoutIndent;
  return raw.trim() === '';
}

/**
 * For each line index, true if the line is the Archive: project or nested under it.
 * Blank lines keep the current archive state (do not end the section).
 */
export function markLinesUnderArchive(
  lines: ReadonlyArray<ArchiveLineShape>
): boolean[] {
  const under = new Array<boolean>(lines.length).fill(false);
  let archiveIndent: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBlankLine(line)) {
      under[i] = archiveIndent !== null;
      continue;
    }

    if (archiveIndent !== null) {
      if (line.indent > archiveIndent) {
        under[i] = true;
        continue;
      }
      // Left the archive branch (same or shallower indent)
      archiveIndent = null;
    }

    if (
      line.type === 'project' &&
      projectTitleFromBody(line.bodyWithoutIndent) === 'Archive'
    ) {
      archiveIndent = line.indent;
      under[i] = true;
    }
  }

  return under;
}
