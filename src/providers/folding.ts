import * as vscode from 'vscode';
import {
  computeFoldingRanges,
  getDocumentAnalysis,
} from '../model/documentCache';

/**
 * Fold by tab indent — O(n) using versioned document analysis.
 */
export class TaskyFoldingProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(
    document: vscode.TextDocument,
    _context: vscode.FoldingContext,
    _token: vscode.CancellationToken
  ): vscode.FoldingRange[] {
    const analysis = getDocumentAnalysis(document);
    return computeFoldingRanges(document, analysis);
  }
}
