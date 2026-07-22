import * as assert from 'assert';
import {
  markLinesUnderArchive,
  projectTitleFromBody,
} from '../../model/archiveScope';
import { parseTaskyLine } from '../../model/lineParser';

function linesFrom(text: string) {
  return text.split('\n').map((t, i) => {
    const p = parseTaskyLine(t, i);
    return {
      type: p.type,
      indent: p.indent,
      bodyWithoutIndent: p.bodyWithoutIndent,
      text: p.text,
      tags: p.tags,
    };
  });
}

/** Local recount mirroring documentCache.recountTags excludeArchived path. */
function recountTagsFromLines(
  lines: ReturnType<typeof linesFrom>,
  excludeArchived: boolean
): Map<string, { name: string; values: Set<string>; count: number }> {
  const skip = excludeArchived ? markLinesUnderArchive(lines) : undefined;
  const tagStats = new Map<
    string,
    { name: string; values: Set<string>; count: number }
  >();
  for (let i = 0; i < lines.length; i++) {
    if (skip && skip[i]) {
      continue;
    }
    for (const tag of lines[i].tags) {
      if (tag.name === 'type' || tag.name === 'id' || tag.name === 'text') {
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

function run(): void {
  assert.strictEqual(projectTitleFromBody('Archive:'), 'Archive');
  assert.strictEqual(projectTitleFromBody('Archive: @search(//task)'), 'Archive');
  assert.strictEqual(projectTitleFromBody('Inbox:'), 'Inbox');

  const sample = [
    'Inbox:',
    '\t- Active task @priority(1) @waiting',
    '\t- Still open @due(2026-01-01)',
    'Archive:',
    '\t- Old item @done @priority(9) @project(Inbox)',
    '\t- Only in archive @waiting',
    '',
    '\t- Nested still archived @done',
    'Work:',
    '\t- After archive @priority(2)',
  ].join('\n');

  const lines = linesFrom(sample);
  const under = markLinesUnderArchive(lines);

  // Inbox + its children
  assert.strictEqual(under[0], false, 'Inbox project');
  assert.strictEqual(under[1], false, 'active task');
  assert.strictEqual(under[2], false, 'open task');
  // Archive section
  assert.strictEqual(under[3], true, 'Archive project');
  assert.strictEqual(under[4], true, 'archived item');
  assert.strictEqual(under[5], true, 'archive-only tag');
  assert.strictEqual(under[6], true, 'blank inside archive');
  assert.strictEqual(under[7], true, 'nested after blank');
  // Sibling after Archive
  assert.strictEqual(under[8], false, 'Work project after Archive');
  assert.strictEqual(under[9], false, 'Work task');

  // Tag recount excluding archive: priority values 1 and 2, not 9
  const stats = recountTagsFromLines(lines, true);
  assert.ok(stats.has('priority'));
  assert.ok(stats.get('priority')!.values.has('1'));
  assert.ok(stats.get('priority')!.values.has('2'));
  assert.ok(!stats.get('priority')!.values.has('9'), 'archived priority excluded');
  assert.ok(stats.has('waiting'), 'active waiting kept');
  assert.strictEqual(stats.get('waiting')!.count, 1, 'only active waiting counted');
  assert.ok(stats.has('due'));
  assert.ok(!stats.has('project'), 'archive-only @project excluded');
  assert.ok(!stats.has('done'), 'archive-only @done excluded');

  // Without exclude: archive tags present
  const all = recountTagsFromLines(lines, false);
  assert.ok(all.get('priority')!.values.has('9'));
  assert.ok(all.has('project'));
  assert.ok(all.has('done'));

  // Nested Archive under another project still excluded for its children
  const nested = linesFrom(
    ['Root:', '\tArchive:', '\t\t- buried @done @secret', '\t- sibling @alive'].join(
      '\n'
    )
  );
  const nestedUnder = markLinesUnderArchive(nested);
  assert.strictEqual(nestedUnder[0], false);
  assert.strictEqual(nestedUnder[1], true);
  assert.strictEqual(nestedUnder[2], true);
  assert.strictEqual(nestedUnder[3], false, 'sibling at Archive indent exits');

  console.log('archiveScope unit tests passed.');
}

run();
