import { expect } from 'chai';
import * as sinon from 'sinon';
import { resolve } from 'path';
import { ConfigManager } from '../../src/configuration/configManager';
import { cloneDeep } from 'lodash';
import { IconsGenerator } from '../../src/iconsManifest';
import { IConfigManager, FileFormat, IFileExtension } from '../../src/models';
import { vsicons } from '../fixtures/vsicons';
import { analyzeNx, INxFile } from '../../src/nx/nxProjectIcons';

const file = (path: string, content = ''): INxFile => ({ path, content });
const snapshot = [
  file('/repo/nx.json'),
  file('/repo/web/project.json'),
  file('/repo/api/project.json'),
  file('/repo/web/src/client.service.ts', "import '@angular/core'"),
  file('/repo/api/src/server.service.ts', "import '@nestjs/common'"),
  file('/repo/web/src/app.module.ts'),
  file('/repo/api/src/app.module.ts'),
  file('/repo/shared/project.json'),
  file('/repo/shared/shared.service.ts'),
];
async function generate(files: INxFile[], custom: IFileExtension[] = []) {
  const configuration = cloneDeep(vsicons);
  configuration.presets.angular = true;
  configuration.presets.nestjs = true;
  const config = {
    vsicons: configuration,
    getCustomIconsDirPath: () => Promise.resolve(''),
  } as unknown as IConfigManager;
  const generator = new IconsGenerator(undefined, config);
  generator.nxAnalysis = analyzeNx(files);
  return (
    await generator.generateIconsManifest(
      { default: {}, supported: custom },
      { default: {}, supported: [] },
    )
  ).vscode;
}

describe('Nx generated icon theme', () => {
  beforeEach(() => {
    sinon
      .stub(ConfigManager, 'rootDir')
      .get(() => resolve(__dirname, '../../../'));
  });
  afterEach(() => {
    sinon.restore();
  });
  it('renders both frameworks without leaking global suffixes', async () => {
    const schema = await generate(snapshot);
    expect(schema.fileNames['src/client.service.ts']).to.equal(
      '_f_ng_service_ts',
    );
    expect(schema.fileNames['src/server.service.ts']).to.equal(
      '_f_nest_service_ts',
    );
    expect(schema.fileExtensions['service.ts']).to.equal(undefined);
    expect(schema.fileNames['src/app.module.ts']).to.equal(
      schema.languageIds.typescript,
    );
    expect(schema.fileNames['shared/shared.service.ts']).to.equal(
      schema.languageIds.typescript,
    );
    expect(schema.light.fileNames['src/client.service.ts']).to.equal(
      '_f_ng_service_ts',
    );
    for (const key of Object.values(schema.fileNames)) {
      expect(schema.iconDefinitions[key], key).not.to.equal(undefined);
    }
  });
  it('updates after file moves and project framework changes without retaining old mappings', async () => {
    const changed = snapshot
      .filter(f => !f.path.endsWith('server.service.ts'))
      .map(f => ({
        ...f,
        content: f.content.replace('@angular/core', '@nestjs/common'),
      }));
    const schema = await generate(changed);
    expect(schema.fileNames['src/server.service.ts']).to.equal(undefined);
    expect(schema.fileNames['src/client.service.ts']).to.equal(
      '_f_nest_service_ts',
    );
  });
  it('preserves explicit custom filename and suffix associations', async () => {
    const schema = await generate(snapshot, [
      {
        icon: 'js',
        extensions: ['client.service.ts'],
        filename: true,
        format: FileFormat.svg,
      },
      { icon: 'json', extensions: ['module.ts'], format: FileFormat.svg },
    ]);
    expect(schema.fileNames['client.service.ts']).to.equal('_f_js');
    expect(schema.fileNames['src/client.service.ts']).to.equal(undefined);
    expect(schema.fileExtensions['module.ts']).to.equal('_f_json');
    expect(schema.fileNames['src/app.module.ts']).to.equal(undefined);
  });
  it('preserves parent-scoped extensions and generated custom filename patterns', async () => {
    const schema = await generate(snapshot, [
      { icon: 'json', extensions: ['src/service.ts'], format: FileFormat.svg },
      {
        icon: 'js',
        extensions: [],
        filenamesGlob: ['app.module'],
        extensionsGlob: ['ts'],
        filename: true,
        format: FileFormat.svg,
      },
    ]);
    expect(schema.fileExtensions['src/service.ts']).to.equal('_f_json');
    expect(schema.fileNames['src/client.service.ts']).to.equal(undefined);
    expect(schema.fileNames['app.module.ts']).to.equal('_f_js');
    expect(schema.fileNames['src/app.module.ts']).to.equal(undefined);
  });
});
