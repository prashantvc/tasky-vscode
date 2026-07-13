import * as assert from 'assert';
import { parseTaskyLine } from '../../model/lineParser';

function run(): void {
  let p = parseTaskyLine('- hello @done');
  assert.strictEqual(p.type, 'task');
  assert.strictEqual(p.isDone, true);
  assert.strictEqual(p.indent, 0);

  p = parseTaskyLine('\t\t- nested');
  assert.strictEqual(p.indent, 2);
  assert.strictEqual(p.type, 'task');

  p = parseTaskyLine('Inbox:');
  assert.strictEqual(p.type, 'project');
  assert.ok(p.projectColonCol >= 0);

  p = parseTaskyLine('Inbox: @search(//task)');
  assert.strictEqual(p.type, 'project');

  p = parseTaskyLine('just a note');
  assert.strictEqual(p.type, 'note');
  assert.strictEqual(p.tags.length, 0);

  p = parseTaskyLine('- x @due(2026-01-01) @priority(1)');
  assert.strictEqual(p.tags.length, 2);
  assert.strictEqual(p.tags[0].name, 'due');
  assert.strictEqual(p.tags[0].value, '2026-01-01');

  // no @ → skip tag scan path
  p = parseTaskyLine('- plain task without tags here');
  assert.strictEqual(p.tags.length, 0);

  console.log('lineParser unit tests passed.');
}
run();
