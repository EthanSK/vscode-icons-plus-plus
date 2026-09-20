/* global setTimeout */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vscode = require('vscode');
const root = require('node:process').env.NX_ICONS_TEST_ROOT;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
exports.run = async () => {
  const extension = vscode.extensions.getExtension(
    'EthanSK.vscode-icons-plus-plus',
  );
  assert.ok(extension, 'packaged extension loaded');
  assert.equal(extension.packageJSON.displayName, 'VS Code Icons++');
  assert.equal(extension.packageJSON.publisher, 'EthanSK');
  assert.equal(
    extension.packageJSON.contributes.iconThemes[0].label,
    'VS Code Icons++',
  );
  assert.ok(
    !extension.packageJSON.scripts['vscode:uninstall'],
    'uninstall preserves shared settings',
  );
  await extension.activate();
  const manifestPath = path.join(
    extension.extensionPath,
    extension.packageJSON.contributes.iconThemes[0].path,
  );
  let last = 0;
  fs.writeFileSync(
    path.join(root, 'ready.json'),
    JSON.stringify({ manifestPath, version: vscode.version }),
  );
  for (;;) {
    await pause(100);
    let request;
    try {
      request = JSON.parse(
        fs.readFileSync(path.join(root, 'request.json'), 'utf8'),
      );
    } catch {
      continue;
    }
    if (request.id === last) {
      continue;
    }
    last = request.id;
    try {
      if (request.action === 'open') {
        await vscode.window.showTextDocument(
          vscode.Uri.file(path.join(root, 'workspace', request.file)),
          { preview: false },
        );
      } else if (request.action === 'theme') {
        await vscode.workspace
          .getConfiguration()
          .update(
            'workbench.colorTheme',
            request.theme,
            vscode.ConfigurationTarget.Global,
          );
      } else if (request.action === 'disable') {
        await vscode.workspace
          .getConfiguration()
          .update(
            'vsicons.projectDetection.disableDetect',
            request.value,
            vscode.ConfigurationTarget.Workspace,
          );
      } else if (request.action === 'custom') {
        await vscode.workspace
          .getConfiguration()
          .update(
            'vsicons.associations.files',
            request.files,
            vscode.ConfigurationTarget.Workspace,
          );
        await vscode.commands.executeCommand(
          'vscode-icons-plus-plus.regenerateIcons',
        );
      } else if (request.action === 'explorer') {
        await vscode.commands.executeCommand('workbench.view.explorer');
      } else if (request.action === 'regenerate') {
        await vscode.commands.executeCommand(
          'vscode-icons-plus-plus.regenerateIcons',
        );
      } else if (request.action === 'stop') {
        return;
      }
      fs.writeFileSync(
        path.join(root, 'result.json'),
        JSON.stringify({ id: last, ok: true }),
      );
    } catch (error) {
      fs.writeFileSync(
        path.join(root, 'result.json'),
        JSON.stringify({ id: last, ok: false, error: String(error) }),
      );
    }
  }
};
