import type { Locale } from '@ordpaw/shared';
import type { I18nKey } from './zh';
import { zh } from './zh';
import { en } from './en';

const dictionaries: Record<Locale, Record<I18nKey, string>> = { 'zh-CN': zh, 'en-US': en };

let currentLocale: Locale = 'zh-CN';

export function setLocale(locale: Locale) {
  currentLocale = dictionaries[locale] ? locale : 'zh-CN';
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: I18nKey, fallback?: string): string {
  return dictionaries[currentLocale][key] ?? fallback ?? key;
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleString(currentLocale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  const minutes = Math.floor(diff / 60);
  const hours = Math.floor(diff / 3600);
  const days = Math.floor(diff / 86400);

  if (currentLocale === 'en-US') {
    if (diff < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  if (diff < 60) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}
