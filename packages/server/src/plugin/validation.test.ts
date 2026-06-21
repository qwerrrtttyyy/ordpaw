import { describe, it, expect } from 'vitest';
import { validateManifest, validatePluginModule, validateSkillDefinition } from './validation.js';

describe('validateManifest', () => {
  it('accepts valid manifest', () => {
    expect(validateManifest({
      name: 'test',
      version: '1.0.0',
      description: 'desc',
      main: 'index.js'
    })).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(validateManifest({ name: 'test' })).toBe(false);
    expect(validateManifest(null)).toBe(false);
  });

  it('validates frontend contributions', () => {
    expect(validateManifest({
      name: 'test', version: '1.0.0', description: 'd', main: 'index.js',
      frontend: [{ type: 'component', name: 'X', src: './x.js', slot: 'sidebar' }]
    })).toBe(true);

    expect(validateManifest({
      name: 'test', version: '1.0.0', description: 'd', main: 'index.js',
      frontend: [{ type: 'invalid', name: 'X', src: './x.js' }]
    })).toBe(false);
  });
});

describe('validatePluginModule', () => {
  it('accepts module with onLoad and handlers', () => {
    expect(validatePluginModule({
      onLoad: async () => {},
      handlers: { 'x': () => {} }
    })).toBe(true);
  });

  it('rejects invalid handler types', () => {
    expect(validatePluginModule({ handlers: { x: 'not-fn' } })).toBe(false);
  });

  it('accepts empty module', () => {
    expect(validatePluginModule({})).toBe(true);
  });
});

describe('validateSkillDefinition', () => {
  it('accepts valid skill', () => {
    expect(validateSkillDefinition({ id: 's1', name: 'Skill', execute: async () => ({}) })).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(validateSkillDefinition({ id: 's1', name: 'Skill' })).toBe(false);
    expect(validateSkillDefinition({ name: 'Skill', execute: () => {} })).toBe(false);
  });
});
