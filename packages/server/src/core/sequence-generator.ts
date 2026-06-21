/**
 * WebSocket 自动操作序列系统
 * 后端生成操作序列 → 前端通过 WebSocket 接收并执行
 */

import type { Operation, OperationSequence, OperationResult, OperationType } from '@ordpaw/shared';

/** 操作权限级别 */
export enum PermissionLevel {
  NONE = 0,
  READ = 1,
  INTERACT = 2,
  MODIFY = 3,
  ADMIN = 4,
}

/** 操作权限映射 */
const OPERATION_PERMISSIONS: Record<OperationType, PermissionLevel> = {
  'ui:navigate': PermissionLevel.READ,
  'ui:scroll': PermissionLevel.READ,
  'ui:highlight': PermissionLevel.READ,
  'ui:click': PermissionLevel.INTERACT,
  'ui:input': PermissionLevel.INTERACT,
  'ui:theme': PermissionLevel.MODIFY,
  'chat:send': PermissionLevel.INTERACT,
  'chat:clear': PermissionLevel.MODIFY,
  'animation:play': PermissionLevel.READ,
  'notification:show': PermissionLevel.READ,
  'custom:trigger': PermissionLevel.ADMIN,
};

/** 角色权限 */
const ROLE_PERMISSIONS: Record<string, PermissionLevel> = {
  guest: PermissionLevel.READ,
  user: PermissionLevel.INTERACT,
  admin: PermissionLevel.ADMIN,
};

/** 沙箱配置 */
const SANDBOX_CONFIG = {
  maxOperationsPerSequence: 100,
  maxConcurrentSequences: 5,
  maxTimeout: 60000,
  allowedRoutes: [
    '#/', '#/conversations', '#/agents', '#/plugins',
    '#/prompts', '#/scripts', '#/debug', '#/settings',
  ],
  blockedSelectors: [
    /\b(admin|system|critical)\b/i,
    /\b(password|secret|token)\b/i,
  ],
  rateLimit: {
    maxSequencesPerMinute: 10,
    maxOperationsPerMinute: 100,
  },
};

/** 操作白名单 */
const ALLOWED_OPERATIONS = new Set<OperationType>([
  'ui:click', 'ui:navigate', 'ui:theme',
  'ui:input', 'ui:scroll', 'ui:highlight',
  'chat:send', 'chat:clear',
  'animation:play', 'notification:show',
]);

/** 速率限制器 */
class RateLimiter {
  private timestamps = new Map<string, number[]>();

  check(key: string, maxPerMinute: number): boolean {
    const now = Date.now();
    const windowMs = 60000;
    const recent = (this.timestamps.get(key) || []).filter(t => now - t < windowMs);
    recent.push(now);
    this.timestamps.set(key, recent);
    return recent.length <= maxPerMinute;
  }
}

const rateLimiter = new RateLimiter();

/** 权限检查 */
export function checkPermission(operation: Operation, userRole: string): { allowed: boolean; reason?: string } {
  const required = OPERATION_PERMISSIONS[operation.type];
  const userLevel = ROLE_PERMISSIONS[userRole] ?? PermissionLevel.NONE;
  if (userLevel < required) {
    return { allowed: false, reason: `需要 ${PermissionLevel[required]} 权限，当前 ${PermissionLevel[userLevel]}` };
  }
  return { allowed: true };
}

/** 沙箱验证 */
export function validateSequence(sequence: OperationSequence, userId: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 速率限制
  if (!rateLimiter.check(`seq_${userId}`, SANDBOX_CONFIG.rateLimit.maxSequencesPerMinute)) {
    errors.push('操作序列频率超过限制');
  }

  // 操作数量限制
  if (sequence.operations.length > SANDBOX_CONFIG.maxOperationsPerSequence) {
    errors.push(`操作数量超过限制: ${sequence.operations.length} > ${SANDBOX_CONFIG.maxOperationsPerSequence}`);
  }

  for (const op of sequence.operations) {
    // 白名单检查
    if (!ALLOWED_OPERATIONS.has(op.type)) {
      errors.push(`操作类型 ${op.type} 不在白名单`);
    }

    // 超时限制
    if (op.timeout && (op.timeout < 100 || op.timeout > SANDBOX_CONFIG.maxTimeout)) {
      op.timeout = Math.max(100, Math.min(SANDBOX_CONFIG.maxTimeout, op.timeout));
    }

    // 选择器安全检查
    if (op.params?.selector) {
      for (const pattern of SANDBOX_CONFIG.blockedSelectors) {
        if (pattern.test(op.params.selector)) {
          errors.push(`操作 ${op.id} 使用了禁止的选择器: ${op.params.selector}`);
        }
      }
    }

    // 路由安全检查
    if (op.type === 'ui:navigate' && !SANDBOX_CONFIG.allowedRoutes.includes(op.params?.route)) {
      errors.push(`操作 ${op.id} 导航到未授权的路由: ${op.params?.route}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** 序列生成器 */
export class SequenceGenerator {
  private idCounter = 0;

  async generate(
    intent: string,
    entities: Record<string, any>,
    context: { conversationId: string; userId: string }
  ): Promise<OperationSequence | null> {
    const operations: Operation[] = [];

    // 根据意图构建操作
    switch (intent) {
      case 'navigate_and_chat':
        operations.push({
          id: `op_${++this.idCounter}_${Date.now()}`,
          type: 'ui:navigate',
          params: { route: entities.route || '#/conversations', transition: 'fade' },
        });
        operations.push({
          id: `op_${++this.idCounter}_${Date.now()}`,
          type: 'chat:send',
          params: {
            conversationId: entities.conversationId,
            content: entities.message,
            waitForResponse: true,
          },
          timeout: 30000,
          dependsOn: [operations[0].id],
        });
        break;

      case 'theme_switch':
        operations.push({
          id: `op_${++this.idCounter}_${Date.now()}`,
          type: 'ui:theme',
          params: { theme: entities.theme, animate: true },
        });
        operations.push({
          id: `op_${++this.idCounter}_${Date.now()}`,
          type: 'notification:show',
          params: {
            type: 'success',
            title: '主题已切换',
            message: `已为您切换到${entities.theme === 'ordpaw-dark' ? '深色' : '浅色'}主题`,
            duration: 2000,
          },
          dependsOn: [operations[0].id],
        });
        break;

      case 'onboarding':
        operations.push({
          id: `op_${++this.idCounter}_${Date.now()}`,
          type: 'ui:navigate',
          params: { route: '#/settings', transition: 'fade' },
        });
        operations.push({
          id: `op_${++this.idCounter}_${Date.now()}`,
          type: 'ui:highlight',
          params: { selector: '[data-setting="theme"]', duration: 2000, style: 'pulse' },
          dependsOn: [operations[0].id],
        });
        operations.push({
          id: `op_${++this.idCounter}_${Date.now()}`,
          type: 'notification:show',
          params: {
            type: 'info',
            title: '个性化设置',
            message: '点击这里选择您喜欢的主题',
            duration: 3000,
          },
          dependsOn: [operations[1].id],
        });
        break;

      default:
        return null;
    }

    if (operations.length === 0) return null;

    const sequence: OperationSequence = {
      id: `seq_${Date.now()}_${this.idCounter}`,
      version: '1.0',
      source: 'agent',
      operations,
      metadata: {
        createdAt: Date.now(),
        priority: intent.includes('urgent') ? 'high' : 'normal',
        requiresConfirmation: operations.some(op => op.type === 'chat:send' || op.type === 'custom:trigger'),
      },
    };

    return sequence;
  }
}

export const sequenceGenerator = new SequenceGenerator();
