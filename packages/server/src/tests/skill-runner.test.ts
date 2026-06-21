import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryDb } from './helpers.js';

let memoryDb: any;

vi.mock('../db/index.js', () => ({
  getDatabase: () => memoryDb,
  saveDatabase: vi.fn(),
  default: {
    getDatabase: () => memoryDb,
    saveDatabase: vi.fn()
  }
}));

describe('SkillRunner', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    memoryDb = await createMemoryDb();
  });

  it('initializes with built-in skills', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    skillRunner.init();

    const skills = skillRunner.listSkills();
    expect(skills.some(s => s.name === 'echo')).toBe(true);
    expect(skills.some(s => s.name === 'time')).toBe(true);

    const installed = skillRunner.listInstalled();
    expect(installed.some(s => s.source === 'builtin')).toBe(true);
  });

  it('executes built-in echo skill', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    skillRunner.init();

    const result = await skillRunner.executeSkill('builtin-echo', { message: 'hello' }, { conversationId: 'c1', agentId: 'a1', variables: {} });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ echo: 'hello' });
  });

  it('executes built-in time skill', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    skillRunner.init();

    const result = await skillRunner.executeSkill('builtin-time', {}, { conversationId: 'c1', agentId: 'a1', variables: {} });

    expect(result.success).toBe(true);
    expect(result.output).toHaveProperty('time');
    expect(typeof result.output.time).toBe('string');
  });

  it('returns error for unknown skill', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    skillRunner.init();

    const result = await skillRunner.executeSkill('builtin-unknown', {}, { conversationId: 'c1', agentId: 'a1', variables: {} });

    expect(result.success).toBe(false);
    expect(result.error).toContain('技能不存在');
  });

  it('registers a plugin skill', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    const execute = async () => ({ ok: true });

    skillRunner.registerSkill({ id: 'plugin-s1', name: 's1', description: '', parameters: {}, execute });

    const skill = skillRunner.getSkill('plugin-s1');
    expect(skill?.name).toBe('s1');
    expect(skill?.execute).toBe(execute);
  });

  it('installs and executes a user skill', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    skillRunner.init();

    const installed = await skillRunner.installSkill({
      name: 'double',
      description: 'double a number',
      code: 'return $args.value * 2;',
      parameters: { type: 'object', properties: { value: { type: 'number' } } }
    });

    expect(installed.name).toBe('double');

    const result = await skillRunner.executeSkill(installed.id, { value: 3 }, { conversationId: 'c1', agentId: 'a1', variables: {} });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ result: 6, logs: [] });
  });

  it('rejects invalid skill code during install', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    skillRunner.init();

    await expect(skillRunner.installSkill({
      name: 'bad',
      code: 'return {',
      parameters: {}
    })).rejects.toThrow('技能代码验证失败');
  });

  it('uninstalls a user skill', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    skillRunner.init();

    const installed = await skillRunner.installSkill({
      name: 'temp',
      code: 'return 1;',
      parameters: {}
    });

    const ok = skillRunner.uninstallSkill(installed.id);
    expect(ok).toBe(true);
    expect(skillRunner.getSkill(installed.id)).toBeUndefined();
  });

  it('throws when uninstalling a built-in skill', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    skillRunner.init();

    expect(() => skillRunner.uninstallSkill('builtin-echo')).toThrow('内置技能无法卸载');
  });

  it('returns false when uninstalling unknown skill', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    expect(skillRunner.uninstallSkill('missing')).toBe(false);
  });

  it('captures console logs from skill execution', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    skillRunner.init();

    const installed = await skillRunner.installSkill({
      name: 'logger',
      code: 'console.log("hi"); console.warn("warn"); console.error("err"); return 1;',
      parameters: {}
    });

    const result = await skillRunner.executeSkill(installed.id, {}, { conversationId: 'c1', agentId: 'a1', variables: {} });
    expect(result.success).toBe(true);
    expect(result.output.logs).toEqual(['hi', 'WARN: warn', 'ERROR: err']);
  });

  it('wraps skill execution errors', async () => {
    const { skillRunner } = await import('../core/skill-runner.js');
    skillRunner.init();

    const installed = await skillRunner.installSkill({
      name: 'failer',
      code: 'throw new Error("oops");',
      parameters: {}
    });

    const result = await skillRunner.executeSkill(installed.id, {}, { conversationId: 'c1', agentId: 'a1', variables: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain('oops');
  });
});
