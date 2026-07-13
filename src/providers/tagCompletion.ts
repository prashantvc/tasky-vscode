import * as vscode from 'vscode';
import { collectTags, sortedTagNames } from '../model/tagIndex';
import { detectTagCompletionContext } from '../model/tagContext';

/**
 * Autocomplete @tags and known @tag(values) while typing in Tasky files.
 */
export class TaskyTagCompletionProvider
  implements vscode.CompletionItemProvider
{
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] | undefined {
    if (document.languageId !== 'tasky') {
      return undefined;
    }

    const line = document.lineAt(position.line).text;
    const ctx = detectTagCompletionContext(line, position.character);
    if (ctx.kind === 'none') {
      return undefined;
    }

    const includeCommon = vscode.workspace
      .getConfiguration('tasky')
      .get<boolean>('completion.includeCommonTags', true);

    const tags = collectTags(document, { includeCommon });

    if (ctx.kind === 'name') {
      return this.nameCompletions(position, ctx.prefix, ctx.atCol, tags);
    }

    return this.valueCompletions(
      position,
      ctx.tagName,
      ctx.prefix,
      ctx.valueStartCol,
      ctx.hasClosingParen,
      tags
    );
  }

  private nameCompletions(
    position: vscode.Position,
    prefix: string,
    atCol: number,
    tags: ReturnType<typeof collectTags>
  ): vscode.CompletionItem[] {
    const prefixLower = prefix.toLowerCase();
    const range = new vscode.Range(
      position.line,
      atCol,
      position.line,
      position.character
    );

    const items: vscode.CompletionItem[] = [];
    for (const name of sortedTagNames(tags)) {
      if (prefixLower && !name.toLowerCase().startsWith(prefixLower)) {
        continue;
      }
      const stats = tags.get(name)!;
      const item = new vscode.CompletionItem(
        `@${name}`,
        vscode.CompletionItemKind.Property
      );
      item.filterText = `@${name}`;
      item.sortText = `${stats.count > 0 ? '0' : '1'}_${name}`;
      item.range = range;
      item.insertText = `@${name}`;
      if (stats.count > 0) {
        item.detail =
          stats.count === 1 ? '1 use in document' : `${stats.count} uses in document`;
      } else {
        item.detail = 'common Tasky tag';
      }
      if (stats.values.size > 0) {
        item.documentation = new vscode.MarkdownString(
          `Values: ${Array.from(stats.values).slice(0, 8).join(', ')}`
        );
      }
      // For date-like tags, offer a secondary snippet with empty parens via command? keep simple.
      items.push(item);

      // If tag has values, also offer @name() snippet as extra for due/start
      if (
        (name === 'due' || name === 'start' || name === 'priority') &&
        (!prefixLower || name.startsWith(prefixLower))
      ) {
        const snip = new vscode.CompletionItem(
          `@${name}(…)`,
          vscode.CompletionItemKind.Snippet
        );
        snip.filterText = `@${name}`;
        snip.sortText = `${stats.count > 0 ? '0' : '1'}_${name}_z`;
        snip.range = range;
        snip.insertText = new vscode.SnippetString(`@${name}($0)`);
        snip.detail = `Insert @${name} with value`;
        items.push(snip);
      }
    }
    return items;
  }

  private valueCompletions(
    position: vscode.Position,
    tagName: string,
    prefix: string,
    valueStartCol: number,
    hasClosingParen: boolean,
    tags: ReturnType<typeof collectTags>
  ): vscode.CompletionItem[] {
    const stats = tags.get(tagName);
    const values = stats ? Array.from(stats.values).sort() : [];
    const prefixLower = prefix.toLowerCase();
    const range = new vscode.Range(
      position.line,
      valueStartCol,
      position.line,
      position.character
    );

    const items: vscode.CompletionItem[] = [];

    // Suggest today's date for due/start when no values or as extra
    if (tagName === 'due' || tagName === 'start' || tagName === 'done') {
      const today = todayISO();
      if (!prefixLower || today.startsWith(prefixLower)) {
        const item = new vscode.CompletionItem(
          today,
          vscode.CompletionItemKind.Value
        );
        item.detail = 'today';
        item.sortText = '0_today';
        item.range = range;
        item.insertText = hasClosingParen ? today : `${today})`;
        items.push(item);
      }
    }

    for (const value of values) {
      if (prefixLower && !value.toLowerCase().startsWith(prefixLower)) {
        continue;
      }
      const item = new vscode.CompletionItem(
        value,
        vscode.CompletionItemKind.Value
      );
      item.detail = `@${tagName}`;
      item.sortText = `1_${value}`;
      item.range = range;
      item.insertText = hasClosingParen ? value : `${value})`;
      items.push(item);
    }

    return items;
  }
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
