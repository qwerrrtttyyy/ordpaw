import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function getVmHome(): string {
  return process.env.ORDPAW_VM_HOME ?? path.join(os.homedir(), '.ordpaw-vm');
}

export function getVersionsDir(): string {
  return path.join(getVmHome(), 'versions');
}

export function getVersionDir(version: string): string {
  return path.join(getVersionsDir(), version);
}

export function getCurrentPath(): string {
  return path.join(getVmHome(), 'current');
}

export function ensureHome(): void {
  fs.mkdirSync(getVersionsDir(), { recursive: true });
}

export function listInstalledVersions(): string[] {
  const versionsDir = getVersionsDir();
  if (!fs.existsSync(versionsDir)) return [];
  return fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function getCurrentVersion(): string | null {
  const currentPath = getCurrentPath();
  if (!fs.existsSync(currentPath)) return null;

  try {
    const stats = fs.lstatSync(currentPath);
    if (stats.isSymbolicLink()) {
      const target = fs.readlinkSync(currentPath);
      return path.basename(target);
    }
  } catch {
    // Fall through to file read.
  }

  const content = fs.readFileSync(currentPath, 'utf8').trim();
  return content || null;
}

export function useVersion(version: string): void {
  const versionDir = getVersionDir(version);
  if (!fs.existsSync(versionDir)) {
    throw new Error(`Version ${version} is not installed. Run: ordpaw-vm install ${version}`);
  }

  ensureHome();
  const currentPath = getCurrentPath();
  try {
    if (fs.existsSync(currentPath)) fs.unlinkSync(currentPath);
    fs.symlinkSync(versionDir, currentPath);
  } catch {
    fs.writeFileSync(currentPath, version, 'utf8');
  }
}

export function uninstallVersion(version: string): void {
  const versionDir = getVersionDir(version);
  if (!fs.existsSync(versionDir)) {
    throw new Error(`Version ${version} is not installed.`);
  }

  fs.rmSync(versionDir, { recursive: true, force: true });

  const current = getCurrentVersion();
  if (current === version) {
    const currentPath = getCurrentPath();
    if (fs.existsSync(currentPath)) fs.rmSync(currentPath, { recursive: true, force: true });
  }
}
