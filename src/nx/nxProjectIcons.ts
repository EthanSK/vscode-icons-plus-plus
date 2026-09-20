import { posix } from 'path';

export type Framework = 'angular' | 'nestjs';
export interface INxFile {
  path: string;
  content: string;
  frameworks?: Framework[];
}
export interface INxProject {
  root: string;
  framework?: Framework;
}
export interface INxAnalysis {
  active: boolean;
  projects: INxProject[];
  files: Array<{ path: string; framework?: Framework }>;
}

const inside = (file: string, root: string): boolean =>
  file === root || file.startsWith(`${root}/`);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const parse = (content: string): Record<string, unknown> => {
  try {
    return object(JSON.parse(content));
  } catch {
    return {};
  }
};
const single = (values: Set<Framework>): Framework | undefined =>
  values.size === 1 ? [...values][0] : undefined;

// Tokenize strings/comments before looking for module specifiers. Comments,
// template literals and prose strings must not classify a project.
export function importFrameworks(content: string): Set<Framework> {
  if (!/@(?:angular|nestjs)\//.test(content)) {
    return new Set<Framework>();
  }
  const tokens =
    content.match(
      /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\w$]+|[^\s]/g,
    ) || [];
  const clean = tokens.filter(t => !t.startsWith('//') && !t.startsWith('/*'));
  const result = new Set<Framework>();
  for (let i = 0; i < clean.length; i++) {
    const token = clean[i];
    const direct = clean[i - 1] === 'from' || clean[i - 1] === 'import';
    const call =
      clean[i - 1] === '(' && ['import', 'require'].includes(clean[i - 2]);
    if (!direct && !call) {
      continue;
    }
    if (/^['"]@angular\//.test(token)) {
      result.add('angular');
    }
    if (/^['"]@nestjs\//.test(token)) {
      result.add('nestjs');
    }
  }
  return result;
}

/** Keep only framework evidence for source files, rather than entire documents. */
export function summarizeNxFile(path: string, content: string): INxFile {
  return /\.[cm]?[jt]sx?$/i.test(path)
    ? { path, content: '', frameworks: [...importFrameworks(content)] }
    : { path, content };
}

function configFrameworks(config: Record<string, unknown>): Set<Framework> {
  const result = new Set<Framework>();
  const dependencies = {
    ...object(config.dependencies),
    ...object(config.devDependencies),
    ...object(config.peerDependencies),
  };
  if (dependencies['@angular/core']) {
    result.add('angular');
  }
  if (dependencies['@nestjs/core'] || dependencies['@nestjs/common']) {
    result.add('nestjs');
  }
  const targets = object(config.targets || object(config.nx).targets);
  for (const target of Object.values(targets)) {
    const executor = object(target).executor;
    if (typeof executor !== 'string') {
      continue;
    }
    if (
      /^@(nx|nrwl|angular)\/angular:|^@angular-devkit\/build-angular:/.test(
        executor,
      )
    ) {
      result.add('angular');
    }
    if (/^@(nx|nrwl)\/nest:/.test(executor)) {
      result.add('nestjs');
    }
  }
  return result;
}

/** All paths include the workspace identity; nested projects own their files. */
export function analyzeNx(files: INxFile[]): INxAnalysis {
  const nxRoots = files
    .filter(f => posix.basename(f.path) === 'nx.json')
    .map(f => posix.dirname(f.path));
  const projects = new Map<string, Set<Framework>>();
  const register = (root: string, config: Record<string, unknown>): void => {
    const signals = projects.get(root) || new Set<Framework>();
    configFrameworks(config).forEach(f => signals.add(f));
    projects.set(root, signals);
  };
  for (const file of files) {
    if (!nxRoots.some(root => inside(file.path, root))) {
      continue;
    }
    const name = posix.basename(file.path);
    if (name === 'project.json') {
      // An invalid project.json still establishes a boundary: never inherit
      // an outer project's framework through an unreadable nested project.
      register(posix.dirname(file.path), parse(file.content));
    }
    if (name === 'package.json') {
      const config = parse(file.content);
      if (
        Object.hasOwn(config, 'nx') &&
        !nxRoots.includes(posix.dirname(file.path))
      ) {
        register(posix.dirname(file.path), config);
      }
    }
    if (name === 'workspace.json' || name === 'angular.json') {
      const root = posix.dirname(file.path);
      for (const value of Object.values(object(parse(file.content).projects))) {
        const config = object(value);
        const relativeRoot = typeof value === 'string' ? value : config.root;
        if (typeof relativeRoot === 'string') {
          const projectRoot = posix.resolve(root, relativeRoot);
          if (inside(projectRoot, root)) {
            register(projectRoot, config);
          }
        }
      }
    }
  }
  // A project.json project may also have a package manifest without an nx key.
  for (const file of files) {
    const root = posix.dirname(file.path);
    if (posix.basename(file.path) === 'package.json' && projects.has(root)) {
      register(root, parse(file.content));
    }
  }
  const roots = [...projects.keys()].sort((a, b) => b.length - a.length);
  const sources = files.filter(f => /\.[cm]?[jt]sx?$/i.test(f.path));
  const owners = new Map<string, string | undefined>();
  const owner = (path: string): string | undefined => {
    const directory = posix.dirname(path);
    if (owners.has(directory)) {
      return owners.get(directory);
    }
    const root = projects.has(directory)
      ? directory
      : directory === posix.dirname(directory)
        ? undefined
        : owner(directory);
    owners.set(directory, root);
    return root;
  };
  for (const file of sources) {
    const root = owner(file.path);
    if (root) {
      (file.frameworks || [...importFrameworks(file.content)]).forEach(f =>
        projects.get(root).add(f),
      );
    }
  }
  return {
    active: nxRoots.length > 0,
    projects: roots.map(root => ({
      root,
      framework: single(projects.get(root)),
    })),
    files: sources.map(file => ({
      path: file.path,
      framework: owner(file.path)
        ? single(projects.get(owner(file.path)))
        : undefined,
    })),
  };
}

export interface IScopedIcon {
  key: string;
  framework?: Framework;
  extension: string;
}

/** Include non-Nx and unclassified files when resolving collisions. */
export function scopedIcons(
  analysis: INxAnalysis,
  extensions: Set<string>,
): IScopedIcon[] {
  const groups = new Map<
    string,
    { frameworks: Set<Framework | undefined>; extension: string }
  >();
  const suffixes = [...extensions].sort((a, b) => b.length - a.length);
  for (const file of analysis.files) {
    const name = posix.basename(file.path).toLowerCase();
    const extension = suffixes.find(ext => name.endsWith(`.${ext}`));
    if (!extension) {
      continue;
    }
    const key = `${posix.basename(posix.dirname(file.path)).toLowerCase()}/${name}`;
    const group = groups.get(key) || {
      frameworks: new Set<Framework | undefined>(),
      extension,
    };
    group.frameworks.add(file.framework);
    groups.set(key, group);
  }
  return [...groups].map(([key, group]) => ({
    key,
    extension: group.extension,
    framework:
      group.frameworks.size === 1 ? [...group.frameworks][0] : undefined,
  }));
}
