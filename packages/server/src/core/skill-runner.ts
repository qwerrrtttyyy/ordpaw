import type { SkillDefinition, SkillContext } from '@ordpaw/shared';
import { v4 as uuidv4 } from 'uuid';

class SkillRunner {
  private skills: Map<string, SkillDefinition> = new Map();

  registerSkill(skill: SkillDefinition): void {
    if (!skill.id) {
      skill.id = uuidv4();
    }
    this.skills.set(skill.id, skill);
  }

  getSkill(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  async executeSkill(id: string, params: any, context: SkillContext): Promise<any> {
    const skill = this.skills.get(id);
    if (!skill) {
      throw new Error(`Skill not found: ${id}`);
    }

    try {
      const result = await skill.execute(params, context);
      return result;
    } catch (error) {
      console.error(`Skill execution error: ${id}`, error);
      throw error;
    }
  }

  unregisterSkill(id: string): void {
    this.skills.delete(id);
  }
}

export const skillRunner = new SkillRunner();

// 注册内置技能
skillRunner.registerSkill({
  id: 'builtin-echo',
  name: 'Echo',
  description: '回显输入内容',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string' }
    },
    required: ['message']
  },
  execute: async (params) => {
    return { echo: params.message };
  }
});

skillRunner.registerSkill({
  id: 'builtin-time',
  name: 'Current Time',
  description: '获取当前时间',
  parameters: { type: 'object', properties: {} },
  execute: async () => {
    return { time: new Date().toISOString() };
  }
});
