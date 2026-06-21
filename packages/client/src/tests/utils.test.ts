import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as utils from '../utils';

const { detectOS, applyOSEffects, getOSAnimationDuration, debounce, throttle, transitionTheme } = utils;

describe('OS Detection', () => {
  it('should detect macOS', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true
    });
    expect(detectOS()).toBe('macos');
  });

  it('should detect Windows', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      configurable: true
    });
    expect(detectOS()).toBe('windows');
  });

  it('should detect Linux', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64)',
      configurable: true
    });
    expect(detectOS()).toBe('linux');
  });

  it('should return unknown for unrecognized UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Some Custom Browser/1.0',
      configurable: true
    });
    expect(detectOS()).toBe('unknown');
  });
});

describe('applyOSEffects', () => {
  it('should set data-os attribute on html', () => {
    applyOSEffects('macos');
    expect(document.documentElement.getAttribute('data-os')).toBe('macos');
  });

  it('should set macOS-specific CSS variables', () => {
    applyOSEffects('macos');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--os-blur-intensity')).toBe('20px');
    expect(root.style.getPropertyValue('--os-border-radius')).toBe('12px');
  });

  it('should set Windows-specific CSS variables', () => {
    applyOSEffects('windows');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--os-blur-intensity')).toBe('10px');
    expect(root.style.getPropertyValue('--os-border-radius')).toBe('4px');
  });

  it('should set Linux-specific CSS variables', () => {
    applyOSEffects('linux');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--os-blur-intensity')).toBe('15px');
    expect(root.style.getPropertyValue('--os-border-radius')).toBe('8px');
  });
});

describe('getOSAnimationDuration', () => {
  it('should return 400 for macOS', () => {
    expect(getOSAnimationDuration('macos')).toBe(400);
  });

  it('should return 250 for Windows', () => {
    expect(getOSAnimationDuration('windows')).toBe(250);
  });

  it('should return 300 for Linux', () => {
    expect(getOSAnimationDuration('linux')).toBe(300);
  });

  it('should return 300 for unknown', () => {
    expect(getOSAnimationDuration('unknown')).toBe(300);
  });
});

describe('escapeHtml', () => {
  it('should escape HTML special characters', async () => {
    const { escapeHtml } = await import('./utils');
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
  });

  it('should handle null and undefined', async () => {
    const { escapeHtml } = await import('./utils');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should convert numbers to strings', async () => {
    const { escapeHtml } = await import('./utils');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "just now" for recent times', async () => {
    const { formatRelativeTime } = await import('./utils');
    expect(formatRelativeTime(Date.now() - 30000, 'en-US')).toBe('just now');
  });

  it('should return minutes ago', async () => {
    const { formatRelativeTime } = await import('./utils');
    expect(formatRelativeTime(Date.now() - 5 * 60_000, 'en-US')).toBe('5m ago');
  });

  it('should return hours ago', async () => {
    const { formatRelativeTime } = await import('./utils');
    expect(formatRelativeTime(Date.now() - 3 * 3_600_000, 'en-US')).toBe('3h ago');
  });

  it('should return days ago', async () => {
    const { formatRelativeTime } = await import('./utils');
    expect(formatRelativeTime(Date.now() - 2 * 86_400_000, 'en-US')).toBe('2d ago');
  });

  it('should return Chinese strings for zh-CN locale', async () => {
    const { formatRelativeTime } = await import('./utils');
    expect(formatRelativeTime(Date.now() - 5 * 60_000, 'zh-CN')).toBe('5 分钟前');
  });
});

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should cancel previous call when called again', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    vi.advanceTimersByTime(50);
    debounced('b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('should pass multiple arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced(1, 'two', { three: 3 });
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith(1, 'two', { three: 3 });
  });
});

describe('throttle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should execute immediately', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should ignore calls within the throttle window', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should allow execution after the window expires', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('transitionTheme', () => {
  it('should add theme-transitioning class and call apply', () => {
    const apply = vi.fn();
    transitionTheme(apply, 50);
    expect(apply).toHaveBeenCalled();
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(true);
  });

  it('should remove the class after duration', () => {
    vi.useFakeTimers();
    transitionTheme(() => {}, 100);
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(true);
    vi.advanceTimersByTime(150);
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);
    vi.useRealTimers();
  });
});
