import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { gunzipSync } from 'node:zlib';
import { ensureHome, getVersionDir } from './version-manager.js';

const NPM_REGISTRY = 'https://registry.npmjs.org';

function readNullTerminatedString(buffer: Buffer, offset: number, maxLength: number): string {
  let end = offset;
  while (end < offset + maxLength && buffer[end] !== 0) end++;
  return buffer.toString('utf8', offset, end);
}

function parseOctal(buffer: Buffer, offset: number, length: number): number {
  const str = readNullTerminatedString(buffer, offset, length).trim();
  if (!str) return 0;
  return parseInt(str, 8);
}

export function extractTarGz(archivePath: string, destDir: string): void {
  const gzipped = fs.readFileSync(archivePath);
  const tar = gunzipSync(gzipped);
  fs.mkdirSync(destDir, { recursive: true });

  let offset = 0;
  while (offset < tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      offset += 512;
      continue;
    }

    const name = readNullTerminatedString(header, 0, 100);
    const size = parseOctal(header, 124, 12);
    const typeFlag = String.fromCharCode(header[156] ?? 0);

    offset += 512;

    if (typeFlag === '5' || name.endsWith('/')) {
      const dirPath = path.join(destDir, name);
      fs.mkdirSync(dirPath, { recursive: true });
      continue;
    }

    if (typeFlag === '0' || typeFlag === '\0' || typeFlag === '') {
      const filePath = path.join(destDir, name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, tar.subarray(offset, offset + size));
      fs.chmodSync(filePath, parseOctal(header, 100, 8) || 0o644);
      offset += Math.ceil(size / 512) * 512;
    }
  }
}

export function buildTarballUrl(version: string): string {
  return `${NPM_REGISTRY}/@ordpaw%2fserver/-/server-${version}.tgz`;
}

export function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { 'User-Agent': 'ordpaw-vm' } }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const location = response.headers.location;
          if (!location) return reject(new Error('Redirect without location header'));
          downloadFile(location, dest).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', reject);
  });
}

export interface InstallOptions {
  tarballPath?: string;
}

export async function installVersion(version: string, options: InstallOptions = {}): Promise<void> {
  const versionDir = getVersionDir(version);
  if (fs.existsSync(versionDir)) {
    throw new Error(`Version ${version} is already installed.`);
  }

  ensureHome();
  fs.mkdirSync(versionDir, { recursive: true });

  try {
    if (options.tarballPath) {
      extractTarGz(options.tarballPath, versionDir);
      return;
    }

    const tarballUrl = buildTarballUrl(version);
    const tempTarball = path.join(versionDir, 'download.tgz');
    await downloadFile(tarballUrl, tempTarball);
    extractTarGz(tempTarball, versionDir);
    fs.rmSync(tempTarball, { force: true });
  } catch (error) {
    fs.rmSync(versionDir, { recursive: true, force: true });
    throw error;
  }
}
