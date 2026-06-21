import { describe, it, expect } from 'vitest';
import { skillRunner } from './skill-runner.js';
import type { SkillDefinition } from '@ordpaw/shared';

describe('skillRunner', () => {
  it('registers and executes a skill', async () => {
    const skill: SkillDefinition = {
      id: 'test-echo',
      name: 'echo',
      description: 'echo',
      parameters: {},
      execute: async (params) => ({ echo: params.message })
    };

    skillRunner.registerSkill(skill);
    const result = await skillRunner.executeSkill('test-echo', { message: 'hi' }, {
      conversationId: 'c1', agentId: 'a1', variables: {}
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ echo: 'hi' });
  });

  it('throws on invalid skill registration', () => {
    expect(() => skillRunner.registerSkill({} as any)).toThrow('技能定义无效');
  });

  it('returns error for unknown skill', async () => {
    const result = await skillRunner.executeSkill('missing', {}, {
      conversationId: 'c1', agentId: 'a1', variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('技能不存在');
  });
});
