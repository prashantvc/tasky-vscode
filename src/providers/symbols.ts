import * as vscode from 'vscode';
import { getDocumentAnalysis } from '../model/documentCache';

export class TaskySymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.DocumentSymbol[] {
    const analysis = getDocumentAnalysis(document);
    const roots: vscode.DocumentSymbol[] = [];
    const stack: { indent: number; symbol: vscode.DocumentSymbol }[] = [];
    const { lines, indents } = analysis;
    const n = lines.length;

    // Precompute fold end (last descendant) in O(n) via nonempty scan
    const nonempty: number[] = [];
    for (let i = 0; i < n; i++) {
      if (lines[i].text.trim() !== '') {
        nonempty.push(i);
      }
    }
    const endLine = new Array(n).fill(0);
    for (let a = 0; a < nonempty.length; a++) {
      const i = nonempty[a];
      const indent = indents[i];
      let end = i;
      for (let b = a + 1; b < nonempty.length; b++) {
        const j = nonempty[b];
        if (indents[j] > indent) {
          end = j;
        } else {
          break;
        }
      }
      endLine[i] = end;
    }

    for (let i = 0; i < n; i++) {
      const info = lines[i];
      if (info.type !== 'project' && info.type !== 'task') {
        continue;
      }
      if (info.text.trim() === '') {
        continue;
      }

      let name = info.bodyWithoutIndent;
      if (info.type === 'project') {
        name = name.replace(/:(?:\s+@\S+)*\s*$/, '').replace(/:$/, '') || name;
      } else {
        name = name.replace(/^-\s*/, '');
      }
      name =
        name
          .replace(
            /(?:\s+@[\w\u00C0-\u024F][\w\-.]*(\((?:\\\(|\\\)|[^()])*\))?)+$/,
            ''
          )
          .trim() || name;

      const range = document.lineAt(i).range;
      const el = endLine[i];
      const fullRange = new vscode.Range(
        i,
        0,
        el,
        document.lineAt(el).text.length
      );

      const kind =
        info.type === 'project'
          ? vscode.SymbolKind.Namespace
          : info.isDone
            ? vscode.SymbolKind.Boolean
            : vscode.SymbolKind.Event;

      const symbol = new vscode.DocumentSymbol(
        name,
        info.isDone ? 'done' : info.type,
        kind,
        fullRange,
        range
      );

      while (stack.length && stack[stack.length - 1].indent >= info.indent) {
        stack.pop();
      }
      if (stack.length === 0) {
        roots.push(symbol);
      } else {
        stack[stack.length - 1].symbol.children.push(symbol);
      }
      stack.push({ indent: info.indent, symbol });
    }

    return roots;
  }
}
