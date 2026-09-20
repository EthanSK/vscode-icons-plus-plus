import { expect } from 'chai';
import { NxProjectIconsController } from '../../src/nx/nxProjectIconsController';
import type { Workspace } from '../../src/nx/workspaceTypes';

// The controller only needs these URI fields; no extension host is required.
const uri = (
  path: string,
): {
  path: string;
  scheme: string;
  authority: string;
  toString: () => string;
} => ({
  path,
  scheme: 'file',
  authority: '',
  toString: () => `file://${path}`,
});

describe('Nx source scanning', () => {
  it('handles more than 20000 files and reuses compact cached evidence', async () => {
    const uris = [
      uri('/repo/nx.json'),
      uri('/repo/lib/project.json'),
      ...Array.from({ length: 21000 }, (__, i) =>
        uri(`/repo/lib/src/file${i}.service.ts`),
      ),
    ];
    let reads = 0;
    let disabled = false;
    let framework = 'angular';
    const workspace = {
      findFiles: (pattern: string) =>
        Promise.resolve(pattern === '**/nx.json' ? [uris[0]] : uris),
      getConfiguration: () => ({ get: () => disabled }),
      fs: {
        readFile: () => {
          reads++;
          return Promise.resolve(Buffer.from(`import '@${framework}/core';`));
        },
      },
    } as unknown as Workspace;
    const controller = new NxProjectIconsController(workspace);
    const initial = await controller.scan();
    expect(initial.active).to.equal(true);
    expect(initial.files).to.have.length(21000);
    expect(initial.files.every(f => f.framework === 'angular')).to.equal(true);
    expect((await controller.scan()).files).to.deep.equal(initial.files);
    expect(reads).to.equal(uris.length);
    disabled = true;
    expect((await controller.scan()).active).to.equal(false);
    disabled = false;
    framework = 'nestjs';
    expect(
      (await controller.scan()).files.every(f => f.framework === 'nestjs'),
    ).to.equal(true);
    expect(reads).to.equal(uris.length * 2);
    controller.dispose();
  });
  it('refuses a truncated sample instead of guessing icon collisions', async () => {
    const workspace = {
      findFiles: (pattern: string) =>
        Promise.resolve(
          pattern === '**/nx.json'
            ? [uri('/repo/nx.json')]
            : Array.from({ length: 100001 }, () => uri('/repo/a.ts')),
        ),
      getConfiguration: () => ({ get: () => false }),
      fs: {
        readFile: () => {
          throw new Error('Must not read a truncated sample');
        },
      },
    } as unknown as Workspace;
    const controller = new NxProjectIconsController(workspace);
    expect((await controller.scan()).active).to.equal(false);
    controller.dispose();
  });
});
