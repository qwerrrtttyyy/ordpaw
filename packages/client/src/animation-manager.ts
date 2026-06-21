/**
 * 动画管理器 - 提供 FPS 控制、动画调度、will-change 管理和性能优化
 */

import type { PerformanceTier } from '@ordpaw/shared';

export type { PerformanceTier } from '@ordpaw/shared';

export interface AnimationOptions {
  duration?: number;
  easing?: string;
  delay?: number;
  loop?: boolean;
  onFrame?: (progress: number, delta: number) => void;
  onComplete?: () => void;
}

interface AnimationTask {
  id: string;
  startTime: number;
  duration: number;
  delay: number;
  loop: boolean;
  onFrame?: (progress: number, delta: number) => void;
  onComplete?: () => void;
  cancelled: boolean;
  lastProgress: number;
}

interface WillChangeEntry {
  el: HTMLElement;
  props: Set<string>;
  timeout: ReturnType<typeof setTimeout> | null;
}

export class AnimationManager {
  private tasks = new Map<string, AnimationTask>();
  private rafId: number | null = null;
  private running = false;
  private lastFrameTime = 0;
  private frameCount = 0;
  private fps = 60;
  private targetFps = 60;
  private frameInterval: number;
  private fpsCallback: ((fps: number) => void) | null = null;
  private fpsUpdateInterval = 500; // ms
  private lastFpsUpdate = 0;
  private enabled = true;
  private taskIdCounter = 0;
  private performanceTier: PerformanceTier = 'high';
  private willChangeMap = new WeakMap<HTMLElement, WillChangeEntry>();
  private intersectionObserver: IntersectionObserver | null = null;
  private observedElements = new Map<Element, Set<string>>();
  private visibilityPaused = false;

  constructor(targetFps = 60) {
    this.targetFps = targetFps;
    this.frameInterval = 1000 / targetFps;
    this.initIntersectionObserver();
  }

  /**
   * 启用/禁用动画
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.cancelAll();
      this.stop();
    }
  }

  isEnabled() {
    return this.enabled;
  }

  /**
   * 设置性能分级并调整目标帧率
   */
  setPerformanceTier(tier: PerformanceTier) {
    this.performanceTier = tier;
    switch (tier) {
      case 'low':
        this.setTargetFps(30);
        break;
      case 'medium':
        this.setTargetFps(45);
        break;
      case 'high':
      default:
        this.setTargetFps(60);
        break;
    }
  }

  getPerformanceTier(): PerformanceTier {
    return this.performanceTier;
  }

  /**
   * 设置目标 FPS
   */
  setTargetFps(fps: number) {
    this.targetFps = Math.max(1, Math.min(120, fps));
    this.frameInterval = 1000 / this.targetFps;
  }

  getTargetFps() {
    return this.targetFps;
  }

  /**
   * 获取当前 FPS
   */
  getCurrentFps() {
    return this.fps;
  }

  /**
   * 设置 FPS 回调
   */
  onFpsUpdate(callback: (fps: number) => void) {
    this.fpsCallback = callback;
  }

  /**
   * 注册需要可见性控制的元素
   */
  observeVisibility(el: Element, taskIds?: string[]) {
    if (!this.intersectionObserver || typeof IntersectionObserver === 'undefined') return;
    if (taskIds) {
      this.observedElements.set(el, new Set(taskIds));
    }
    this.intersectionObserver.observe(el);
  }

  unobserveVisibility(el: Element) {
    if (!this.intersectionObserver) return;
    this.observedElements.delete(el);
    this.intersectionObserver.unobserve(el);
  }

  /**
   * 创建动画任务
   */
  animate(options: AnimationOptions): string {
    if (!this.enabled) {
      options.onComplete?.();
      return '';
    }

    const id = `anim_${++this.taskIdCounter}_${Date.now()}`;
    const task: AnimationTask = {
      id,
      startTime: performance.now(),
      duration: options.duration ?? 300,
      delay: options.delay ?? 0,
      loop: options.loop ?? false,
      onFrame: options.onFrame,
      onComplete: options.onComplete,
      cancelled: false,
      lastProgress: -1
    };

    this.tasks.set(id, task);
    this.start();
    return id;
  }

  /**
   * 取消动画
   */
  cancel(id: string) {
    const task = this.tasks.get(id);
    if (task) {
      task.cancelled = true;
      this.tasks.delete(id);
    }
  }

  /**
   * 取消所有动画
   */
  cancelAll() {
    for (const task of this.tasks.values()) {
      task.cancelled = true;
    }
    this.tasks.clear();
  }

