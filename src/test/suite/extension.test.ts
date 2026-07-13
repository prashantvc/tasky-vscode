import * as assert from 'assert';
import { getBirch } from '../../birch';

suite('Tasky Extension', () => {
  test('birch-outline loads', () => {
    const birch = getBirch();
    assert.ok(birch.Outline.createTaskPaperOutline);
  });

  test('parses sample Tasky', () => {
    const outline = getBirch().Outline.createTaskPaperOutline(
      'Project:\n\t- task @done\n'
    );
    const tasks = outline.evaluateItemPath('//task');
    assert.strictEqual(tasks.length, 1);
    outline.destroy();
  });
});
