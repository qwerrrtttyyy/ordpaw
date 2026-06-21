#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { installVersion } from './installer.js';
import {
  getCurrentVersion,
  listInstalledVersions,
  uninstallVersion,
  useVersion,
} from './version-manager.js';

function printHelp(): void {
  console.log(`ordpaw-vm — OrdPaw version manager

Usage:
  ordpaw-vm install <version>    Install a version
  ordpaw-vm use <version>        Switch to an installed version
  ordpaw-vm list                 List installed versions
  ordpaw-vm current              Show active version
  ordpaw-vm uninstall <version>  Remove an installed version
  ordpaw-vm help                 Show this help message
`);
}

function printList(): void {
  const versions = listInstalledVersions();
  const current = getCurrentVersion();
  if (versions.length === 0) {
    console.log('No versions installed.');
    return;
  }
  for (const version of versions) {
    const marker = version === current ? '* ' : '  ';
    console.log(`${marker}${version}`);
  }
}

export async function run(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const command = args[0];
  const arg = args[1];

  try {
    switch (command) {
      case 'install': {
        if (!arg) {
          console.error('Error: version is required');
          process.exit(1);
        }
        await installVersion(
          arg,
          process.env.ORDPAW_VM_MOCK_TARBALL
            ? { tarballPath: process.env.ORDPAW_VM_MOCK_TARBALL }
            : undefined
        );
        console.log(`Installed OrdPaw ${arg}`);
        break;
      }
      case 'use': {
        if (!arg) {
          console.error('Error: version is required');
          process.exit(1);
        }
        useVersion(arg);
        console.log(`Using OrdPaw ${arg}`);
        break;
      }
      case 'list':
      case 'ls':
        printList();
        break;
      case 'current': {
        const current = getCurrentVersion();
        console.log(current ?? 'No active version');
        break;
      }
      case 'uninstall': {
        if (!arg) {
          console.error('Error: version is required');
          process.exit(1);
        }
        uninstallVersion(arg);
        console.log(`Uninstalled OrdPaw ${arg}`);
        break;
      }
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;
      default:
        console.error(`Unknown command: ${command ?? ''}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv);
}
