/* global console, fetch, URL, AbortSignal, setTimeout */
/* eslint-disable no-bitwise -- Marketplace exposes a bitmask API. */
// Adapted from EthanSK/better-git-vscode, under its MIT license.

import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const packageManifest = JSON.parse(
  await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
);

const INCLUDE_VERSIONS = 1;
const INCLUDE_VERSION_PROPERTIES = 16;
const EXCLUDE_NON_VALIDATED = 32;
const INCLUDE_LATEST_VERSION_ONLY = 512;
const PUBLISHER_QUERY_FLAGS = INCLUDE_VERSIONS | INCLUDE_VERSION_PROPERTIES;
const PUBLIC_QUERY_FLAGS =
  INCLUDE_VERSIONS |
  INCLUDE_VERSION_PROPERTIES |
  EXCLUDE_NON_VALIDATED |
  INCLUDE_LATEST_VERSION_ONLY;
const VALIDATED_VERSION_FLAG = 1;
const GALLERY_BASE_URL = 'https://marketplace.visualstudio.com';
const SUCCESS_MARKER = 'VSCODE_ICONS_PLUS_PLUS_MARKETPLACE_RELEASE_VERIFIED';

const usage = `Usage:
  VSCE_PAT="$VSCE_PAT" node scripts/verify-marketplace-release.mjs \\
    --vsix /absolute/path/to/vscode-icons-plus-plus-X.Y.Z.vsix [options]

Options:
  --version <X.Y.Z>          Expected version (default: package.json version)
  --vsix <absolute-path>     Exact VSIX passed to vsce publish (required)
  --timeout-seconds <n>      Maximum validation wait (default: 1200)
  --interval-seconds <n>     Poll interval (default: 15)
  --help                     Show this help
`;

const failUsage = message => {
  console.error(`${message}\n\n${usage}`);
  process.exit(2);
};

const parseSeconds = (value, option) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    failUsage(`${option} must be a non-negative number.`);
  }
  return parsed;
};

const parseArguments = argv => {
  const options = {
    version: packageManifest.version,
    timeoutSeconds: 1200,
    intervalSeconds: 15,
    vsixPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      console.info(usage);
      process.exit(0);
    }

    const value = argv[index + 1];
    if (value === undefined) {
      failUsage(`${argument} requires a value.`);
    }

    switch (argument) {
      case '--version':
        options.version = value;
        break;
      case '--vsix':
        options.vsixPath = path.resolve(value);
        break;
      case '--timeout-seconds':
        options.timeoutSeconds = parseSeconds(value, argument);
        break;
      case '--interval-seconds':
        options.intervalSeconds = parseSeconds(value, argument);
        break;
      default:
        failUsage(`Unknown option: ${argument}`);
    }
    index += 1;
  }

  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(options.version)) {
    failUsage(`Invalid version: ${options.version}`);
  }
  if (!options.vsixPath) {
    failUsage(
      '--vsix is required so the downloaded Marketplace package can be compared to the upload.',
    );
  }
  return options;
};

const options = parseArguments(process.argv.slice(2));
const publisherPat = process.env.VSCE_PAT;
if (!publisherPat) {
  failUsage(
    'VSCE_PAT is required for the authenticated publisher validation check.',
  );
}

const publisher = packageManifest.publisher;
const extensionName = packageManifest.name;
const extensionIdentity = `${publisher}.${extensionName}`;
const expectedVersion = options.version;
const expectedIdentityLower = extensionIdentity.toLowerCase();

const delay = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));
const sha256 = contents => createHash('sha256').update(contents).digest('hex');
const isValidated = flags => {
  if (typeof flags === 'number') {
    return (flags & VALIDATED_VERSION_FLAG) === VALIDATED_VERSION_FLAG;
  }
  return (
    typeof flags === 'string' &&
    flags.toLowerCase().split(/[, ]+/).includes('validated')
  );
};

