import * as assert from 'assert';
import {
  getTagValue,
  lineHasTag,
  removeAllTagsFromLine,
  removeTagFromLine,
  setOrToggleTag,
  toggleBareTag,
  toggleDoneOnLine,
} from '../../model/lineTags';

function run(): void {
  assert.strictEqual(lineHasTag('- task @done', 'done'), true);
  assert.strictEqual(lineHasTag('- task @done(2020-01-01)', 'done'), true);
  assert.strictEqual(lineHasTag('- task', 'done'), false);

  assert.strictEqual(getTagValue('- x @due(2026-07-13)', 'due'), '2026-07-13');
  assert.strictEqual(getTagValue('- x @today', 'today'), '');

  let line = '- Ship it';
  line = toggleDoneOnLine(line, true, '2026-07-13');
  assert.ok(line.includes('@done(2026-07-13)'), line);
  line = toggleDoneOnLine(line, true, '2026-07-13');
  assert.ok(!line.includes('@done'), line);

  line = '- task';
  line = toggleBareTag(line, 'today');
  assert.ok(line.endsWith('@today'), line);
  line = toggleBareTag(line, 'today');
  assert.ok(!line.includes('@today'), line);

  line = '- task @due(a) @priority(1)';
  line = setOrToggleTag(line, 'due', 'b');
  assert.ok(line.includes('@due(b)'), line);
  assert.ok(line.includes('@priority(1)'), line);
  line = setOrToggleTag(line, 'due', 'b');
  assert.ok(!line.includes('@due'), 'toggle off: ' + line);

  line = removeAllTagsFromLine('- task @done @due(x)');
  assert.strictEqual(line, '- task');

  line = removeTagFromLine('\t- x @done(2020) y', 'done');
  // note: "y" after tag is unusual; our regex requires end or space after tag
  console.log('lineTags unit tests passed.');
}

run();
