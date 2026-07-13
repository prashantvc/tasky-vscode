/**
 * Headless unit tests (no VS Code). Run: npm run unit
 */
import * as assert from 'assert';
import { getBirch, itemsInDocumentOrder, todayDateString } from '../../birch';

function run(): void {
  const birch = getBirch();
  assert.ok(birch.Outline, 'Outline export');

  const sample = [
    'Inbox:',
    '\t- Write report @due(2026-07-15) @priority(1)',
    '\t- Ship extension @done',
    '\tNotes about release',
    'Archive:',
    '\t- Old item @done(2026-01-01)',
  ].join('\n');

  const outline = birch.Outline.createTaskPaperOutline(sample);
  const items = itemsInDocumentOrder(outline);
  assert.strictEqual(items[0].getAttribute('data-type'), 'project');
  assert.strictEqual(items[1].getAttribute('data-type'), 'task');
  assert.strictEqual(items[1].getAttribute('data-due'), '2026-07-15');
  assert.strictEqual(items[1].getAttribute('data-priority'), '1');
  assert.strictEqual(items[2].getAttribute('data-done'), '');
  assert.strictEqual(items[3].getAttribute('data-type'), 'note');

  const tasks = outline.evaluateItemPath('//task');
  assert.strictEqual(tasks.length, 3);

  const notDone = outline.evaluateItemPath('//not @done');
  const notDoneBodies = notDone.map((i) => i.bodyString);
  assert.ok(notDoneBodies.some((b) => b.includes('Write report')));
  assert.ok(!notDoneBodies.some((b) => b.includes('Ship extension')));

  // Toggle done with date
  const task = items[1];
  task.setAttribute('data-done', todayDateString());
  assert.ok(task.hasAttribute('data-done'));
  const ser = outline.serialize();
  assert.ok(ser.includes('@done('), 'serialized @done with date: ' + ser);

  task.removeAttribute('data-done');
  assert.ok(!task.hasAttribute('data-done'));

  // Type conversion
  const note = items[3];
  note.setAttribute('data-type', 'task');
  assert.ok(note.bodyString.startsWith('- '), 'note→task: ' + note.bodyString);
  note.setAttribute('data-type', 'project');
  assert.ok(note.bodyString.endsWith(':'), 'task→project: ' + note.bodyString);

  // Round-trip
  const again = birch.Outline.createTaskPaperOutline(outline.serialize());
  assert.strictEqual(
    itemsInDocumentOrder(again).filter((i) => i.getAttribute('data-type') === 'task').length,
    itemsInDocumentOrder(outline).filter((i) => i.getAttribute('data-type') === 'task').length
  );

  outline.destroy();
  again.destroy();

  // Item path parse errors
  const bad = birch.ItemPath.parse('//task[');
  assert.ok(bad.error, 'expected parse error');

  console.log('All unit tests passed.');
}

run();