const compareVersions = (left, right) => {
  const parse = version =>
    version
      .split('-', 1)[0]
      .split('.')
      .map(value => Number(value));
  const leftParts = parse(left);
  const rightParts = parse(right);
  if ([...leftParts, ...rightParts].some(Number.isNaN)) {
    return 0;
  }
  for (
    let index = 0;
    index < Math.max(leftParts.length, rightParts.length);
    index += 1
  ) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }
  return 0;
};

const requestJson = async (url, requestOptions, label) => {
  const response = await fetch(url, {
    ...requestOptions,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500).replace(/\s+/g, ' ');
    const error = new Error(
      `${label} returned HTTP ${response.status}: ${detail}`,
    );
    error.nonRetryable =
      response.status === 400 ||
      response.status === 401 ||
      response.status === 403;
    throw error;
  }
  return response.json();
};

const queryPublisherVersion = async () => {
  const url = new URL(
    `/_apis/gallery/publishers/${encodeURIComponent(publisher)}/extensions/${encodeURIComponent(extensionName)}`,
    GALLERY_BASE_URL,
  );
  url.searchParams.set('version', expectedVersion);
  url.searchParams.set('flags', String(PUBLISHER_QUERY_FLAGS));
  url.searchParams.set('api-version', '7.2-preview.2');
  // Use an empty Basic username for PAT authentication. Gallery has previously
  // rejected username-bearing credentials despite the same token remaining valid.
  const authorization = Buffer.from(`:${publisherPat}`, 'utf8').toString(
    'base64',
  );
  const extension = await requestJson(
    url,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${authorization}`,
        'Cache-Control': 'no-cache',
      },
    },
    'Authenticated publisher query',
  );
  return (extension.versions ?? []).find(
    version => version.version === expectedVersion,
  );
};

const queryValidatedPublicVersion = async () => {
  const url = new URL('/_apis/public/gallery/extensionquery', GALLERY_BASE_URL);
  url.searchParams.set('api-version', '7.2-preview.1');
  url.searchParams.set('cacheBust', `${Date.now()}-${Math.random()}`);
  const result = await requestJson(
    url,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json;api-version=7.2-preview.1;excludeUrls=true',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: [
          {
            pageNumber: 1,
            pageSize: 1,
            criteria: [{ filterType: 7, value: extensionIdentity }],
          },
        ],
        assetTypes: [],
        flags: PUBLIC_QUERY_FLAGS,
      }),
    },
    'Public validated-only Gallery query',
  );
  const extension = (result.results?.[0]?.extensions ?? []).find(candidate => {
    const identity =
      `${candidate.publisher?.publisherName}.${candidate.extensionName}`.toLowerCase();
    return identity === expectedIdentityLower;
  });
  return extension?.versions?.[0];
};

const waitForMarketplaceValidation = async () => {
  const deadline = Date.now() + options.timeoutSeconds * 1000;
  let attempt = 0;
  let lastState;

  while (true) {
    attempt += 1;
    try {
      const [publisherVersion, publicVersion] = await Promise.all([
        queryPublisherVersion(),
        queryValidatedPublicVersion(),
      ]);
      const publisherFlags = publisherVersion?.flags ?? 'missing';
      const publicLatest = publicVersion?.version ?? 'missing';
      lastState = `publisher flags=${publisherFlags}; VS Code validated latest=${publicLatest}`;

      if (publisherVersion?.validationResultMessage) {
        const error = new Error(
          `Marketplace validation reported: ${publisherVersion.validationResultMessage}`,
        );
        error.nonRetryable = true;
        throw error;
      }
      if (
        publicVersion?.version &&
        compareVersions(publicVersion.version, expectedVersion) > 0
      ) {
        const error = new Error(
          `Marketplace latest validated version ${publicVersion.version} is newer than expected ${expectedVersion}.`,
        );
        error.nonRetryable = true;
        throw error;
      }
      if (
        publisherVersion &&
        isValidated(publisherVersion.flags) &&
        publicVersion?.version === expectedVersion &&
        isValidated(publicVersion.flags)
      ) {
        return { publisherVersion, publicVersion };
      }

      console.error(
        `[${new Date().toISOString()}] uploaded; Marketplace validation pending ` +
          `(attempt ${attempt}: ${lastState})`,
      );
    } catch (error) {
      if (error.nonRetryable) {
        throw error;
      }
      lastState = error.message;
      console.error(
        `[${new Date().toISOString()}] Marketplace verification retry ${attempt}: ${lastState}`,
      );
    }

    const remainingMilliseconds = deadline - Date.now();
    if (remainingMilliseconds <= 0) {
      throw new Error(
        `Timed out after ${options.timeoutSeconds}s waiting for ${extensionIdentity}@${expectedVersion}. Last state: ${lastState}`,
      );
    }
    await delay(
      Math.min(options.intervalSeconds * 1000, remainingMilliseconds),
    );
  }
};

const inspectVsix = (vsixPath, label) => {
  try {
    execFileSync('unzip', ['-tqq', vsixPath], { stdio: 'pipe' });
    const manifestText = execFileSync(
      'unzip',
      ['-p', vsixPath, 'extension/package.json'],
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const manifest = JSON.parse(manifestText);
    const identity = `${manifest.publisher}.${manifest.name}`;
    if (
      identity.toLowerCase() !== expectedIdentityLower ||
      manifest.version !== expectedVersion
    ) {
      throw new Error(
        `${label} manifest is ${identity}@${manifest.version}; expected ${extensionIdentity}@${expectedVersion}.`,
      );
    }
    return manifest;
  } catch (error) {
    throw new Error(
      `${label} failed VSIX archive/manifest inspection: ${error.message}`,
      { cause: error },
    );
  }
};

const downloadPublishedVsix = async () => {
  const url = new URL(
    `/_apis/public/gallery/publishers/${encodeURIComponent(publisher)}/vsextensions/` +
      `${encodeURIComponent(extensionName)}/${encodeURIComponent(expectedVersion)}/vspackage`,
    GALLERY_BASE_URL,
  );
  url.searchParams.set('cacheBust', `${Date.now()}-${Math.random()}`);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      `Version-specific Marketplace package returned HTTP ${response.status}.`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
};

let temporaryDirectory;
try {
  const { publisherVersion } = await waitForMarketplaceValidation();
  const localVsix = await readFile(options.vsixPath);
  inspectVsix(options.vsixPath, 'Uploaded VSIX');

  const marketplaceVsix = await downloadPublishedVsix();
  temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'icons-plus-plus-marketplace-release-'),
  );
  const marketplaceVsixPath = path.join(
    temporaryDirectory,
    `${extensionName}-${expectedVersion}-marketplace.vsix`,
  );
  await writeFile(marketplaceVsixPath, marketplaceVsix);
  inspectVsix(marketplaceVsixPath, 'Marketplace VSIX');

  const localHash = sha256(localVsix);
  const marketplaceHash = sha256(marketplaceVsix);
  const galleryHash = publisherVersion.properties?.find(
    property => property.key === 'Microsoft.VisualStudio.Services.VsixSha256',
  )?.value;
  if (!galleryHash) {
    throw new Error(
      'Authenticated publisher metadata did not expose the Marketplace VSIX SHA-256.',
    );
  }
  if (marketplaceHash !== galleryHash) {
    throw new Error(
      `Marketplace download hash ${marketplaceHash} does not match Gallery metadata ${galleryHash}.`,
    );
  }
  if (localHash !== marketplaceHash || !localVsix.equals(marketplaceVsix)) {
    throw new Error(
      `Marketplace package is not byte-identical to the upload ` +
        `(upload ${localHash}; Marketplace ${marketplaceHash}).`,
    );
  }

  console.info(
    `${SUCCESS_MARKER} identity=${extensionIdentity} version=${expectedVersion} sha256=${marketplaceHash}`,
  );
} catch (error) {
  console.error(`Marketplace release verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
