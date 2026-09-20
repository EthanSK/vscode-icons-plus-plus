# Nx project icons

When project detection is enabled and the workspace contains `nx.json`, this fork selects Angular and Nest icons separately for each Nx project. It bypasses the original prompt to pick one framework for the whole workspace. No Nx command, dependency installation, build, or workspace code is executed.

Projects come from `project.json`, package manifests with an `nx` field, and legacy `workspace.json` / `angular.json` project entries. The deepest containing project owns each source file. Framework evidence comes from that project's own Angular/Nest imports, package dependencies and framework-specific executors. The root package's shared dependencies do not select one framework for every library. Plain Node/Webpack executors and arbitrary project tags do not imply Nest or Angular. Mixed projects and projects without evidence stay neutral.

For example, `libs/web/src/client.service.ts` gets the Angular service icon and `libs/api/src/server.service.ts` gets the Nest service icon. Files without direct framework imports inherit their containing project's classification. New, changed, moved and deleted source/configuration files trigger an update. Reads are cached, read concurrency is bounded, and changes are coalesced into serialized scans. Explicit file-icon customizations retain precedence. The existing `vsicons.projectDetection.disableDetect` setting disables Nx detection and removes the generated associations.

## VS Code limitations

VS Code icon themes can match a filename plus **one immediate parent folder**, not a complete project path. This is a [documented icon-theme API constraint](https://code.visualstudio.com/api/extension-guides/file-icon-theme#file-association).

For example, `libs/web/src/app.module.ts` and `libs/api/src/app.module.ts` both match `src/app.module.ts`. If their frameworks differ, both get the neutral TypeScript icon. Collisions with unclassified files and files in other open workspace roots are also neutral. Matching is case-insensitive. This fork does not change TypeScript language IDs or modify VS Code to work around that limit.

Scope and remaining boundaries:

- Detection uses saved files in the current VS Code workspace, including multi-root workspaces. It does not parse unsaved editors or import aliases/re-export dependency graphs.
- Projects discovered only through executable Nx plugins, without supported project metadata, are not inferred by running Nx.
- `node_modules`, `.git`, `.nx`, `dist`, `build`, `coverage` and `out` are excluded. Workspaces exceeding 20,000 source/config files use upstream detection instead, with a console message. Excluded and unopened files cannot participate in collision detection.
- The browser version retains upstream's static icon theme. Nx detection runs in the desktop extension host and reads source files through the VS Code filesystem API.
- Upstream writes one shared theme file per extension installation. Independently opened VS Code windows can still overwrite that shared theme. This change supports mixed projects in one workspace; it does not provide isolated themes per window.
- The fork retains upstream's extension identity for this feature PR. Test it in an isolated profile; this branch is not a separately published replacement for the installed Marketplace extension.

## Verification

```sh
npm ci
npm test
npm run lint
npm run dist
```

The production build rewrites the entrypoint, uninstall script and icon-theme path in `package.json`. Restore those three generated paths to their checked-in values before running upstream's unit tests again; they test the development manifest.

The native regression uses a disposable workspace/profile, the real production bundle, VS Code's actual Explorer CSS, and dark/light screenshots. On macOS it refuses to launch on anything except a Mac mini. It never touches the normal VS Code profile. Use Node 22 or newer for this test runner.

```sh
NX_ICONS_VSCODE_EXECUTABLE="/Applications/Visual Studio Code.app/Contents/MacOS/Code" npm run test:nx:native
```

It checks simultaneous Angular/Nest icons, neutral collisions, create/move/delete updates, a project changing framework, and disabling/re-enabling detection. It prints the temporary evidence directory and `NX_ICONS_NATIVE_VERIFIED` only after those checks pass. The test process closes only its own VS Code instance.
