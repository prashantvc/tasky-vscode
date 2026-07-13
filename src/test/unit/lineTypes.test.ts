import * as assert from 'assert';
import { toNote, toProject, toTask } from '../../model/lineTypes';

function run(): void {
  // note → task
  assert.strictEqual(toTask('Hello'), '- Hello');
  assert.strictEqual(toTask('\tHello @due(1)'), '\t- Hello @due(1)');

  // project → task
  assert.strictEqual(toTask('Inbox:'), '- Inbox');
  assert.strictEqual(toTask('Inbox: @tag'), '- Inbox @tag');
  assert.strictEqual(toTask('- already'), '- already');

  // task → project
  assert.strictEqual(toProject('- Inbox'), 'Inbox:');
  assert.strictEqual(toProject('- Ship @done'), 'Ship: @done');
  assert.strictEqual(toProject('Note'), 'Note:');
  assert.strictEqual(toProject('Already:'), 'Already:');

  // → note
  assert.strictEqual(toNote('- Hello'), 'Hello');
  assert.strictEqual(toNote('Proj:'), 'Proj');
  assert.strictEqual(toNote('- X @due(a)'), 'X @due(a)');
  assert.strictEqual(toNote('\t- nested'), '\tnested');

  // empty preserved
  assert.strictEqual(toTask(''), '');
  assert.strictEqual(toProject('\t'), '\t');

  console.log('lineTypes unit tests passed.');
}

run();
