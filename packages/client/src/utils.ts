/**
 * Shared frontend utilities — deduplicates the escapeHtml helper that was
 * previously copy-pasted across 5+ views.
 */

/**
 * Escape HTML special characters in a string for safe insertion as text content.
 *
 * Uses the DOM-based approach (textContent → innerHTML) which is safer than
 * regex-based escaping because it handles all edge cases including quotes
 * inside attribute values and never misses an entity.
 */
export function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * 防抖函数 - 延迟执行以避免频繁调用
 * 用于搜索框、滚动事件、resize 等高频操作
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 200
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * 节流函数 - 限制单位时间内的执行次数
 * 用于动画、滚动等需要流畅体验的场景
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number = 100
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 带过渡动画的主题切换
 * 在 DOM 上添加过渡类、切换属性、然后清理
 */
export function transitionTheme(apply: () => void, duration: number = 300): void {
  const html = document.documentElement;
  html.classList.add('theme-transitioning');
  apply();
  setTimeout(() => {
    html.classList.remove('theme-transitioning');
  }, duration);
}

/**
 * Format a timestamp as a relative time string.
 * Locale-aware: uses zh-CN strings for 'zh-CN' locale, English otherwise.
 */
export function formatRelativeTime(timestamp: number, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 0) return locale === 'zh-CN' ? '刚刚' : 'just now';
  if (diff < 60_000) return locale === 'zh-CN' ? '刚刚' : 'just now';
  if (diff < 3_600_000) {
    const mins = Math.floor(diff / 60_000);
    return locale === 'zh-CN' ? `${mins} 分钟前` : `${mins}m ago`;
  }
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000);
    return locale === 'zh-CN' ? `${hours} 小时前` : `${hours}h ago`;
  }
  if (diff < 7 * 86_400_000) {
    const days = Math.floor(diff / 86_400_000);
    return locale === 'zh-CN' ? `${days} 天前` : `${days}d ago`;
  }
  const d = new Date(timestamp);
  return d.toLocaleDateString(locale);
}

/**
 * Show a transient toast notification at the bottom of the screen.
 * Auto-removes after 2.4s.
 */
export function showToast(message: string, durationMs = 2400): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), durationMs);
}

/**
 * Build a modal overlay element appended to document.body.
 * Returns the overlay element and a close() function.
 *
 * Used to deduplicate the createModal() pattern across views.
 */
export function createModal(opts: {
  title: string;
  bodyHtml: string;
  confirmText?: string;
  cancelText?: string;
  onMount?: (overlay: HTMLElement) => void;
  onSubmit?: (overlay: HTMLElement) => Promise<boolean | void> | boolean | void;
}): { overlay: HTMLElement; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <div class="modal-header">
      <div class="modal-title">${escapeHtml(opts.title)}</div>
      <button class="modal-close" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">${opts.bodyHtml}</div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-action="cancel">${escapeHtml(opts.cancelText ?? '取消')}</button>
      <button class="btn btn-primary" data-action="confirm">${escapeHtml(opts.confirmText ?? '确定')}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  if (opts.onMount) opts.onMount(overlay);
  if (opts.onSubmit) {
    overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', async () => {
      const result = await opts.onSubmit!(overlay);
      if (result !== false) close();
    });
  }

  return { overlay, close };
}

/**
 * 检测操作系统类型（含移动端 iOS / Android）
 */
export type OSType = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';

export function detectOS(): OSType {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(ua) || platform.startsWith('mac') && 'ontouchend' in document) {
    // iPadOS 上 userAgent 会伪装成 Mac，触摸检测可区分
    if (/iphone|ipod/.test(ua)) return 'ios';
    if (platform === 'iphone' || platform === 'ipad' || platform === 'ipod') return 'ios';
    // 同时有 maxTouchPoints 检测 iPadOS
    if ((navigator as any).maxTouchPoints && (navigator as any).maxTouchPoints > 1) return 'ios';
  }
  if (/mac/.test(ua) || platform.startsWith('mac')) return 'macos';
  if (/win/.test(ua) || platform.startsWith('win')) return 'windows';
  if (/android/.test(ua)) return 'android';
  if (/linux/.test(ua) || platform.startsWith('linux')) return 'linux';
  return 'unknown';
}

/**
 * 应用操作系统特定的样式效果
 * 将 OSType 编码为 CSS 自定义属性（通过 html[data-os] 选择器可进一步自定义）
 */
export function applyOSEffects(os: OSType) {
  const root = document.documentElement;
  root.setAttribute('data-os', os);

  const preset: Record<OSType, { blur: string; shadow: string; easing: string; radius: string; duration: number }> = {
    macos: {
      blur: '20px',
      shadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      radius: '12px',
      duration: 380
    },
    ios: {
      blur: '24px',
      shadow: '0 6px 24px rgba(0, 0, 0, 0.18)',
      easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      radius: '14px',
      duration: 320
    },
    windows: {
      blur: '10px',
      shadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
      easing: 'cubic-bezier(0.1, 0.9, 0.2, 1)',
      radius: '6px',
      duration: 220
    },
    linux: {
      blur: '15px',
      shadow: '0 6px 24px rgba(0, 0, 0, 0.10)',
      easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      radius: '9px',
      duration: 300
    },
    android: {
      blur: '12px',
      shadow: '0 4px 20px rgba(0, 0, 0, 0.14)',
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      radius: '8px',
      duration: 260
    },
    unknown: {
      blur: '12px',
      shadow: '0 4px 20px rgba(0, 0, 0, 0.10)',
      easing: 'ease-out',
      radius: '8px',
      duration: 300
    }
  };

  const p = preset[os];
  root.style.setProperty('--os-blur-intensity', p.blur);
  root.style.setProperty('--os-shadow-soft', p.shadow);
  root.style.setProperty('--os-animation-curve', p.easing);
  root.style.setProperty('--os-border-radius', p.radius);
  root.style.setProperty('--os-animation-duration', `${p.duration}ms`);
}

/**
 * 获取操作系统特定的动画持续时间
 */
export function getOSAnimationDuration(os: OSType): number {
  switch (os) {
    case 'macos': return 380;
    case 'ios': return 320;
    case 'windows': return 220;
    case 'linux': return 300;
    case 'android': return 260;
    default: return 300;
  }
}

/**
 * 检测用户是否偏好减少动画
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
