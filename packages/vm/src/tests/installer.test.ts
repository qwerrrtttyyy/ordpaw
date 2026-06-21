import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { installVersion, extractTarGz, buildTarballUrl } from '../installer.js';
import { getVersionDir, listInstalledVersions } from '../version-manager.js';
import { createTarGz } from './helpers.js';

describe('installer', () => {
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

  it('installs a version from a local tarball', async () => {
    const tarball = path.join(tempHome, 'mock.tgz');
    fs.writeFileSync(
      tarball,
      createTarGz([
        { name: 'package.json', content: '{"version":"0.0.3"}' },
        { name: 'bin/ordpaw', content: '#!/usr/bin/env node\nconsole.log("ok")' },
      ])
    );

    await installVersion('0.0.3', { tarballPath: tarball });

    expect(listInstalledVersions()).toContain('0.0.3');
    const installedPackage = path.join(getVersionDir('0.0.3'), 'package.json');
    expect(fs.readFileSync(installedPackage, 'utf8')).toBe('{"version":"0.0.3"}');
    const bin = path.join(getVersionDir('0.0.3'), 'bin/ordpaw');
    expect(fs.readFileSync(bin, 'utf8')).toBe('#!/usr/bin/env node\nconsole.log("ok")');
  });

  it('throws when version is already installed', async () => {
    const tarball = path.join(tempHome, 'mock.tgz');
    fs.writeFileSync(tarball, createTarGz([{ name: 'package.json', content: '{}' }]));

    await installVersion('0.0.2', { tarballPath: tarball });

    await expect(installVersion('0.0.2', { tarballPath: tarball })).rejects.toThrow(
      '0.0.2 is already installed'
    );
  });

  it('cleans up on extraction failure', async () => {
    const badTarball = path.join(tempHome, 'bad.tgz');
    fs.writeFileSync(badTarball, Buffer.from('not a tarball'));

    await expect(installVersion('0.0.1', { tarballPath: badTarball })).rejects.toThrow();
    expect(listInstalledVersions()).toEqual([]);
  });

  it('extracts a tarball containing a directory entry', () => {
    const tarball = path.join(tempHome, 'dir.tgz');
    const tar = createTarGz([{ name: 'lib/utils.js', content: 'module.exports = 1;' }]);
    fs.writeFileSync(tarball, tar);

    const dest = path.join(tempHome, 'extracted');
    extractTarGz(tarball, dest);

    expect(fs.existsSync(path.join(dest, 'lib'))).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'lib/utils.js'), 'utf8')).toBe('module.exports = 1;');
  });

  it('builds npm registry tarball url', () => {
    expect(buildTarballUrl('0.0.3')).toBe(
      'https://registry.npmjs.org/@ordpaw%2fserver/-/server-0.0.3.tgz'
    );
  });
});
