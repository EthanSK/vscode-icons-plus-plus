import type { IDisposable, Workspace } from './workspaceTypes';
import {
  analyzeNx,
  INxAnalysis,
  INxFile,
  summarizeNxFile,
} from './nxProjectIcons';

const include =
  '**/{nx.json,project.json,package.json,workspace.json,angular.json,*.[tT][sS],*.[tT][sS][xX],*.[jJ][sS],*.[jJ][sS][xX],*.[mMcC][tT][sS],*.[mMcC][jJ][sS]}';
const exclude = '**/{node_modules,.git,.nx,dist,build,coverage,out}/**';
const maxFiles = 100000;

/** One serialized scan per burst; stale scans never overwrite newer results. */
export class NxProjectIconsController implements IDisposable {
  private timer: ReturnType<typeof setTimeout>;
  private subscriptions: IDisposable[] = [];
  private disposed = false;
  private cache = new Map<string, INxFile>();
  private revision = 0;
  private pending: Promise<void> = Promise.resolve();

  constructor(private workspace: Workspace) {}

  public async scan(): Promise<INxAnalysis> {
    const empty: INxAnalysis = { active: false, projects: [], files: [] };
    if (
      this.workspace
        .getConfiguration('vsicons')
        .get<boolean>('projectDetection.disableDetect', false)
    ) {
      this.cache.clear();
      return empty;
    }
    const roots = await this.workspace.findFiles('**/nx.json', exclude, 1);
    if (!roots.length) {
      this.cache.clear();
      return empty;
    }
    // Do not silently resolve a collision from a truncated workspace sample.
    const uris = await this.workspace.findFiles(include, exclude, maxFiles + 1);
    if (uris.length > maxFiles) {
      console.info(
        '[vscode-icons] Nx detection skipped: workspace exceeds 100000 source/config files.',
      );
      this.cache.clear();
      return empty;
    }
    const files: INxFile[] = [];
    // Bound concurrent reads. URI identities keep multi-root and remote files apart.
    for (let start = 0; start < uris.length; start += 32) {
      const batch = await Promise.all(
        uris.slice(start, start + 32).map(async uri => {
          const key = uri.toString();
          if (this.cache.has(key)) {
            return this.cache.get(key);
          }
          let content = '';
          try {
            const bytes = await this.workspace.fs.readFile(uri);
            content = Buffer.from(bytes).toString('utf8');
          } catch {
            // Retain unreadable names for conservative collision handling.
          }
          const file = summarizeNxFile(
            `/${uri.scheme}/${encodeURIComponent(uri.authority) || '_'}${uri.path}`,
            content,
          );
          this.cache.set(key, file);
          return file;
        }),
      );
      files.push(...batch);
    }
    const live = new Set(uris.map(uri => uri.toString()));
    for (const key of this.cache.keys()) {
      if (!live.has(key)) {
        this.cache.delete(key);
      }
    }
    return analyzeNx(files);
  }

  public watch(changed: (analysis: INxAnalysis) => Promise<void>): void {
    const schedule = (): void => {
      this.revision++;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        const revision = this.revision;
        this.pending = this.pending
          .then(async () => {
            if (this.disposed || revision !== this.revision) {
              return;
            }
            const analysis = await this.scan();
            if (!this.disposed && revision === this.revision) {
              await changed(analysis);
            }
          })
          .catch((error: unknown) =>
            console.error('[vscode-icons] Nx detection failed', error),
          );
      }, 300);
    };
    const fileChanged = (
      uri: Parameters<Workspace['fs']['readFile']>[0],
    ): void => {
      if (
        /\/(node_modules|\.git|\.nx|dist|build|coverage|out)\//.test(uri.path)
      ) {
        return;
      }
      this.cache.delete(uri.toString());
      schedule();
    };
    const watcher = this.workspace.createFileSystemWatcher(include);
    this.subscriptions.push(
      watcher,
      watcher.onDidCreate(fileChanged),
      watcher.onDidDelete(fileChanged),
      watcher.onDidChange(fileChanged),
      this.workspace.onDidChangeWorkspaceFolders(schedule),
      this.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('vsicons.projectDetection.disableDetect')) {
          schedule();
        }
      }),
    );
  }

  public dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.subscriptions.forEach(subscription => subscription.dispose());
  }
}
