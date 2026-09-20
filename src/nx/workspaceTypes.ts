import type * as vscode from 'vscode';
export type Workspace = Pick<
  typeof vscode.workspace,
  | 'findFiles'
  | 'fs'
  | 'getConfiguration'
  | 'createFileSystemWatcher'
  | 'onDidChangeWorkspaceFolders'
  | 'onDidChangeConfiguration'
>;
export interface IDisposable {
  dispose(): void;
}
