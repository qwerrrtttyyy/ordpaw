import { API } from '../api';
import { Store } from '../store';
import { t } from '../i18n';
import type { Agent, InstalledSkill } from '@ordpaw/shared';

const PRESETS = [
  {
    id: 'starter',
    icon: '🐾',
    name: { zh: '入门套件', en: 'Starter Kit' },
    desc: {
      zh: '创建一个通用助手 Agent 和两个示例脚本',
      en: 'A general assistant agent and two sample scripts',
    },
  },
  {
    id: 'writer',
    icon: '✍️',
    name: { zh: '写作助手', en: 'Writing Assistant' },
    desc: {
      zh: '用于文章改写、润色和摘要的 Agent',
      en: 'Agent for rewriting, polishing and summarizing',
    },
  },
  {
    id: 'coder',
    icon: '💻',
    name: { zh: '代码专家', en: 'Code Expert' },
    desc: {
      zh: '擅长解释代码、生成 HTML 预览的 Agent',
      en: 'Agent good at explaining code and HTML preview',
    },
  },
];

export class Dashboard {
  private api: API;
  private store: Store;
  private onStatsChange: () => Promise<void>;

  constructor(api: API, store: Store, onStatsChange: () => Promise<void>) {
    this.api = api;
    this.store = store;
    this.onStatsChange = onStatsChange;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const locale = this.store.getLocale();
    const stats = await this.api.getStats();
    const agents = await this.api.getAgents();
    const skills = await this.api.getSkills();

    content.innerHTML = `
      <div class="slide-up">
        <div class="welcome">
          <div class="welcome-mark">A</div>
          <h1 class="welcome-title">${t('app.welcome.title')}</h1>
          <p class="welcome-subtitle">${t('app.welcome.subtitle')}</p>
          <div class="welcome-actions">
            <button class="btn btn-primary btn-lg" id="quickAgent">${t('app.welcome.createAgent')}</button>
            <button class="btn btn-secondary btn-lg" id="quickConv">${t('app.welcome.newConversation')}</button>
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header">
            <div>
              <div class="card-title">${t('preset.title')}</div>
              <div class="card-subtitle">${t('preset.subtitle')}</div>
            </div>
          </div>
          <div class="preset-grid">
            ${PRESETS.map(
              (p) => `
              <div class="preset-card" data-preset="${p.id}">
                <div class="preset-icon">${p.icon}</div>
                <div class="preset-name">${p.name[locale === 'en-US' ? 'en' : 'zh']}</div>
                <div class="preset-desc">${p.desc[locale === 'en-US' ? 'en' : 'zh']}</div>
              </div>
            `
            ).join('')}
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card accent">
            <div class="stat-header">
              <span class="stat-label">${t('nav.agents')}</span>
              <div class="stat-icon">◉</div>
            </div>
            <div class="stat-value">${stats.agents || 0}</div>
            <div class="stat-trend">${locale === 'en-US' ? 'agents' : '智能体'}</div>
          </div>

          <div class="stat-card sage">
            <div class="stat-header">
              <span class="stat-label">${t('nav.conversations')}</span>
              <div class="stat-icon">◈</div>
            </div>
            <div class="stat-value">${stats.conversations || 0}</div>
            <div class="stat-trend">${locale === 'en-US' ? 'chats' : '对话记录'}</div>
          </div>

          <div class="stat-card amber">
            <div class="stat-header">
              <span class="stat-label">${t('nav.scripts')}</span>
              <div class="stat-icon">▣</div>
            </div>
            <div class="stat-value">${stats.scripts || 0}</div>
            <div class="stat-trend">${locale === 'en-US' ? 'scripts' : '脚本'}</div>
          </div>

          <div class="stat-card violet">
            <div class="stat-header">
              <span class="stat-label">${t('nav.prompts')}</span>
              <div class="stat-icon">◍</div>
            </div>
            <div class="stat-value">${stats.prompts || 0}</div>
            <div class="stat-trend">${locale === 'en-US' ? 'templates' : '模板'}</div>
          </div>
        </div>

        <div class="grid grid-2">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">${locale === 'en-US' ? 'Recent Agents' : '最近的 Agent'}</div>
                <div class="card-subtitle">${locale === 'en-US' ? 'Your created agents' : '你创建的智能体'}</div>
              </div>
              <button class="btn btn-ghost btn-sm" id="viewAllAgents">${locale === 'en-US' ? 'View all' : '查看全部'}</button>
            </div>
            ${
              agents.length === 0
                ? `
              <div class="empty-state" style="padding: 32px 20px;">
                <div class="empty-state-icon">◉</div>
                <div class="empty-state-title">${locale === 'en-US' ? 'No agents yet' : '还没有 Agent'}</div>
                <div class="text-sm text-muted">${locale === 'en-US' ? 'Create your first agent' : '创建你的第一个智能体'}</div>
              </div>
            `
                : `
              <div class="flex flex-col gap-3">
                ${agents
                  .slice(0, 3)
                  .map(
                    (a: Agent) => `
                  <div class="list-item accent">
                    <div class="list-item-icon">◉</div>
                    <div class="list-item-body">
                      <div class="list-item-title">${a.name}</div>
                      <div class="list-item-meta">
                        <span class="badge badge-accent badge-dot">${a.model}</span>
                        <span>${a.description || (locale === 'en-US' ? 'No description' : '暂无描述')}</span>
                      </div>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
            }
          </div>

          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">${locale === 'en-US' ? 'Available Skills' : '可用技能'}</div>
                <div class="card-subtitle">${locale === 'en-US' ? 'Built-in and plugin skills' : '内置与插件技能'}</div>
              </div>
              <span class="badge badge-sage">${skills.length} ${locale === 'en-US' ? 'items' : '个'}</span>
            </div>
            <div class="flex flex-col gap-3">
              ${
                skills.length === 0
                  ? `
                <div class="empty-state" style="padding: 32px 20px;">
                  <div class="empty-state-icon">◇</div>
                  <div class="empty-state-title">${t('common.empty')}</div>
                </div>
              `
                  : skills
                      .slice(0, 4)
                      .map(
                        (s: InstalledSkill) => `
                <div class="list-item sage">
                  <div class="list-item-icon">◇</div>
                  <div class="list-item-body">
                    <div class="list-item-title">${s.name}</div>
                    <div class="list-item-meta">${s.description || ''}</div>
                  </div>
                </div>
              `
                      )
                      .join('')
              }
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('quickAgent')?.addEventListener('click', () => {
      window.location.hash = '#/agents';
    });
    document.getElementById('quickConv')?.addEventListener('click', () => {
      window.location.hash = '#/conversations';
    });
    document.getElementById('viewAllAgents')?.addEventListener('click', () => {
      window.location.hash = '#/agents';
    });

    content.querySelectorAll('[data-preset]').forEach((card) => {
      card.addEventListener('click', () => {
        const preset = (card as HTMLElement).getAttribute('data-preset');
        if (preset) this.applyPreset(preset);
      });
    });
  }

  private async applyPreset(id: string) {
    const locale = this.store.getLocale();
    try {
      if (id === 'starter') {
        await this.api.createAgent({
          name: locale === 'en-US' ? 'General Assistant' : '通用助手',
          description:
            locale === 'en-US'
              ? 'A helpful assistant with ScriptMCP'
              : '一个可以使用 ScriptMCP 的有用助手',
          systemPrompt:
            locale === 'en-US'
              ? 'You are a helpful assistant. You can use ScriptMCP tools to create, write, save, delete, list or execute scripts when needed.'
              : '你是一个有帮助的助手。你可以在需要时使用 ScriptMCP 工具创建、写入、保存、删除、列出或执行脚本。',
          model: 'gpt-4',
        });
        await this.api.createScript({
          name: 'hello-world',
          description: locale === 'en-US' ? 'Greeting script' : '问候脚本',
          code: `function main(args) {\n  return { greeting: 'Hello, ' + (args.name || 'OrdPaw') + '!' };\n}\nmain($args);`,
          language: 'javascript',
        });
      } else if (id === 'writer') {
        await this.api.createAgent({
          name: locale === 'en-US' ? 'Writing Assistant' : '写作助手',
          description:
            locale === 'en-US' ? 'Polish, rewrite and summarize text' : '润色、改写和摘要文本',
          systemPrompt:
            locale === 'en-US'
              ? 'You are a writing assistant. Improve clarity, grammar, and style. Support Chinese and English.'
              : '你是写作助手。提升清晰度、语法和风格。支持中文和英文。',
          model: 'gpt-4',
        });
        await this.api.createPrompt({
          name: locale === 'en-US' ? 'Polish Text' : '润色文本',
          category: '写作',
          content: '请润色以下文本，使其更流畅、专业：\n\n{{text}}',
          variables: [{ name: 'text', description: '需要润色的文本', required: true }],
        });
      } else if (id === 'coder') {
        await this.api.createAgent({
          name: locale === 'en-US' ? 'Code Expert' : '代码专家',
          description:
            locale === 'en-US'
              ? 'Explain code and generate HTML previews'
              : '解释代码并生成 HTML 预览',
          systemPrompt:
            locale === 'en-US'
              ? 'You are a coding expert. Explain code clearly. When generating HTML/CSS/JS examples, wrap them in markdown code blocks so the UI can render previews.'
              : '你是代码专家。清晰地解释代码。当生成 HTML/CSS/JS 示例时，请用 markdown 代码块包裹，以便 UI 渲染预览。',
          model: 'gpt-4',
        });
      }
      await this.onStatsChange();
      await this.render();
      const msg = locale === 'en-US' ? 'Preset applied successfully' : '预设应用成功';
      this.toast(msg);
    } catch (err: unknown) {
      this.toast(err instanceof Error ? err.message : 'Failed');
    }
  }

  private toast(message: string) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }
}
