import { IFileExtension, IIconSchema } from '../models';
import { INxAnalysis, scopedIcons } from './nxProjectIcons';

/** Framework schemas use the same stock/custom icon paths as normal presets. */
export function applyNxIcons(
  schema: IIconSchema,
  analysis: INxAnalysis,
  angular: IIconSchema,
  nestjs: IIconSchema,
  customFiles: IFileExtension[] = [],
): void {
  const isFramework = (icon: string): boolean => /^_f_(ng|nest)_/.test(icon);
  const extensions = new Set(
    [
      ...Object.entries(angular.fileExtensions),
      ...Object.entries(nestjs.fileExtensions),
    ]
      .filter(([, icon]) => isFramework(icon))
      .map(([extension]) => extension),
  );
  const patterns = (file: IFileExtension): string[] => [
    ...file.extensions,
    ...(file.filenamesGlob || []).flatMap(name =>
      (file.extensionsGlob || []).map(extension => `${name}.${extension}`),
    ),
  ];
  const explicitNames = new Set(
    customFiles
      .filter(f => f.filename)
      .flatMap(patterns)
      .map(name => name.toLowerCase()),
  );
  const explicitExtensions = new Set(
    customFiles
      .filter(f => !f.filename)
      .flatMap(patterns)
      .map(name => name.replace(/^\./, '').toLowerCase()),
  );
  for (const association of scopedIcons(analysis, extensions)) {
    const filename = association.key.slice(association.key.indexOf('/') + 1);
    if (
      explicitNames.has(filename) ||
      explicitNames.has(association.key) ||
      [...explicitExtensions].some(ext => {
        const slash = ext.indexOf('/');
        const parent = slash < 0 ? '' : ext.slice(0, slash + 1);
        const suffix = slash < 0 ? ext : ext.slice(slash + 1);
        return (
          (!parent || association.key.startsWith(parent)) &&
          filename.endsWith(`.${suffix}`)
        );
      })
    ) {
      continue;
    }
    const source =
      association.framework === 'angular'
        ? angular
        : association.framework === 'nestjs'
          ? nestjs
          : schema;
    const genericExtension = association.extension.split('.').pop();
    const language =
      genericExtension === 'ts'
        ? 'typescript'
        : genericExtension === 'js'
          ? 'javascript'
          : genericExtension;
    const icon =
      source.fileExtensions[association.extension] ||
      schema.fileExtensions[genericExtension] ||
      schema.languageIds[language] ||
      schema.file;
    const lightIcon =
      source.light?.fileExtensions?.[association.extension] ||
      source.fileExtensions[association.extension] ||
      schema.light?.fileExtensions?.[genericExtension] ||
      schema.light?.languageIds?.[language] ||
      icon;
    if (!icon) {
      continue;
    }
    // Copy only definitions needed by actual files. Never install global
    // framework suffix associations: they leak into unclassified projects.
    for (const key of [icon, lightIcon] as Array<
      keyof IIconSchema['iconDefinitions']
    >) {
      if (source.iconDefinitions[key]) {
        schema.iconDefinitions[key] = source.iconDefinitions[key];
      }
    }
    schema.fileNames[association.key] = icon;
    schema.light.fileNames[association.key] = lightIcon;
  }
}
