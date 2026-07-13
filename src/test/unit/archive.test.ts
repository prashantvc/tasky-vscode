import * as assert from 'assert';
import { getBirch, itemsInDocumentOrder } from '../../birch';

function run(): void {
  const birch = getBirch();
  const sample = [
    'Inbox:',
    '\t- Write report',
    '\t- Ship @done',
    '\t- Nested parent',
    '\t\t- child done @done',
    'Work:',
    '\t- Task @done @due(2020-01-01)',
    'Archive:',
    '\t- Already archived @done',
  ].join('\n');

  const outline = birch.Outline.createTaskPaperOutline(sample);
  const doneItems = birch.Item.getCommonAncestors(
    outline.evaluateItemPath('//@done except //@text = Archive://@done')
  );
  assert.strictEqual(doneItems.length, 3, 'three done outside archive');

  let archive = outline.evaluateItemPath('//@text = Archive:')[0];
  assert.ok(archive);

  for (const each of doneItems) {
    const projects = outline.evaluateItemPath('ancestor::@type=project', each);
    if (projects.length) {
      const labels = projects
        .map((p) => (p.bodyContentString ?? p.bodyString).replace(/:$/, ''))
        .join(' / ');
      each.setAttribute('data-project', labels);
    }
  }
  archive.insertChildrenBefore(doneItems, archive.firstChild);

  const out = outline.serialize();
  assert.ok(out.includes('Archive:'), out);
  assert.ok(out.includes('@project(Inbox)'), 'project tag: ' + out);
  assert.ok(out.includes('@project(Work)'), out);
  // done items no longer under Inbox as top-level tasks
  const again = birch.Outline.createTaskPaperOutline(out);
  const remaining = again.evaluateItemPath(
    '//@done except //@text = Archive://@done'
  );
  assert.strictEqual(remaining.length, 0, 'all done archived');
  outline.destroy();
  again.destroy();
  console.log('Archive unit tests passed.');
}

run();
