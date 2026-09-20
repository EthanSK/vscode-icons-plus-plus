# Releasing VS Code Icons++

The fork is published as `EthanSK.vscode-icons-plus-plus`. Its display name is **VS Code Icons++**. The repository slug uses `plus-plus` because GitHub does not allow `+` in repository names.

## Prepare one tested package

1. Update `package.json` and the root records in `package-lock.json` to the same release version. Add the changes to `CHANGELOG.md`.
2. Run `npm ci`, `npm test` and `npm run lint` with Node.js 22.13 or later.
3. Run `npm run package:vsix`. Inspect the VSIX manifest, production entrypoint, icons and license. Record its SHA-256.
4. Extract that exact VSIX and run the native test on a Mac mini with VS Code installed:

   ```sh
   unzip vscode-icons-plus-plus-X.Y.Z.vsix -d /tmp/icons-plus-plus-release
   NX_ICONS_EXTENSION_PATH=/tmp/icons-plus-plus-release/extension \
   NX_ICONS_VSCODE_EXECUTABLE='/Applications/Visual Studio Code.app/Contents/MacOS/Code' \
   npm run test:nx:native
   ```

   The native harness uses its own profile and test workspace. It checks real rendered Explorer icons, collisions, live changes and customizations. Do not run Extension Development Hosts on the MacBook used for normal work.
5. Restore only generated package fields to their source values (`main: out/src/`, theme path `out/src/vsicons-icon-theme.json`). Keep the tested VSIX. Commit, push and merge the release PR without discarding the Nx implementation commit referenced by the verification document.

## Publish and verify

Use the publisher's Marketplace token via `VSCE_PAT`; never commit or log it.

```sh
npx --no-install vsce publish --packagePath /absolute/path/to/tested.vsix
VSCE_PAT="$VSCE_PAT" npm run verify:marketplace -- --vsix /absolute/path/to/tested.vsix
```

Upload success is not release completion. The verifier requires authenticated validation, the public validated-only Gallery query used by VS Code, and a byte-identical public VSIX download. Wait for `VSCODE_ICONS_PLUS_PLUS_MARKETPLACE_RELEASE_VERIFIED` for the exact version. Do not republish while validation is pending.

Tag the merged source and create a GitHub release with that same VSIX and its checksum. The optional **Publish Extension** workflow performs tests, packaging, publication, verification and release upload when manually dispatched from `master` with the configured `VSCE_PAT` secret. A normal source push or tag does not silently republish an extension.

## Install

After Marketplace verification, use the extension ID without a version suffix:

```sh
code --install-extension EthanSK.vscode-icons-plus-plus --force
```

Select the **VS Code Icons++** file icon theme, then remove `vscode-icons-team.vscode-icons`. Install the fork first so the original uninstall hook sees another compatible installation and preserves shared settings. This fork has no settings-deleting uninstall hook.

Verify the installed version, production bundle, Gallery source, Marketplace UUID, unpinned version and automatic-update setting. Preserve current editors and terminals. If VS Code requires an extension-host restart, verify live work is safe first and distinguish installed files from the running extension.
