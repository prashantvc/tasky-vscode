/**
 * Outline cache behavior is tested at the birch layer (version reuse logic
 * needs vscode.TextDocument). Here we verify searchWithCache-compatible
 * mapping: two path evals on the same outline return stable item refs.
 */
import * as assert from 'assert';
import { getBirch, itemsInDocumentOrder } from '../../birch';

function run(): void {
  const birch = getBirch();
  const text = 'Inbox:\n\t- a\n\t- b @done\n';
  const o1 = birch.Outline.createTaskPaperOutline(text);
  const o2 = birch.Outline.createTaskPaperOutline(text);

  const t1 = o1.evaluateItemPath('//task');
  const t1b = o1.evaluateItemPath('//task');
  assert.strictEqual(t1.length, 2);
  assert.strictEqual(t1[0], t1b[0], 'same outline → same item refs');

  const t2 = o2.evaluateItemPath('//task');
  assert.notStrictEqual(t1[0], t2[0], 'different outlines → different refs');

  // DFS order matches line structure
  const items = itemsInDocumentOrder(o1);
  assert.strictEqual(items[0].getAttribute('data-type'), 'project');
  assert.strictEqual(items[1].getAttribute('data-type'), 'task');

  o1.destroy();
  o2.destroy();
  console.log('outlineCache unit tests passed.');
}

run();
