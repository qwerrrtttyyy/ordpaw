import type { McpServer, InstalledSkill } from '@ordpaw/shared';
import { API } from '../api.js';
import { escapeHtml, showToast, createModal } from '../utils.js';
import { t } from '../i18n';

type TabId = 'mcp' | 'skills';

export class McpSkillsView {
  private tab: TabId = 'mcp';
  private container: HTMLElement;
  private api: API;
  private contentEl: HTMLElement | null = null;
  private mcpServers: McpServer[] = [];
  private installedSkills: InstalledSkill[] = [];

  constructor(api: API) {
    this.api = api;
    this.container = document.createElement('div');
  }

  async init(container: HTMLElement): Promise<void> {
    this.container = container;
    this.container.innerHTML = `
      <div class="mcp-skills-page slide-up">
        <div class="page-header">
          <h2>⚡ ${t('mcpSkills.title')}</h2>
          <p class="text-muted">${t('mcpSkills.subtitle')}</p>
        </div>
        <div class="mcp-skills-tabs" id="mcpSkillsTabs">
          <button class="tab-btn active" data-tab="mcp">${t('mcpSkills.tabMcp')} <span class="badge" id="mcpBadge">0</span></button>
          <button class="tab-btn" data-tab="skills">${t('mcpSkills.tabSkills')} <span class="badge" id="skillsBadge">0</span></button>
        </div>
        <div class="mcp-skills-content" id="mcpSkillsContent"></div>
      </div>
    `;

    this.contentEl = this.container.querySelector('#mcpSkillsContent');

    // Tab switching
    const tabContainer = this.container.querySelector('#mcpSkillsTabs');
    tabContainer?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.tab-btn') as HTMLElement;
      if (!btn) return;
      const tab = btn.dataset.tab as TabId;
      tabContainer.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      this.tab = tab;
      this.render();
    });

    await this.loadData();
    this.render();
  }

  private async loadData(): Promise<void> {
    try {
      this.mcpServers = await this.api.getMcpServers();
    } catch {
      this.mcpServers = [];
    }
    try {
      this.installedSkills = (await this.api.getSkills()) as InstalledSkill[];
    } catch {
      this.installedSkills = [];
    }

    // Update badges
    const mcpBadge = this.container.querySelector('#mcpBadge');
    const skillsBadge = this.container.querySelector('#skillsBadge');
    if (mcpBadge) mcpBadge.textContent = String(this.mcpServers.length);
    if (skillsBadge) skillsBadge.textContent = String(this.installedSkills.length);
  }

  private render() {
    if (!this.contentEl) return;
    this.contentEl.innerHTML = '';

    if (this.tab === 'mcp') {
      this.renderMcpTab();
    } else {
      this.renderSkillsTab();
    }
  }

  // ============ MCP Tab ============
  private renderMcpTab() {
    if (!this.contentEl) return;

    const header = document.createElement('div');
    header.className = 'mcp-skills-actions';
    header.innerHTML = `
      <p class="text-muted">${t('mcpSkills.mcpDesc')}</p>
      <button class="btn btn-primary" id="installMcpBtn">+ ${t('mcpSkills.installMcp')}</button>
    `;
    this.contentEl.appendChild(header);

    const list = document.createElement('div');
    list.className = 'mcp-server-list';

    if (this.mcpServers.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>${t('mcpSkills.mcpEmpty')}</p>
          <p class="text-muted">${t('mcpSkills.mcpEmptyHint')}</p>
        </div>
      `;
    } else {
      for (const server of this.mcpServers) {
        const card = document.createElement('div');
        card.className = 'mcp-server-card';
        card.innerHTML = `
          <div class="mcp-server-info">
            <strong>${escapeHtml(server.name)}</strong>
            <span class="text-muted">${server.transport}</span>
            ${server.command ? `<code>${escapeHtml(server.command)}</code>` : ''}
            ${server.url ? `<code>${escapeHtml(server.url)}</code>` : ''}
            <span class="status-badge ${server.connected ? 'connected' : 'disconnected'}">
              ${server.connected ? '🟢 ' + t('mcpSkills.connected') : '🔴 ' + t('mcpSkills.disconnected')}
            </span>
          </div>
          <div class="mcp-server-actions">
            <button class="btn btn-sm ${server.connected ? 'btn-warning' : 'btn-primary'}" data-action="${server.connected ? 'disconnect' : 'connect'}" data-id="${server.id}">
              ${server.connected ? t('mcpSkills.disconnect') : t('mcpSkills.connect')}
            </button>
            <button class="btn btn-sm btn-danger" data-action="uninstall" data-id="${server.id}">${t('mcpSkills.uninstall')}</button>
          </div>
        `;

        card.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = (e.currentTarget as HTMLElement).dataset.action;
            const id = (e.currentTarget as HTMLElement).dataset.id;
            if (!action || !id) return;
            await this.handleMcpAction(action, id);
          });
        });

        list.appendChild(card);
      }
    }

    this.contentEl.appendChild(list);

    // Install button
    this.contentEl.querySelector('#installMcpBtn')?.addEventListener('click', () => {
      this.showInstallMcpModal();
    });
  }

  private async handleMcpAction(action: string, id: string) {
    try {
      if (action === 'connect') {
        await this.api.connectMcpServer(id);
        showToast('MCP 连接成功');
      } else if (action === 'disconnect') {
        await this.api.disconnectMcpServer(id);
        showToast('MCP 已断开');
      } else if (action === 'uninstall') {
        if (!confirm(t('mcpSkills.confirmUninstall'))) return;
        await this.api.uninstallMcpServer(id);
        showToast('MCP 已卸载');
      }
      await this.loadData();
      this.render();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  }

  private showInstallMcpModal() {
    let transport: McpServer['transport'] = 'stdio';

    createModal({
      title: t('mcpSkills.installMcp'),
      bodyHtml: `
        <div class="form-group">
          <label>${t('mcpSkills.name')}</label>
          <input class="form-input" id="mcpName" placeholder="my-server" />
        </div>
        <div class="form-group">
          <label>${t('mcpSkills.transport')}</label>
          <select class="form-input" id="mcpTransport">
            <option value="stdio">stdio</option>
            <option value="sse">SSE</option>
            <option value="websocket">WebSocket</option>
          </select>
        </div>
        <div class="form-group" id="mcpCommandGroup">
          <label>${t('mcpSkills.command')}</label>
          <input class="form-input" id="mcpCommand" placeholder="npx @modelcontextprotocol/server-filesystem" />
        </div>
        <div class="form-group" id="mcpUrlGroup" style="display:none">
          <label>URL</label>
          <input class="form-input" id="mcpUrl" placeholder="http://localhost:8080" />
        </div>
        <div class="form-group">
          <label>${t('mcpSkills.env')}</label>
          <textarea class="form-input" id="mcpEnv" rows="3" placeholder='{"KEY": "value"}'></textarea>
        </div>
      `,
      confirmText: t('mcpSkills.installMcp'),
      cancelText: '取消',
      onMount: (overlayEl) => {
        const transportSelect = overlayEl.querySelector('#mcpTransport') as HTMLSelectElement;
        transportSelect?.addEventListener('change', () => {
          transport = transportSelect.value as McpServer['transport'];
          const cmdGroup = overlayEl.querySelector('#mcpCommandGroup') as HTMLElement;
          const urlGroup = overlayEl.querySelector('#mcpUrlGroup') as HTMLElement;
          if (transport === 'stdio') {
            cmdGroup.style.display = '';
            urlGroup.style.display = 'none';
          } else {
            cmdGroup.style.display = 'none';
            urlGroup.style.display = '';
          }
        });
      },
      onSubmit: async (overlayEl) => {
        const name = (overlayEl.querySelector('#mcpName') as HTMLInputElement)?.value.trim();
        const command = (overlayEl.querySelector('#mcpCommand') as HTMLInputElement)?.value.trim();
        const url = (overlayEl.querySelector('#mcpUrl') as HTMLInputElement)?.value.trim();
        const envRaw = (overlayEl.querySelector('#mcpEnv') as HTMLTextAreaElement)?.value.trim();
        if (!name) {
          showToast(t('mcpSkills.nameRequired'));
          return false;
        }

        let env: Record<string, string> | undefined;
        if (envRaw) {
          try {
            env = JSON.parse(envRaw);
          } catch {
            showToast(t('mcpSkills.envInvalid'));
            return false;
          }
        }

        try {
          await this.api.installMcpServer({ name, transport, command, url, env });
          showToast('MCP 安装成功');
          await this.loadData();
          this.render();
        } catch (err: unknown) {
          showToast(err instanceof Error ? err.message : String(err));
          return false;
        }
      },
    });
  }

  // ============ Skills Tab ============
  private renderSkillsTab() {
    if (!this.contentEl) return;

    const header = document.createElement('div');
    header.className = 'mcp-skills-actions';
    header.innerHTML = `
      <p class="text-muted">${t('mcpSkills.skillsDesc')}</p>
      <button class="btn btn-primary" id="installSkillBtn">+ ${t('mcpSkills.installSkill')}</button>
    `;
    this.contentEl.appendChild(header);

    const list = document.createElement('div');
    list.className = 'skill-list';

    if (this.installedSkills.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>${t('mcpSkills.skillsEmpty')}</p>
          <p class="text-muted">${t('mcpSkills.skillsEmptyHint')}</p>
        </div>
      `;
    } else {
      for (const skill of this.installedSkills) {
        const card = document.createElement('div');
        card.className = 'skill-card';
        card.innerHTML = `
          <div class="skill-info">
            <strong>${escapeHtml(skill.name)}</strong>
            <span class="text-muted">${escapeHtml(skill.description || '')}</span>
            <span class="source-badge">${skill.source === 'builtin' ? '内置' : '用户'}</span>
            <pre class="skill-code-preview"><code>${escapeHtml((skill.code || '').slice(0, 200))}</code></pre>
          </div>
          <div class="skill-actions">
            <button class="btn btn-sm btn-primary" data-action="run" data-id="${skill.id}">${t('mcpSkills.run')}</button>
            ${skill.source !== 'builtin' ? `<button class="btn btn-sm btn-danger" data-action="uninstall" data-id="${skill.id}">${t('mcpSkills.uninstall')}</button>` : ''}
          </div>
          <div class="skill-result" id="skillResult_${skill.id}" style="display:none"></div>
        `;

        card.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = (e.currentTarget as HTMLElement).dataset.action;
            const id = (e.currentTarget as HTMLElement).dataset.id;
            if (!action || !id) return;
            if (action === 'run') {
              await this.runSkill(id);
            } else if (action === 'uninstall') {
              await this.uninstallSkill(id);
            }
          });
        });

        list.appendChild(card);
      }
    }

    this.contentEl.appendChild(list);

    // Install button
    this.contentEl.querySelector('#installSkillBtn')?.addEventListener('click', () => {
      this.showInstallSkillModal();
    });
  }

  private async runSkill(id: string) {
    const resultEl = this.container.querySelector(`#skillResult_${id}`) as HTMLElement;
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = '<p class="text-muted">执行中...</p>';
    }
    try {
      const result = await this.api.executeSkill(id);
      if (resultEl) {
        resultEl.innerHTML = `
          <div class="skill-result-content ${result.success ? 'success' : 'error'}">
            ${result.success ? '✅' : '❌'} ${escapeHtml(result.error || JSON.stringify(result.output || '成功'))}
          </div>
        `;
      }
    } catch (err: unknown) {
      if (resultEl) {
        resultEl.innerHTML = `<div class="skill-result-content error">❌ ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
      }
    }
  }

  private async uninstallSkill(id: string) {
    if (!confirm(t('mcpSkills.confirmUninstall'))) return;
    try {
      await this.api.uninstallSkill(id);
      showToast('技能已卸载');
      await this.loadData();
      this.render();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  }

  private showInstallSkillModal() {
    createModal({
      title: t('mcpSkills.installSkill'),
      bodyHtml: `
        <div class="form-group">
          <label>${t('mcpSkills.name')}</label>
          <input class="form-input" id="skillName" placeholder="my-skill" />
        </div>
        <div class="form-group">
          <label>${t('mcpSkills.skillDesc')}</label>
          <input class="form-input" id="skillDesc" placeholder="${t('mcpSkills.skillDescPlaceholder')}" />
        </div>
        <div class="form-group">
          <label>${t('mcpSkills.code')}</label>
          <textarea class="form-input code-input" id="skillCode" rows="10" placeholder="return { greeting: 'Hello, ' + (args.name || 'world') };" spellcheck="false"></textarea>
        </div>
      `,
      confirmText: t('mcpSkills.installSkill'),
      cancelText: '取消',
      onSubmit: async (overlayEl) => {
        const name = (overlayEl.querySelector('#skillName') as HTMLInputElement)?.value.trim();
        const description = (
          overlayEl.querySelector('#skillDesc') as HTMLInputElement
        )?.value.trim();
        const code = (overlayEl.querySelector('#skillCode') as HTMLTextAreaElement)?.value.trim();
        if (!name) {
          showToast(t('mcpSkills.nameRequired'));
          return false;
        }
        if (!code) {
          showToast(t('mcpSkills.codeRequired'));
          return false;
        }

        try {
          await this.api.installSkill({ name, description, code });
          showToast('技能安装成功');
          await this.loadData();
          this.render();
        } catch (err: unknown) {
          showToast(err instanceof Error ? err.message : String(err));
          return false;
        }
      },
    });
  }
}
