import * as assert from 'assert';
import { detectTagCompletionContext } from '../../model/tagContext';

function run(): void {
  // --- name context ---
  let ctx = detectTagCompletionContext('- task @', 8);
  assert.strictEqual(ctx.kind, 'name');
  if (ctx.kind === 'name') {
    assert.strictEqual(ctx.prefix, '');
    assert.strictEqual(ctx.atCol, 7);
  }

  ctx = detectTagCompletionContext('- task @du', 10);
  assert.strictEqual(ctx.kind, 'name');
  if (ctx.kind === 'name') {
    assert.strictEqual(ctx.prefix, 'du');
    assert.strictEqual(ctx.atCol, 7);
  }

  ctx = detectTagCompletionContext('@done', 5);
  assert.strictEqual(ctx.kind, 'name');
  if (ctx.kind === 'name') {
    assert.strictEqual(ctx.prefix, 'done');
    assert.strictEqual(ctx.atCol, 0);
  }

  // mid-word should not match (email-like) — no whitespace before @
  ctx = detectTagCompletionContext('hello@wo', 8);
  assert.strictEqual(ctx.kind, 'none', 'email-like should not complete');

  // --- value context ---
  ctx = detectTagCompletionContext('- x @due(', 9);
  assert.strictEqual(ctx.kind, 'value');
  if (ctx.kind === 'value') {
    assert.strictEqual(ctx.tagName, 'due');
    assert.strictEqual(ctx.prefix, '');
    assert.strictEqual(ctx.valueStartCol, 9);
    assert.strictEqual(ctx.hasClosingParen, false);
  }

  ctx = detectTagCompletionContext('- x @due(2026', 13);
  assert.strictEqual(ctx.kind, 'value');
  if (ctx.kind === 'value') {
    assert.strictEqual(ctx.tagName, 'due');
    assert.strictEqual(ctx.prefix, '2026');
  }

  ctx = detectTagCompletionContext('- x @due(2026)', 13);
  // cursor before ): still value context with prefix 2026
  assert.strictEqual(ctx.kind, 'value');
  if (ctx.kind === 'value') {
    assert.strictEqual(ctx.hasClosingParen, true);
  }

  // normal text
  ctx = detectTagCompletionContext('- just a task', 8);
  assert.strictEqual(ctx.kind, 'none');

  // tab indent + @
  ctx = detectTagCompletionContext('\t- task @pri', 12);
  assert.strictEqual(ctx.kind, 'name');
  if (ctx.kind === 'name') {
    assert.strictEqual(ctx.prefix, 'pri');
  }

  console.log('Tag completion unit tests passed.');
}

run();
