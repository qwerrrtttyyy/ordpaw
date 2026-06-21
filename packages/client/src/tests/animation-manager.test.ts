import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnimationManager, initAnimationPreferences, detectPerformanceTier, prefersReducedMotion } from '../animation-manager';

describe('AnimationManager', () => {
  let manager: AnimationManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new AnimationManager(60);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default values', () => {
    expect(manager.getTargetFps()).toBe(60);
    expect(manager.isEnabled()).toBe(true);
    expect(manager.getPerformanceTier()).toBe('high');
  });

  it('sets target fps within bounds', () => {
    manager.setTargetFps(30);
    expect(manager.getTargetFps()).toBe(30);
    manager.setTargetFps(200);
    expect(manager.getTargetFps()).toBe(120);
    manager.setTargetFps(-10);
    expect(manager.getTargetFps()).toBe(1);
  });

  it('sets performance tier and adjusts fps', () => {
    manager.setPerformanceTier('low');
    expect(manager.getPerformanceTier()).toBe('low');
    expect(manager.getTargetFps()).toBe(30);

    manager.setPerformanceTier('medium');
    expect(manager.getTargetFps()).toBe(45);

    manager.setPerformanceTier('high');
    expect(manager.getTargetFps()).toBe(60);
  });

  it('disables and cancels all animations', () => {
    const onComplete = vi.fn();
    manager.animate({ duration: 1000, onComplete });
    manager.setEnabled(false);
    expect(manager.isEnabled()).toBe(false);
  });

  it('returns empty id when disabled', () => {
    manager.setEnabled(false);
    const id = manager.animate({ duration: 100 });
    expect(id).toBe('');
  });

  it('creates and cancels an animation', () => {
    const onFrame = vi.fn();
    const id = manager.animate({ duration: 1000, onFrame });
    expect(id).not.toBe('');
    manager.cancel(id);
  });

  it('provides animation stats', () => {
    const stats = manager.getStats();
    expect(stats).toHaveProperty('activeTasks');
    expect(stats).toHaveProperty('fps');
    expect(stats).toHaveProperty('targetFps');
    expect(stats).toHaveProperty('enabled');
    expect(stats).toHaveProperty('running');
    expect(stats).toHaveProperty('performanceTier');
  });

  it('registers fps callback', () => {
    const cb = vi.fn();
    manager.onFpsUpdate(cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('promotes and demotes layer', () => {
    const el = document.createElement('div');
    manager.promoteLayer(el, ['transform'], 100);
    expect(el.style.willChange).toBe('transform');
    manager.demoteLayer(el);
    expect(el.style.willChange).toBe('auto');
  });

  it('handles easing functions', () => {
    expect(AnimationManager.easings.linear(0.5)).toBe(0.5);
    expect(AnimationManager.easings.easeIn(0.5)).toBe(0.25);
    expect(AnimationManager.easings.easeOut(0.5)).toBe(0.75);
    expect(AnimationManager.easings.bounce(1)).toBeCloseTo(1);
  });
});

describe('detectPerformanceTier', () => {
  it('returns high when window is undefined', () => {
    const originalWindow = global.window;
    // @ts-expect-error
    global.window = undefined;
    expect(detectPerformanceTier()).toBe('high');
    global.window = originalWindow;
  });
});

describe('prefersReducedMotion', () => {
  it('returns false when window is undefined', () => {
    const originalWindow = global.window;
    // @ts-expect-error
    global.window = undefined;
    expect(prefersReducedMotion()).toBe(false);
    global.window = originalWindow;
  });
});
