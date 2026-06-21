import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  listInstalledVersions,
  getCurrentVersion,
  useVersion,
  uninstallVersion,
  getVersionDir,
} from '../version-manager.js';

describe('version-manager', () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.ORDPAW_VM_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ordpaw-vm-'));
    process.env.ORDPAW_VM_HOME = tempHome;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.ORDPAW_VM_HOME;
    } else {
      process.env.ORDPAW_VM_HOME = originalHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('returns empty list when no versions installed', () => {
    expect(listInstalledVersions()).toEqual([]);
    expect(getCurrentVersion()).toBeNull();
  });

  it('lists installed versions in sorted order', () => {
    fs.mkdirSync(getVersionDir('0.0.1'), { recursive: true });
    fs.mkdirSync(getVersionDir('0.0.3'), { recursive: true });
    fs.mkdirSync(getVersionDir('0.0.2'), { recursive: true });

    expect(listInstalledVersions()).toEqual(['0.0.1', '0.0.2', '0.0.3']);
  });

  it('sets current version and reads it back', () => {
    fs.mkdirSync(getVersionDir('0.0.5'), { recursive: true });

    useVersion('0.0.5');

    expect(getCurrentVersion()).toBe('0.0.5');
  });

  it('throws when switching to a non-installed version', () => {
    expect(() => useVersion('0.0.9')).toThrow('0.0.9 is not installed');
  });

  it('removes installed version and clears current', () => {
    fs.mkdirSync(getVersionDir('0.0.4'), { recursive: true });
    useVersion('0.0.4');

    uninstallVersion('0.0.4');

    expect(listInstalledVersions()).toEqual([]);
    expect(getCurrentVersion()).toBeNull();
  });

  it('throws when uninstalling a non-installed version', () => {
    expect(() => uninstallVersion('0.0.9')).toThrow('0.0.9 is not installed');
  });
});
