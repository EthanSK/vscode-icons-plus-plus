import { expect } from 'chai';
import {
  analyzeNx,
  importFrameworks,
  INxFile,
  scopedIcons,
  summarizeNxFile,
} from '../../src/nx/nxProjectIcons';

const file = (path: string, content = ''): INxFile => ({ path, content });
const fixture = (): INxFile[] => [
  file('/repo/nx.json', '{}'),
  file(
    '/repo/package.json',
    '{"dependencies":{"@angular/core":"*","@nestjs/core":"*"}}',
  ),
  file('/repo/libs/web/project.json', '{}'),
  file(
    '/repo/libs/web/src/a.service.ts',
    "import { Injectable } from '@angular/core';",
  ),
  file('/repo/libs/api/project.json', '{}'),
  file(
    '/repo/libs/api/src/b.service.ts',
    "import { Injectable } from '@nestjs/common';",
  ),
];

describe('Nx project icons', () => {
  it('classifies Angular and Nest libraries independently of root dependencies', () => {
    const result = analyzeNx(fixture());
    expect(result.projects.map(p => p.framework)).to.have.members([
      'angular',
      'nestjs',
    ]);
    expect(scopedIcons(result, new Set(['service.ts']))).to.deep.include({
      key: 'src/a.service.ts',
      framework: 'angular',
      extension: 'service.ts',
    });
  });
  it('inherits the library framework for files without direct imports', () => {
    const result = analyzeNx([
      ...fixture(),
      file('/repo/libs/web/deep/app.guard.ts'),
    ]);
    expect(
      result.files.find(f => f.path.endsWith('app.guard.ts')).framework,
    ).to.equal('angular');
  });
  it('uses project-local executors and package dependencies', () => {
    const result = analyzeNx([
      file('/repo/nx.json'),
      file(
        '/repo/a/project.json',
        '{"targets":{"build":{"executor":"@nx/angular:package"}}}',
      ),
      file('/repo/a/a.service.ts'),
      file(
        '/repo/b/package.json',
        '{"nx":{},"dependencies":{"@nestjs/common":"*"}}',
      ),
      file('/repo/b/b.service.ts'),
    ]);
    expect(result.files.map(f => f.framework)).to.deep.equal([
      'angular',
      'nestjs',
    ]);
  });
  it('recognizes legacy workspace project roots', () => {
    const result = analyzeNx([
      file('/repo/nx.json'),
      file(
        '/repo/workspace.json',
        '{"projects":{"web":"libs/web","api":{"root":"libs/api"},"bad":"../outside"}}',
      ),
      file('/repo/libs/web/app.service.ts', "import '@angular/core'"),
      file('/repo/libs/api/app.service.ts', "import '@nestjs/common'"),
    ]);
    expect(result.projects).to.have.length(2);
    expect(result.files.map(f => f.framework)).to.deep.equal([
      'angular',
      'nestjs',
    ]);
  });
  it('does not inherit through nested or malformed project boundaries', () => {
    const result = analyzeNx([
      ...fixture(),
      file('/repo/libs/web/nested/project.json', 'invalid'),
      file('/repo/libs/web/nested/src/neutral.service.ts'),
    ]);
    expect(
      result.files.find(f => f.path.includes('neutral')).framework,
    ).to.equal(undefined);
  });
  it('keeps mixed and framework-free projects unclassified', () => {
    const result = analyzeNx([
      ...fixture(),
      file('/repo/libs/web/src/mixed.ts', "import '@nestjs/common'"),
      file('/repo/libs/shared/project.json', '{}'),
      file('/repo/libs/shared/shared.service.ts'),
    ]);
    expect(
      result.files
        .filter(f => f.path.includes('/web/') || f.path.includes('/shared/'))
        .every(f => !f.framework),
    ).to.equal(true);
  });
  it('falls back on collisions, including unclassified and non-Nx workspace files', () => {
    const result = analyzeNx([
      ...fixture(),
      file('/repo/libs/api/src/a.service.ts'),
      file('/another/src/b.service.ts'),
    ]);
    expect(
      scopedIcons(result, new Set(['service.ts'])).every(a => !a.framework),
    ).to.equal(true);
  });
  it('allows duplicate names with the same framework and compares keys case-insensitively', () => {
    const result = analyzeNx([
      ...fixture(),
      file('/repo/libs/web/SRC/A.SERVICE.TS'),
      file('/other/src/A.service.ts'),
    ]);
    expect(
      scopedIcons(result, new Set(['service.ts'])).find(
        a => a.key === 'src/a.service.ts',
      ).framework,
    ).to.equal(undefined);
    expect(
      scopedIcons(
        analyzeNx([
          ...fixture(),
          file('/repo/libs/web/other/src/a.service.ts'),
        ]),
        new Set(['service.ts']),
      ).find(a => a.key === 'src/a.service.ts').framework,
    ).to.equal('angular');
  });
  it('does not detect a project from comments, ordinary strings or templates', () => {
    expect([
      ...importFrameworks(
        `// import '@angular/core';\n/* import '@nestjs/common' */\nconst sample = "from '@angular/core'";\nconst template = \`import '@nestjs/core'\`;`,
      ),
    ]).to.deep.equal([]);
    expect([
      ...importFrameworks(
        "import type { X } from '@angular/core'; const x = require('@nestjs/common');",
      ),
    ]).to.have.members(['angular', 'nestjs']);
  });
  it('does not claim Nx support in ordinary workspaces', () => {
    expect(
      analyzeNx(fixture().filter(f => !f.path.endsWith('nx.json'))).active,
    ).to.equal(false);
  });
  it('keeps the same classifications with compact cached source evidence', () => {
    const files = [
      ...fixture(),
      file('/repo/libs/web/unknown/nested/more.service.ts'),
      file('/repo/libs/web/nested/project.json', '{}'),
      file('/repo/libs/web/nested/src/neutral.service.ts'),
    ];
    const compact = files.map(f => summarizeNxFile(f.path, f.content));
    expect(analyzeNx(compact)).to.deep.equal(analyzeNx(files));
    expect(compact.find(f => f.path.endsWith('a.service.ts')).content).to.equal(
      '',
    );
    expect(
      compact.find(f => f.path.endsWith('a.service.ts')).frameworks,
    ).to.deep.equal(['angular']);
  });
});
