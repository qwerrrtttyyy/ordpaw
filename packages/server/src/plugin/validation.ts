import type { PluginManifest, Plugin, SkillDefinition, ComponentContribution } from '@ordpaw/shared';

const MANIFEST_REQUIRED_FIELDS = ['name', 'version', 'description', 'main'] as const;

export function validateManifest(manifest: unknown): manifest is PluginManifest {
  if (!manifest || typeof manifest !== 'object') return false;
  const m = manifest as Record<string, unknown>;

  for (const field of MANIFEST_REQUIRED_FIELDS) {
    if (typeof m[field] !== 'string' || !m[field]) return false;
  }

  if (m.config && typeof m.config !== 'object') return false;
  if (m.events && !Array.isArray(m.events)) return false;
  if (m.frontend && !Array.isArray(m.frontend)) return false;

  if (Array.isArray(m.frontend) && !m.frontend.every(isValidComponentContribution)) {
    return false;
  }

  return true;
}

export function validatePluginModule(plugin: unknown): plugin is Plugin {
  if (!plugin || typeof plugin !== 'object') return false;
  const p = plugin as Record<string, unknown>;

  if (p.onLoad && typeof p.onLoad !== 'function') return false;
  if (p.handlers && (typeof p.handlers !== 'object' || !Object.values(p.handlers).every(h => typeof h === 'function'))) {
    return false;
  }

  return true;
}

export function validateSkillDefinition(skill: unknown): skill is SkillDefinition {
  if (!skill || typeof skill !== 'object') return false;
  const s = skill as Record<string, unknown>;

  if (typeof s.id !== 'string' || !s.id) return false;
  if (typeof s.name !== 'string' || !s.name) return false;
  if (typeof s.execute !== 'function') return false;

  return true;
}

function isValidComponentContribution(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const cc = c as Record<string, unknown>;
  const validTypes = ['css', 'script', 'component'];
  const validSlots = ['header', 'sidebar', 'dashboard', 'settings', 'view'];

  if (!validTypes.includes(cc.type as string)) return false;
  if (typeof cc.name !== 'string' || !cc.name) return false;
  if (typeof cc.src !== 'string' || !cc.src) return false;
  if (cc.slot && !validSlots.includes(cc.slot as string)) return false;

  return true;
}