  /**
   * 临时提升元素 will-change 属性，动画结束后自动移除
   */
  promoteLayer(el: HTMLElement, properties: string[], duration = 300) {
    if (!el || typeof window === 'undefined') return;

    const key = el;
    let entry = this.willChangeMap.get(key);
    if (!entry) {
      entry = { el, props: new Set(), timeout: null };
      this.willChangeMap.set(key, entry);
    }

    for (const prop of properties) {
      entry.props.add(prop);
    }

    this.applyWillChange(entry);

    if (entry.timeout) {
      clearTimeout(entry.timeout);
    }
    entry.timeout = setTimeout(() => {
      entry!.props.clear();
      this.applyWillChange(entry!);
    }, duration + 50);
  }

  /**
   * 移除元素的 will-change 提升
   */
  demoteLayer(el: HTMLElement) {
    const entry = this.willChangeMap.get(el);
    if (entry) {
      entry.props.clear();
      if (entry.timeout) {
        clearTimeout(entry.timeout);
        entry.timeout = null;
      }
      this.applyWillChange(entry);
    }
  }

  private applyWillChange(entry: WillChangeEntry) {
    const value = Array.from(entry.props).join(', ');
    entry.el.style.willChange = value || 'auto';
  }

  /**
   * 启动动画循环
   */
  private start() {
    if (this.running || !this.enabled) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.lastFpsUpdate = this.lastFrameTime;
    this.frameCount = 0;
    this.tick();
  }

  /**
   * 停止动画循环
   */
  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * 初始化 IntersectionObserver，用于暂停屏幕外动画
   */
  private initIntersectionObserver() {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

    this.intersectionObserver = new IntersectionObserver((entries) => {
      let anyVisible = false;
      for (const entry of entries) {
        const taskIds = this.observedElements.get(entry.target);
        if (taskIds) {
          if (!entry.isIntersecting) {
            for (const id of taskIds) {
              this.cancel(id);
            }
          }
        }
        if (entry.isIntersecting) {
          anyVisible = true;
        }
      }
      // 简单策略：当没有任何观察元素可见时暂停非必要动画循环
      this.visibilityPaused = !anyVisible && this.observedElements.size > 0;
    }, { threshold: 0 });
  }

