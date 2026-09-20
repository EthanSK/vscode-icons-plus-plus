# Nx verification — 20 September 2026

- 721 automated tests passed (`npm test`).
- ESLint and formatting checks passed.
- Production webpack build passed (`npm run dist`).
- Native VS Code 1.132.0 test passed on a Mac mini using an isolated profile and synthetic Nx workspace.
- Production JavaScript SHA-256, identical locally and on the Mini: `49f946ff973f2ba07ea382b16af0d295eb5ce9102a0e4b3cab2237887e60a6f3`.

The native test verified simultaneous Angular and Nest icons in the real Explorer, two neutral colliding module files, dark/light themes, source-file creation/moves/deletion, project framework changes, disabling/re-enabling detection, and explicit custom icon precedence/removal. Screenshots were inspected after the checks. The test's own VS Code process/window was closed; the normal user profile was not modified.

The input fixture has Angular and Nest libraries with different service names and identical `src/app.module.ts` names. The ambient declarations only prevent missing-package diagnostics; no Angular/Nest dependency installation is needed to test the icons.

## Dark theme

![Angular and Nest service icons together, with neutral module collisions](images/nx-dark.png)

## Light theme

![The same Angular and Nest libraries in the light theme](images/nx-light.png)

This verifies one open workspace, not per-window isolation, a Marketplace release or installation in the normal VS Code profile. See [detection and API limitations](nx-project-icons.md).
