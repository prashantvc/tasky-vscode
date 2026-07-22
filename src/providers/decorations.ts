import * as vscode from 'vscode';
import { getDocumentAnalysis, noteDocumentChange } from '../model/documentCache';
import { TaskyDocument } from '../model/TaskyDocument';

/** Per-editor apply fingerprint — decorations are per TextEditor, not per document. */
interface AppliedState {
  version: number;
  /** Filter + config epoch so those changes force re-apply on the same editor. */
  stamp: string;
}

export class TaskyDecorator implements vscode.Disposable {
  private doneDecoration: vscode.TextEditorDecorationType;
  private tagDecoration: vscode.TextEditorDecorationType;
  private projectDecoration: vscode.TextEditorDecorationType;
  private filterHideDecoration: vscode.TextEditorDecorationType;
  private filterMatchDecoration: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];
  private throttle: NodeJS.Timeout | undefined;
  private pendingRefreshDocs = new Set<vscode.TextDocument>();
  private filterRecomputeTimer: NodeJS.Timeout | undefined;

  private filterLines: Set<number> | undefined;
  private filterUri: string | undefined;
  private filterQuery: string | undefined;

  private onFilterChangedEmitter = new vscode.EventEmitter<void>();
  readonly onFilterChanged = this.onFilterChangedEmitter.event;

  /** Fired after a decoration refresh (status bar can subscribe). */
  private onDidRefreshEmitter = new vscode.EventEmitter<vscode.TextEditor>();
  readonly onDidRefresh = this.onDidRefreshEmitter.event;

  lastTaskCount = 0;
  lastDoneCount = 0;

  /**
   * Track setDecorations per editor instance. Global uri+version skips were wrong:
   * reopening a tab or focusing a split reuses the same document version with a new
   * TextEditor that has never received decorations.
   */
  private appliedByEditor = new WeakMap<vscode.TextEditor, AppliedState>();
  /** Bumped on configuration changes so every editor re-applies. */
  private configEpoch = 0;

  constructor() {
    this.doneDecoration = vscode.window.createTextEditorDecorationType({
      opacity: '0.55',
      textDecoration: 'line-through solid',
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    this.tagDecoration = vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('textLink.foreground'),
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    this.projectDecoration = vscode.window.createTextEditorDecorationType({
      fontWeight: 'bold',
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    this.filterHideDecoration = vscode.window.createTextEditorDecorationType({
      opacity: '0.25',
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    this.filterMatchDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
      isWholeLine: true,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    this.disposables.push(
      this.doneDecoration,
      this.tagDecoration,
      this.projectDecoration,
      this.filterHideDecoration,
      this.filterMatchDecoration,
      this.onFilterChangedEmitter,
      this.onDidRefreshEmitter,
      vscode.window.onDidChangeActiveTextEditor((e) => this.refresh(e)),
      // Splits / tab restore: decorate every visible tasky editor, not only the active one
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        for (const ed of editors) {
          this.refresh(ed);
        }
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId !== 'tasky') {
          return;
        }
        // Preview tab reopen: document is open before the editor is active
        for (const ed of vscode.window.visibleTextEditors) {
          if (ed.document === doc) {
            this.refresh(ed);
          }
        }
        if (vscode.window.activeTextEditor?.document === doc) {
          this.refresh(vscode.window.activeTextEditor);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId !== 'tasky') {
          return;
        }
        // Incremental analysis first (cheap for single-line typing)
        noteDocumentChange(e);

        if (
          this.filterQuery &&
          this.filterUri === e.document.uri.toString()
        ) {
          // Project focus: recompute cheaply; item-path: longer delay (birch)
          const delay = this.filterQuery.startsWith('project:') ? 200 : 500;
          this.scheduleFilterRecompute(e.document, delay);
        }
        // Debounce re-decorate for this document (all visible editors / splits)
        this.scheduleRefreshDocument(e.document);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('tasky')) {
          this.configEpoch++;
          this.refreshVisible();
        }
      })
    );

    // Defer initial refresh so activation stays fast
    setTimeout(() => this.refreshVisible(), 0);
  }

  get isFilterActive(): boolean {
    return this.filterLines !== undefined;
  }

  get activeFilterQuery(): string | undefined {
    return this.filterQuery;
  }

  /** Apply decorations to all visible tasky editors. */
  refreshVisible(): void {
    for (const ed of vscode.window.visibleTextEditors) {
      this.refresh(ed);
    }
  }

  setFilter(
    editor: vscode.TextEditor,
    matchLines: number[] | undefined,
    query?: string
  ): void {
    if (matchLines === undefined || matchLines.length === 0) {
      this.clearFilter(editor);
      return;
    }
    this.filterLines = new Set(matchLines);
    this.filterUri = editor.document.uri.toString();
    this.filterQuery = query;
    void vscode.commands.executeCommand('setContext', 'tasky.filterActive', true);
    this.refreshVisible();
    this.onFilterChangedEmitter.fire();
  }

  clearFilter(editor?: vscode.TextEditor): void {
    const hadFilter = this.filterLines !== undefined;
    this.filterLines = undefined;
    this.filterUri = undefined;
    this.filterQuery = undefined;
    void vscode.commands.executeCommand('setContext', 'tasky.filterActive', false);

    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document.languageId === 'tasky') {
        ed.setDecorations(this.filterHideDecoration, []);
        ed.setDecorations(this.filterMatchDecoration, []);
        this.refresh(ed);
      }
    }

    const target = editor ?? vscode.window.activeTextEditor;
    if (
      target &&
      !vscode.window.visibleTextEditors.includes(target)
    ) {
      this.refresh(target);
    }

    if (hadFilter) {
      this.onFilterChangedEmitter.fire();
    }
  }

  private scheduleRefreshDocument(document: vscode.TextDocument): void {
    this.pendingRefreshDocs.add(document);
    if (this.throttle) {
      clearTimeout(this.throttle);
    }
    // Longer debounce while typing — TextMate still highlights live
    this.throttle = setTimeout(() => {
      const docs = [...this.pendingRefreshDocs];
      this.pendingRefreshDocs.clear();
      for (const doc of docs) {
        if (doc.languageId !== 'tasky') {
          continue;
        }
        for (const ed of vscode.window.visibleTextEditors) {
          if (ed.document === doc) {
            this.refresh(ed);
          }
        }
      }
    }, 280);
  }

  private scheduleFilterRecompute(
    document: vscode.TextDocument,
    delay: number
  ): void {
    if (this.filterRecomputeTimer) {
      clearTimeout(this.filterRecomputeTimer);
    }
    this.filterRecomputeTimer = setTimeout(() => {
      this.recomputeFilter(document);
    }, delay);
  }

  private recomputeFilter(document: vscode.TextDocument): void {
    if (!this.filterQuery || this.filterUri !== document.uri.toString()) {
      return;
    }
    const editor =
      vscode.window.visibleTextEditors.find((e) => e.document === document) ??
      (vscode.window.activeTextEditor?.document === document
        ? vscode.window.activeTextEditor
        : undefined);
    if (!editor) {
      return;
    }

    const query = this.filterQuery;

    if (query.startsWith('project:')) {
      const name = query.slice('project:'.length);
      const analysis = getDocumentAnalysis(document);
      let projectLine = -1;
      for (let i = 0; i < analysis.lines.length; i++) {
        const info = analysis.lines[i];
        if (info.type !== 'project') {
          continue;
        }
        const pName = info.bodyWithoutIndent
          .replace(/:(?:\s+@\S+)*\s*$/, '')
          .replace(/:$/, '');
        if (pName === name) {
          projectLine = i;
          break;
        }
      }
      if (projectLine < 0) {
        this.clearFilter(editor);
        return;
      }
      const startIndent = analysis.indents[projectLine];
      const lines: number[] = [projectLine];
      for (let i = projectLine + 1; i < document.lineCount; i++) {
        if (document.lineAt(i).text.trim() === '') {
          continue;
        }
        if (analysis.indents[i] > startIndent) {
          lines.push(i);
        } else {
          break;
        }
      }
      this.filterLines = new Set(lines);
      this.refreshVisible();
      return;
    }

    try {
      const tp = new TaskyDocument(document);
      const results = tp.search(query);
      if (results.length === 0) {
        this.clearFilter(editor);
        return;
      }
      this.filterLines = new Set(results.map((r) => r.line));
      this.refreshVisible();
    } catch {
      /* mid-edit path errors */
    }
  }

  /** Fingerprint of filter + config that must force re-apply when it changes. */
  private applyStamp(uri: string): string {
    const filterPart =
      this.filterLines && this.filterUri === uri
        ? `${this.filterQuery ?? ''}:${this.filterLines.size}`
        : '';
    return `${this.configEpoch}|${filterPart}`;
  }

  refresh(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== 'tasky') {
      return;
    }

    const config = vscode.workspace.getConfiguration('tasky');
    // Defaults tuned for speed: TextMate already colors tags; decorations for done + filter
    const dimDone = config.get<boolean>('dimDoneTasks', true);
    const highlightTags = config.get<boolean>('highlightTags', false);
    const highlightProjects = config.get<boolean>('highlightProjects', true);

    const analysis = getDocumentAnalysis(editor.document);
    this.lastTaskCount = analysis.taskCount;
    this.lastDoneCount = analysis.doneCount;

    const uri = editor.document.uri.toString();
    const stamp = this.applyStamp(uri);
    const prev = this.appliedByEditor.get(editor);
    // Skip only when this same editor instance already has this version + stamp
    if (
      prev &&
      prev.version === analysis.version &&
      prev.stamp === stamp
    ) {
      this.onDidRefreshEmitter.fire(editor);
      return;
    }

    const doneRanges: vscode.Range[] = [];
    const tagRanges: vscode.Range[] = [];
    const projectRanges: vscode.Range[] = [];
    const hideRanges: vscode.Range[] = [];
    const matchRanges: vscode.Range[] = [];

    const filtering =
      this.filterLines !== undefined &&
      this.filterLines.size > 0 &&
      this.filterUri === uri;

    const n = analysis.lines.length;
    for (let i = 0; i < n; i++) {
      const info = analysis.lines[i];

      if (dimDone && info.isDone) {
        doneRanges.push(new vscode.Range(i, 0, i, info.text.length));
      }

      if (
        highlightProjects &&
        info.type === 'project' &&
        info.projectColonCol >= 0
      ) {
        projectRanges.push(
          new vscode.Range(i, info.indent, i, info.projectColonCol)
        );
      }

      if (highlightTags) {
        for (const tag of info.tags) {
          tagRanges.push(new vscode.Range(i, tag.start, i, tag.end));
        }
      }

      if (filtering) {
        const lineRange = new vscode.Range(i, 0, i, info.text.length);
        if (this.filterLines!.has(i)) {
          matchRanges.push(lineRange);
        } else if (info.text.trim() !== '') {
          hideRanges.push(lineRange);
        }
      }
    }

    editor.setDecorations(this.doneDecoration, doneRanges);
    editor.setDecorations(
      this.tagDecoration,
      highlightTags ? tagRanges : []
    );
    editor.setDecorations(
      this.projectDecoration,
      highlightProjects ? projectRanges : []
    );
    editor.setDecorations(this.filterHideDecoration, hideRanges);
    editor.setDecorations(this.filterMatchDecoration, matchRanges);

    this.appliedByEditor.set(editor, {
      version: analysis.version,
      stamp,
    });
    this.onDidRefreshEmitter.fire(editor);
  }

  dispose(): void {
    if (this.throttle) {
      clearTimeout(this.throttle);
    }
    this.pendingRefreshDocs.clear();
    if (this.filterRecomputeTimer) {
      clearTimeout(this.filterRecomputeTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
