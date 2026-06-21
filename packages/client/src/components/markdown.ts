import { t } from '../i18n';

export interface RenderOptions {
  htmlPreview?: boolean;
}

export class MarkdownRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(source: string) {
    this.container.innerHTML = this.parse(source);
    this.attachCodeActions();
  }

  private parse(source: string): string {
    const lines = source.split('\n');
    const out: string[] = [];
    let inCode = false;
    let codeLang = '';
    let codeBuffer: string[] = [];
    let inList = false;
    let listType: 'ul' | 'ol' | null = null;

    const flushCode = () => {
      if (!inCode) return;
      inCode = false;
      const rawCode = codeBuffer.join('\n');
      const code = this.escapeHtml(rawCode);
      const encodedCode = this.encodeAttr(rawCode);
      const langClass = codeLang ? `language-${codeLang}` : '';
      const previewId = `code-preview-${Math.random().toString(36).slice(2, 10)}`;
      const isHtml = codeLang === 'html';
      out.push(`<div class="code-block">
        <div class="code-header">
          <span class="code-lang">${codeLang || 'text'}</span>
          <div class="code-actions">
            ${isHtml ? `<button class="code-action-btn preview-btn" data-preview="${previewId}" data-code="${encodedCode}">${t('markdown.previewHtml')}</button>` : ''}
            <button class="code-action-btn copy-btn" data-code="${encodedCode}">${t('markdown.copyCode')}</button>
          </div>
        </div>
        <pre class="code-body"><code class="${langClass}">${code}</code></pre>
        ${isHtml ? `<div class="code-preview" id="${previewId}" style="display:none"><iframe sandbox="allow-scripts"></iframe></div>` : ''}
      </div>`);
      codeBuffer = [];
      codeLang = '';
    };

    const flushList = () => {
      if (!inList || !listType) return;
      out.push(`</${listType}>`);
      inList = false;
      listType = null;
    };

    for (const raw of lines) {
      const line = raw.replace(/\r$/, '');

      if (line.startsWith('```')) {
        if (inCode) {
          flushCode();
        } else {
          flushList();
          inCode = true;
          codeLang = line.slice(3).trim();
        }
        continue;
      }

      if (inCode) {
        codeBuffer.push(line);
        continue;
      }

      // headers
      if (/^#{1,6}\s+/.test(line)) {
        flushList();
        const level = line.match(/^(#{1,6})\s+/)![1].length;
        const text = line.slice(level + 1).trim();
        out.push(`<h${level}>${this.inline(text)}</h${level}>`);
        continue;
      }

      // blockquote
      if (line.startsWith('> ')) {
        flushList();
        out.push(`<blockquote>${this.inline(line.slice(2))}</blockquote>`);
        continue;
      }

      // unordered list
      if (/^[-*+]\s+/.test(line)) {
        if (!inList || listType !== 'ul') {
          flushList();
          out.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        out.push(`<li>${this.inline(line.replace(/^[-*+]\s+/, ''))}</li>`);
        continue;
      }

      // ordered list
      if (/^\d+\.\s+/.test(line)) {
        if (!inList || listType !== 'ol') {
          flushList();
          out.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        out.push(`<li>${this.inline(line.replace(/^\d+\.\s+/, ''))}</li>`);
        continue;
      }

      if (line.trim() === '') {
        flushList();
        continue;
      }

      flushList();
      out.push(`<p>${this.inline(line)}</p>`);
    }

    flushCode();
    flushList();
    return out.join('\n');
  }

  private inline(text: string): string {
    return text
      .replace(/```([^`]+)```/g, '<code>$1</code>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private encodeAttr(str: string): string {
    return this.escapeHtml(str);
  }

  private decodeAttr(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
  }

  private attachCodeActions() {
    this.container.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = this.decodeAttr(btn.getAttribute('data-code') || '');
        navigator.clipboard.writeText(code).then(() => {
          const original = btn.textContent || '';
          btn.textContent = t('common.copied');
          setTimeout(() => (btn.textContent = original), 1500);
        });
      });
    });

    this.container.querySelectorAll('.preview-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-preview');
        const preview = this.container.querySelector(`#${id}`) as HTMLElement | null;
        if (!preview) return;
        const isHidden = preview.style.display === 'none';
        preview.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          const code = this.decodeAttr(btn.getAttribute('data-code') || '');
          const iframe = preview.querySelector('iframe') as HTMLIFrameElement;
          if (iframe) iframe.srcdoc = code;
        }
      });
    });
  }
}
