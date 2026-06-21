import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { run } from '../cli.js';
import { createTarGz } from './helpers.js';

describe('cli', () => {
  let tempHome: string;
  let originalHome: string | undefined;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalHome = process.env.ORDPAW_VM_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ordpaw-vm-cli-'));
    process.env.ORDPAW_VM_HOME = tempHome;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.ORDPAW_VM_HOME;
    } else {
      process.env.ORDPAW_VM_HOME = originalHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('installs a version', async () => {
    const tarball = path.join(tempHome, 'mock.tgz');
    fs.writeFileSync(tarball, createTarGz([{ name: 'package.json', content: '{}' }]));
    process.env.ORDPAW_VM_MOCK_TARBALL = tarball;

    await run(['node', 'ordpaw-vm', 'install', '0.1.0']);

    expect(logSpy).toHaveBeenCalledWith('Installed OrdPaw 0.1.0');
  });

  it('lists versions and marks current', async () => {
    const tarball = path.join(tempHome, 'mock.tgz');
    fs.writeFileSync(tarball, createTarGz([{ name: 'package.json', content: '{}' }]));
    process.env.ORDPAW_VM_MOCK_TARBALL = tarball;

    await run(['node', 'ordpaw-vm', 'install', '0.2.0']);
    await run(['node', 'ordpaw-vm', 'use', '0.2.0']);
    await run(['node', 'ordpaw-vm', 'list']);

    expect(logSpy).toHaveBeenCalledWith('* 0.2.0');
  });

  it('shows current version', async () => {
    const tarball = path.join(tempHome, 'mock.tgz');
    fs.writeFileSync(tarball, createTarGz([{ name: 'package.json', content: '{}' }]));
    process.env.ORDPAW_VM_MOCK_TARBALL = tarball;

    await run(['node', 'ordpaw-vm', 'install', '0.3.0']);
    await run(['node', 'ordpaw-vm', 'use', '0.3.0']);
    logSpy.mockClear();

    await run(['node', 'ordpaw-vm', 'current']);

    expect(logSpy).toHaveBeenCalledWith('0.3.0');
  });

  it('uninstalls a version', async () => {
    const tarball = path.join(tempHome, 'mock.tgz');
    fs.writeFileSync(tarball, createTarGz([{ name: 'package.json', content: '{}' }]));
    process.env.ORDPAW_VM_MOCK_TARBALL = tarball;

    await run(['node', 'ordpaw-vm', 'install', '0.4.0']);
    await run(['node', 'ordpaw-vm', 'uninstall', '0.4.0']);

    expect(logSpy).toHaveBeenCalledWith('Uninstalled OrdPaw 0.4.0');
  });

  it('prints help for unknown commands', async () => {
    await run(['node', 'ordpaw-vm', 'bogus']);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith('Unknown command: bogus');
  });
});
