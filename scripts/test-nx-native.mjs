/* global WebSocket, fetch, setTimeout, console */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

// A disposable profile still consumes the MacBook's GUI resources.
if (process.platform === 'darwin') {
  const hardware = JSON.parse(
    execFileSync('/usr/sbin/system_profiler', ['SPHardwareDataType', '-json'], {
      encoding: 'utf8',
    }),
  );
  assert.equal(
    hardware.SPHardwareDataType?.[0]?.machine_name,
    'Mac mini',
    'Run native tests on the Mini',
  );
}
const extensionRoot = fileURLToPath(new URL('../', import.meta.url));
const executable = process.env.NX_ICONS_VSCODE_EXECUTABLE;
assert.ok(
  executable && fs.existsSync(executable),
  'Set NX_ICONS_VSCODE_EXECUTABLE',
);
const root = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'nx-icons-native-')),
);
const workspace = path.join(root, 'workspace');
const write = (relative, content) => {
  const target = path.join(workspace, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
write('nx.json', '{}');
write(
  'frameworks.d.ts',
  "declare module '@angular/core';\ndeclare module '@nestjs/common';\n",
);
write(
  'tsconfig.json',
  JSON.stringify({
    compilerOptions: { experimentalDecorators: true, noEmit: true },
    include: ['**/*.ts'],
  }),
);
fs.mkdirSync(path.join(root, 'profile', 'User'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'profile', 'User', 'settings.json'),
  JSON.stringify({ 'update.mode': 'none', 'extensions.autoUpdate': false }),
);
write(
  'package.json',
  JSON.stringify({
    dependencies: { '@angular/core': '*', '@nestjs/core': '*' },
  }),
);
write('libs/angular/project.json', '{}');
write('libs/nest/project.json', '{}');
write(
  'libs/angular/src/client.service.ts',
  "import { Injectable } from '@angular/core';\n\n@Injectable()\nexport class ClientService {}\n",
);
write(
  'libs/nest/src/server.service.ts',
  "import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class ServerService {}\n",
);
write('libs/angular/src/app.module.ts', 'export class AppModule {}\n');
write('libs/nest/src/app.module.ts', 'export class AppModule {}\n');
write(
  '.vscode/settings.json',
  JSON.stringify({
    'workbench.iconTheme': 'vscode-icons',
    'workbench.startupEditor': 'none',
    'vsicons.dontShowNewVersionMessage': true,
    'vsicons.dontShowConfigManuallyChangedMessage': true,
    'explorer.openEditors.visible': 10,
    'explorer.compactFolders': false,
    'workbench.editor.enablePreview': false,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'window.zoomLevel': 1,
    'security.workspace.trust.enabled': false,
  }),
);
const server = net.createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const log = fs.openSync(path.join(root, 'host.log'), 'w');
const child = spawn(
  executable,
  [
    workspace,
    `--user-data-dir=${path.join(root, 'profile')}`,
    `--extensions-dir=${path.join(root, 'extensions')}`,
    `--extensionDevelopmentPath=${extensionRoot}`,
    `--extensionTestsPath=${path.join(extensionRoot, 'scripts/nx-native-driver.cjs')}`,
    `--remote-debugging-port=${port}`,
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-telemetry',
  ],
  {
    env: { ...process.env, NX_ICONS_TEST_ROOT: root },
    stdio: ['ignore', log, log],
  },
);
console.info(JSON.stringify({ evidence: root, pid: child.pid }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, accept, message, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `VS Code exited: ${child.exitCode}; see ${root}/host.log`,
      );
    }
    try {
      last = await read();
      if (accept(last)) {
        return last;
      }
    } catch (error) {
      last = String(error);
    }
    await pause(100);
  }
  throw new Error(`${message}: ${JSON.stringify(last)}`);
}
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
let requestId = 0;
async function request(action, args = {}) {
  const id = ++requestId;
  fs.writeFileSync(
    path.join(root, 'request.json'),
    JSON.stringify({ id, action, ...args }),
  );
  const result = await until(
    () => json('result.json'),
    result => result.id === id,
    action,
  );
  assert.ok(result.ok, result.error);
}
let socket;
try {
  const ready = await until(
    () => json('ready.json'),
    value => value.manifestPath,
    'extension activation',
  );
  const manifest = () =>
    JSON.parse(fs.readFileSync(ready.manifestPath, 'utf8'));
  await until(
    manifest,
    m =>
      m.fileNames['src/client.service.ts'] === '_f_ng_service_ts' &&
      m.fileNames['src/server.service.ts'] === '_f_nest_service_ts',
    'simultaneous frameworks',
  );
  assert.equal(
    manifest().fileNames['src/app.module.ts'],
    manifest().languageIds.typescript,
    'neutral collision',
  );
  for (const file of [
    'libs/angular/src/client.service.ts',
    'libs/nest/src/server.service.ts',
    'libs/angular/src/app.module.ts',
    'libs/nest/src/app.module.ts',
  ]) {
    await request('open', { file });
  }
  await request('explorer');
  const targets = await until(
    async () => (await fetch(`http://127.0.0.1:${port}/json/list`)).json(),
    t => t.some(x => x.type === 'page'),
    'debug target',
  );
  socket = new WebSocket(
    targets.find(t => t.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const callback = pending.get(message.id);
    if (callback) {
      pending.delete(message.id);
      if (message.error) {
        callback.reject(message.error);
      } else {
        callback.resolve(message.result);
      }
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async expression =>
    (await send('Runtime.evaluate', { expression, returnByValue: true })).result
      .value;
  fs.writeFileSync(
    path.join(root, 'initial.png'),
    Buffer.from(
      (await send('Page.captureScreenshot', { format: 'png' })).data,
      'base64',
    ),
  );
  fs.writeFileSync(
    path.join(root, 'labels.json'),
    JSON.stringify(
      await evaluate(
        `[...document.querySelectorAll('.monaco-icon-label')].map(e=>({text:e.textContent,classes:e.className,parent:e.parentElement.className,icon:getComputedStyle(e,'::before').backgroundImage}))`,
      ),
      null,
      2,
    ),
  );
  const icons = () =>
    evaluate(
      `[...document.querySelectorAll('.explorer-item.file-icon')].map(e=>({text:e.textContent,icon:getComputedStyle(e,'::before').backgroundImage}))`,
    );
  const rows = await until(
    icons,
    values =>
      values.some(
        v =>
          v.text.includes('client.service.ts') &&
          v.icon.includes('ng_service_ts'),
      ) &&
      values.some(
        v =>
          v.text.includes('server.service.ts') &&
          v.icon.includes('nest_service_ts'),
      ),
    'rendered Angular and Nest icons',
  );
  assert.equal(
    rows.filter(row => row.text.includes('app.module.ts')).length,
    2,
  );
  assert.ok(
    rows
      .filter(row => row.text.includes('app.module.ts'))
      .every(row => row.icon.includes('typescript')),
    'rendered neutral collision',
  );
  const capture = async name => {
    await pause(400);
    const result = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(
      path.join(root, `${name}.png`),
      Buffer.from(result.data, 'base64'),
    );
    fs.writeFileSync(
      path.join(root, `${name}.json`),
      JSON.stringify(await icons(), null, 2),
    );
  };
  await capture('dark');
  await request('theme', { theme: 'Default Light Modern' });
  await capture('light');
  write('libs/angular/src/new.guard.ts', 'export class NewGuard {}\n');
  await until(
    manifest,
    m => m.fileNames['src/new.guard.ts'] === '_f_ng_guard_ts',
    'new file watcher',
  );
  fs.renameSync(
    path.join(workspace, 'libs/angular/src/new.guard.ts'),
    path.join(workspace, 'libs/nest/src/new.guard.ts'),
  );
  await until(
    manifest,
    m => m.fileNames['src/new.guard.ts'] === '_f_nest_guard_ts',
    'move between projects',
  );
  write(
    'libs/angular/src/client.service.ts',
    "import { Injectable } from '@nestjs/common';\nexport class ClientService {}\n",
  );
  await until(
    manifest,
    m => m.fileNames['src/client.service.ts'] === '_f_nest_service_ts',
    'framework change',
  );
  fs.unlinkSync(path.join(workspace, 'libs/nest/src/new.guard.ts'));
  await until(
    manifest,
    m => !m.fileNames['src/new.guard.ts'],
    'delete watcher',
  );
  await request('disable', { value: true });
  await until(
    manifest,
    m => !m.fileNames['src/client.service.ts'],
    'disable detection clears generated mappings',
  );
  await request('disable', { value: false });
  await until(
    manifest,
    m => m.fileNames['src/client.service.ts'] === '_f_nest_service_ts',
    're-enable detection',
  );
  await request('custom', {
    files: [{ icon: 'json', extensions: ['src/service.ts'], format: 'svg' }],
  });
  await until(
    manifest,
    m =>
      m.fileExtensions['src/service.ts'] === '_f_json' &&
      !m.fileNames['src/client.service.ts'],
    'custom scoped extension precedence',
  );
  await until(
    icons,
    rows =>
      rows.some(
        row =>
          row.text === 'client.service.ts' &&
          row.icon.includes('file_type_json.svg'),
      ),
    'rendered custom icon',
  );
  await request('custom', { files: [] });
  await until(
    manifest,
    m => m.fileNames['src/client.service.ts'] === '_f_nest_service_ts',
    'customization removed',
  );
  const report = {
    status: 'passed',
    vscode: ready.version,
    checks: [
      'simultaneous Angular/Nest rendered icons',
      'neutral collisions',
      'dark/light screenshots',
      'file create/move/delete',
      'project framework change',
      'disable/re-enable',
      'custom icon precedence and removal',
    ],
    evidence: root,
  };
  fs.writeFileSync(
    path.join(root, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  console.info('NX_ICONS_NATIVE_VERIFIED', JSON.stringify(report));
} finally {
  socket?.close();
  child.kill('SIGTERM');
  fs.closeSync(log);
}
