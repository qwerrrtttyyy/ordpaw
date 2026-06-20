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
