/**
 * Shared frontend utilities — deduplicates the escapeHtml helper that was
 * previously copy-pasted across 5+ views.
 */

/**
 * Escape HTML special characters in a string for safe insertion as text content.
 */
export function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * 防抖函数 - 延迟执行以避免频繁调用
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
 * 检测操作系统类型
 */
export type OSType = 'windows' | 'macos' | 'linux' | 'unknown';

export function detectOS(): OSType {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

/**
 * 应用操作系统特定的样式效果
 */
export function applyOSEffects(os: OSType) {
  const root = document.documentElement;
  root.setAttribute('data-os', os);

  switch (os) {
    case 'macos':
      root.style.setProperty('--os-blur-intensity', '20px');
      root.style.setProperty('--os-shadow-soft', '0 8px 32px rgba(0, 0, 0, 0.12)');
      root.style.setProperty('--os-animation-curve', 'cubic-bezier(0.4, 0, 0.2, 1)');
      root.style.setProperty('--os-border-radius', '12px');
      break;
    case 'windows':
      root.style.setProperty('--os-blur-intensity', '10px');
      root.style.setProperty('--os-shadow-soft', '0 4px 16px rgba(0, 0, 0, 0.15)');
      root.style.setProperty('--os-animation-curve', 'cubic-bezier(0, 0, 1, 1)');
      root.style.setProperty('--os-border-radius', '4px');
      break;
    case 'linux':
      root.style.setProperty('--os-blur-intensity', '15px');
      root.style.setProperty('--os-shadow-soft', '0 6px 24px rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--os-animation-curve', 'cubic-bezier(0.25, 0.1, 0.25, 1)');
      root.style.setProperty('--os-border-radius', '8px');
      break;
    default:
      root.style.setProperty('--os-blur-intensity', '12px');
      root.style.setProperty('--os-shadow-soft', '0 4px 20px rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--os-animation-curve', 'ease-out');
      root.style.setProperty('--os-border-radius', '8px');
  }
}

/**
 * 获取操作系统特定的动画持续时间
 */
export function getOSAnimationDuration(os: OSType): number {
  switch (os) {
    case 'macos': return 400;
    case 'windows': return 250;
    case 'linux': return 300;
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