  /**
   * 动画帧回调
   */
  private tick = () => {
    if (!this.running) return;

    const now = performance.now();
    const elapsed = now - this.lastFrameTime;

    // FPS 控制
    if (elapsed < this.frameInterval) {
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    // 计算 FPS
    this.frameCount++;
    if (now - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      this.fpsCallback?.(this.fps);
    }

    this.lastFrameTime = now;

    // 若因不可见暂停且无其他任务，停止循环
    if (this.visibilityPaused && this.tasks.size === 0) {
      this.stop();
      return;
    }

    // 处理所有任务
    const completedTasks: string[] = [];

    for (const [id, task] of this.tasks) {
      if (task.cancelled) {
        completedTasks.push(id);
        continue;
      }

      const taskElapsed = now - task.startTime;

      // 延迟期间跳过
      if (taskElapsed < task.delay) {
        continue;
      }

      const activeTime = taskElapsed - task.delay;
      let progress = task.duration > 0 ? activeTime / task.duration : 1;

      if (task.loop) {
        progress = progress % 1;
      } else if (progress >= 1) {
        progress = 1;
        completedTasks.push(id);
      }

      // 低性能模式下降低精度，避免每帧回调
      if (this.performanceTier === 'low' && Math.abs(progress - task.lastProgress) < 0.02) {
        if (progress >= 1 && !task.loop) {
          completedTasks.push(id);
        }
        continue;
      }
      task.lastProgress = progress;

      // 计算增量（用于速度计算）
      const delta = Math.min(elapsed, 100) / 1000;

      task.onFrame?.(progress, delta);

      if (progress >= 1 && !task.loop) {
        task.onComplete?.();
      }
    }

    // 清理完成的任务
    for (const id of completedTasks) {
      this.tasks.delete(id);
    }

    // 如果没有任务了，停止循环
    if (this.tasks.size === 0) {
      this.stop();
      return;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  /**
   * 缓动函数集合
   */
  static easings = {
    linear: (t: number) => t,
    easeIn: (t: number) => t * t,
    easeOut: (t: number) => 1 - (1 - t) * (1 - t),
    easeInOut: (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    cubicIn: (t: number) => t * t * t,
    cubicOut: (t: number) => 1 - Math.pow(1 - t, 3),
    cubicInOut: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    elastic: (t: number) => {
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    bounce: (t: number) => {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (t < 1 / d1) {
        return n1 * t * t;
      } else if (t < 2 / d1) {
        return n1 * (t -= 1.5 / d1) * t + 0.75;
      } else if (t < 2.5 / d1) {
        return n1 * (t -= 2.25 / d1) * t + 0.9375;
      } else {
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
      }
    }
  };

  /**
   * 简化 API - 淡入动画
   */
  fadeIn(el: HTMLElement, duration = 300): Promise<void> {
    return new Promise(resolve => {
      this.promoteLayer(el, ['opacity'], duration + 100);
      el.style.opacity = '0';
      this.animate({
        duration,
        onFrame: (progress) => {
          const next = AnimationManager.easings.easeOut(progress);
          if (el.style.opacity !== String(next)) {
            el.style.opacity = String(next);
          }
        },
        onComplete: () => {
          el.style.opacity = '';
          this.demoteLayer(el);
          resolve();
        }
      });
    });
  }

  /**
   * 简化 API - 淡出动画
   */
  fadeOut(el: HTMLElement, duration = 300): Promise<void> {
    return new Promise(resolve => {
      this.promoteLayer(el, ['opacity'], duration + 100);
      this.animate({
        duration,
        onFrame: (progress) => {
          const next = 1 - AnimationManager.easings.easeIn(progress);
          if (el.style.opacity !== String(next)) {
            el.style.opacity = String(next);
          }
        },
        onComplete: () => {
          el.style.opacity = '';
          this.demoteLayer(el);
          resolve();
        }
      });
    });
  }

  /**
   * 简化 API - 滑入动画
   */
  slideIn(el: HTMLElement, direction: 'up' | 'down' | 'left' | 'right' = 'up', duration = 300): Promise<void> {
    return new Promise(resolve => {
      const transforms = {
        up: 'translateY(20px)',
        down: 'translateY(-20px)',
        left: 'translateX(20px)',
        right: 'translateX(-20px)'
      };

      this.promoteLayer(el, ['transform', 'opacity'], duration + 100);
      el.style.transform = transforms[direction];
      el.style.opacity = '0';

      this.animate({
        duration,
        onFrame: (progress) => {
          const eased = AnimationManager.easings.easeOut(progress);
          const scale = 1 - eased;
          const tx = direction === 'left' ? 20 * scale : direction === 'right' ? -20 * scale : 0;
          const ty = direction === 'up' ? 20 * scale : direction === 'down' ? -20 * scale : 0;
          const transform = `translate3d(${tx}px, ${ty}px, 0)`;
          if (el.style.transform !== transform) {
            el.style.transform = transform;
          }
          const opacity = String(eased);
          if (el.style.opacity !== opacity) {
            el.style.opacity = opacity;
          }
        },
        onComplete: () => {
          el.style.transform = '';
          el.style.opacity = '';
          this.demoteLayer(el);
          resolve();
        }
      });
    });
  }

  /**
   * 获取动画统计
   */
  getStats() {
    return {
      activeTasks: this.tasks.size,
      fps: this.fps,
      targetFps: this.targetFps,
      enabled: this.enabled,
      running: this.running,
      performanceTier: this.performanceTier
    };
  }
}

// 全局单例
export const animationManager = new AnimationManager(60);

/**
 * 检测用户是否偏好减少动画
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 基于硬件/环境估算性能分级（返回实际档位，不含 auto）
 */
export function detectPerformanceTier(): 'high' | 'medium' | 'low' {
  if (typeof window === 'undefined') return 'high';

  if (prefersReducedMotion()) return 'low';

  // 低电量模式
  const battery = (navigator as any).battery || (navigator as any).getBattery?.();
  if (battery?.saveData || battery?.charging === false && battery?.level < 0.2) {
    return 'low';
  }

  // 根据逻辑核心数与内存粗略分级
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as any).deviceMemory || 4;

  if (cores <= 2 || memory <= 2) return 'low';
  if (cores <= 4 || memory <= 4) return 'medium';
  return 'high';
}

/**
 * 根据用户偏好初始化动画管理器
 */
export function initAnimationPreferences(preferredTier?: PerformanceTier) {
  const tier = preferredTier ?? detectPerformanceTier();
  animationManager.setPerformanceTier(tier);

  if (prefersReducedMotion()) {
    animationManager.setEnabled(false);
  }

  // 监听偏好变化
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      animationManager.setEnabled(!e.matches);
    });
  }
}
