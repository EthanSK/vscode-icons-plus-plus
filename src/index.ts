import * as vscode from 'vscode';
import { ExtensionManager } from './app/extensionManager';
import { IconsGenerator } from './iconsManifest';
import { NxProjectIconsController } from './nx/nxProjectIconsController';
import { Debugger } from './common/debugger';
import { constants } from './constants';
import { IVSCodeExtensionContext, SYMBOLS } from './models';
import { CompositionRootService } from './services/compositionRootService';

export async function activate(
  context: IVSCodeExtensionContext,
): Promise<void> {
  const crs = new CompositionRootService(context);

  const extension = crs.get<ExtensionManager>(SYMBOLS.IExtensionManager);
  const generator = crs.get<IconsGenerator>(SYMBOLS.IIconsGenerator);
  const nx = new NxProjectIconsController(vscode.workspace);
  context.subscriptions.push(nx);
  try {
    generator.nxAnalysis = await nx.scan();
    extension.nxProjectIconsEnabled = generator.nxAnalysis.active;
  } catch (error: unknown) {
    console.error('[vscode-icons] Nx detection failed', error);
  }
  await extension.activate();
  nx.watch(async analysis => {
    const wasActive = extension.nxProjectIconsEnabled;
    generator.nxAnalysis = analysis;
    extension.nxProjectIconsEnabled = analysis.active;
    if (wasActive || analysis.active) {
      await extension.refreshNxProjectIcons();
    }
  });

  if (!Debugger.isAttached) {
    console.info(
      `[${constants.extension.name}] v${constants.extension.version} activated!`,
    );
  }
}

// this method is called when your vscode is closed
export function deactivate(): void {
  // no code here at the moment
}
