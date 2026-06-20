import { API } from '../api';
import { Store } from '../store';
import { t } from '../i18n';
import type { ThemeId, Locale } from '@ordpaw/shared';

const THEMES: ThemeId[] = ['ordpaw-light', 'ordpaw-dark', 'ordpaw-twilight', 'minimal', 'forest', 'ocean', 'neon', 'material'];

export class SettingsView {
  private api: API;
  private store: Store;
  private onThemeChange: () => void;

  constructor(api: API, store: Store, onThemeChange: () => void) {
    this.api = api;
    this.store = store;
    this.onThemeChange = onThemeChange;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const settings = this.store.getSettings();
    const currentTheme = settings.theme || 'ordpaw-light';
    const currentLocale = settings.locale || 'zh-CN';
    const isEn = currentLocale === 'en-US';

    content.innerHTML = `
      <div class="slide-up">
        <div class="section-header">
          <div>
            <div class="section-title">${t('settings.title')}</div>
            <div class="text-sm text-muted mt-2">${isEn ? 'Personalize your workspace' : '个性化你的工作台'}</div>
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header">
            <div>
              <div class="card-title">${t('settings.language')}</div>
              <div class="card-subtitle">${isEn ? 'Choose interface language' : '选择界面语言'}</div>
            </div>
          </div>
          <div class="flex gap-3">
            <button class="btn ${currentLocale === 'zh-CN' ? 'btn-primary' : 'btn-secondary'}" data-locale="zh-CN">中文</button>
            <button class="btn ${currentLocale === 'en-US' ? 'btn-primary' : 'btn-secondary'}" data-locale="en-US">English</button>
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header">
            <div>
              <div class="card-title">${isEn ? 'Interface Mode' : '界面模式'}</div>
              <div class="card-subtitle">${isEn ? 'Switch between classic and modern UI' : '在经典界面与新版界面之间切换'}</div>
            </div>
          </div>
          <div class="flex gap-3">
            <button class="btn ${this.store.getUIMode() === 'classic' ? 'btn-primary' : 'btn-secondary'}" id="uiModeClassic">
              ${isEn ? 'Classic' : '经典'}
            </button>
            <button class="btn ${this.store.getUIMode() === 'modern' ? 'btn-primary' : 'btn-secondary'}" id="uiModeModern">
              ${isEn ? 'Modern' : '新版'}
            </button>
          </div>
        </div>

        <div class="card mb-6" id="modernEffectsCard" style="${this.store.getUIMode() === 'modern' ? '' : 'display:none'}">
          <div class="card-header">
            <div>
              <div class="card-title">${isEn ? 'Modern Effects' : '新版动效'}</div>
              <div class="card-subtitle">${isEn ? 'Adjust glass, motion and glow intensity' : '调整玻璃质感、动画和光晕强度'}</div>
            </div>
          </div>
          <div class="flex gap-3">
            <button class="btn ${this.store.getUIEffects() === 'minimal' ? 'btn-primary' : 'btn-secondary'}" id="uiEffectsMinimal">
              ${isEn ? 'Minimal' : '极简'}
            </button>
            <button class="btn ${this.store.getUIEffects() === 'balanced' ? 'btn-primary' : 'btn-secondary'}" id="uiEffectsBalanced">
              ${isEn ? 'Balanced' : '均衡'}
            </button>
            <button class="btn ${this.store.getUIEffects() === 'expressive' ? 'btn-primary' : 'btn-secondary'}" id="uiEffectsExpressive">
              ${isEn ? 'Expressive' : '华丽'}
            </button>
          </div>
        </div>

        <div class="card mb-6" id="performanceCard" style="${this.store.getUIMode() === 'modern' ? '' : 'display:none'}">
          <div class="card-header">
            <div>
              <div class="card-title">${t('settings.performance')}</div>
              <div class="card-subtitle">${isEn ? 'Optimize animation quality for your device' : '根据设备性能调整动画质量'}</div>
            </div>
          </div>
          <div class="flex gap-3">
            <button class="btn ${this.store.getPerformanceMode() === 'auto' ? 'btn-primary' : 'btn-secondary'}" id="perfModeAuto">
              ${isEn ? 'Auto' : '自动'}
            </button>
            <button class="btn ${this.store.getPerformanceMode() === 'high' ? 'btn-primary' : 'btn-secondary'}" id="perfModeHigh">
              ${isEn ? 'Quality' : '画质'}
            </button>
            <button class="btn ${this.store.getPerformanceMode() === 'medium' ? 'btn-primary' : 'btn-secondary'}" id="perfModeMedium">
              ${isEn ? 'Balanced' : '平衡'}
            </button>
            <button class="btn ${this.store.getPerformanceMode() === 'low' ? 'btn-primary' : 'btn-secondary'}" id="perfModeLow">
              ${isEn ? 'Power Save' : '省电'}
            </button>
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header">
            <div>
              <div class="card-title">${t('settings.appearance')}</div>
              <div class="card-subtitle">${isEn ? 'Choose your theme style' : '选择你喜欢的主题风格'}</div>
            </div>
          </div>
          <div class="theme-grid">
            ${THEMES.map(theme => `
              <div class="theme-card ${currentTheme === theme ? 'active' : ''}" data-theme="${theme}">
                <div class="theme-preview" style="${this.themePreviewStyle(theme)}"></div>
                <div class="theme-name">${t(`theme.${theme}` as any)}</div>
                <div class="theme-desc">${this.themeDesc(theme, currentLocale)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header">
            <div>
              <div class="card-title">${t('settings.systemParams')}</div>
              <div class="card-subtitle">${isEn ? 'Debug and checkpoint behavior' : '调整调试与检查点行为'}</div>
            </div>
          </div>

          <div class="flex items-center justify-between" style="padding: 12px 0; border-bottom: 1px solid var(--ord-divider);">
            <div>
              <div class="fw-500 mb-1">${t('settings.debugMode')}</div>
              <div class="text-sm text-muted">${isEn ? 'Enable detailed execution logs' : '启用后将记录详细的执行日志'}</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="debugToggle" ${settings.debugMode ? 'checked' : ''}>
              <span class="switch-slider"></span>
            </label>
          </div>

          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">${t('settings.checkpointStrategy')}</label>
            <select class="select" id="checkpointStrategy">
              <option value="every-message" ${settings.checkpointStrategy === 'every-message' ? 'selected' : ''}>${isEn ? 'Every message' : '每条消息'}</option>
              <option value="every-n" ${settings.checkpointStrategy === 'every-n' ? 'selected' : ''}>${isEn ? 'Every N messages' : '每 N 条消息'}</option>
              <option value="manual" ${settings.checkpointStrategy === 'manual' ? 'selected' : ''}>${isEn ? 'Manual' : '手动'}</option>
            </select>
            <div class="text-sm text-muted mt-2">${isEn ? 'Control when checkpoints are saved' : '控制何时自动保存会话检查点'}</div>
          </div>

          <div class="form-group">
            <label class="form-label">${t('settings.logLevel')}</label>
            <select class="select" id="logLevel">
              <option value="debug" ${settings.logLevel === 'debug' ? 'selected' : ''}>Debug · ${isEn ? 'Verbose' : '详细'}</option>
              <option value="info" ${settings.logLevel === 'info' ? 'selected' : ''}>Info · ${isEn ? 'General' : '一般'}</option>
              <option value="warn" ${settings.logLevel === 'warn' ? 'selected' : ''}>Warn · ${isEn ? 'Warning' : '警告'}</option>
              <option value="error" ${settings.logLevel === 'error' ? 'selected' : ''}>Error · ${isEn ? 'Error' : '错误'}</option>
            </select>
          </div>

          <div class="flex justify-end mt-4">
            <button class="btn btn-primary" id="saveSystemSettings">${t('common.save')}</button>
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header">
            <div>
              <div class="card-title">${t('settings.apiKeys')}</div>
              <div class="card-subtitle">${isEn ? 'LLM service credentials' : '配置 LLM 服务认证信息'}</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">OpenAI API Key</label>
            <input type="password" class="input" id="openaiKey" placeholder="sk-..." value="${settings.apiKeys?.openai || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Anthropic API Key</label>
            <input type="password" class="input" id="anthropicKey" placeholder="sk-ant-..." value="${settings.apiKeys?.anthropic || ''}">
          </div>
          <div class="flex justify-end">
            <button class="btn btn-primary" id="saveApiKeys">${t('common.save')}</button>
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header">
            <div>
              <div class="card-title">${t('settings.about')}</div>
              <div class="card-subtitle">AI Agent Studio · v1.0.0</div>
            </div>
          </div>
          <div class="text-sm text-secondary" style="line-height: 1.8;">
            ${isEn
              ? 'OrdPaw is a simple, warm, organic AI Agent workbench.<br>Supports Skills, MCP, checkpoints, session management, debug mode, and prompt library.<br>Event-driven plugin system for flexible Agent capabilities.'
              : 'OrdPaw 是一个简洁、温暖、有机的 AI Agent 工作台。<br>支持 Skills、MCP、检查点、会话管理、调试模式、提示词库。<br>基于事件驱动的插件系统，灵活扩展 Agent 能力。'}
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header">
            <div>
              <div class="card-title">${isEn ? 'Reset & Clear Data' : '重置与清除数据'}</div>
              <div class="card-subtitle">${isEn ? 'Reset settings or clear specific data' : '重置设置或清除特定数据'}</div>
            </div>
          </div>
          <div style="padding: 12px 0; border-bottom: 1px solid var(--ord-divider);">
            <div class="fw-500 mb-1">${isEn ? 'Reset Settings' : '重置设置'}</div>
            <div class="text-sm text-muted mb-3">${isEn ? 'Restore all settings to default values' : '将所有设置恢复为默认值'}</div>
            <button class="btn btn-secondary" id="resetSettingsBtn">${isEn ? 'Reset Settings' : '重置设置'}</button>
          </div>
          <div style="padding: 12px 0;">
            <div class="fw-500 mb-1">${isEn ? 'Clear Data' : '清除数据'}</div>
            <div class="text-sm text-muted mb-3">${isEn ? 'Select data to clear (this cannot be undone)' : '选择要清除的数据（此操作不可撤销）'}</div>
            <div class="flex gap-3 flex-wrap mb-3" style="align-items:center;">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="clear-target" value="conversations" checked> ${isEn ? 'Conversations' : '会话'}</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="clear-target" value="logs"> ${isEn ? 'Logs & Events' : '日志与事件'}</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="clear-target" value="cache"> ${isEn ? 'Cache' : '缓存'}</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="clear-target" value="testRuns"> ${isEn ? 'Test Runs' : '测试运行记录'}</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="clear-target" value="scripts"> ${isEn ? 'Scripts' : '脚本'}</label>
            </div>
            <button class="btn btn-danger" id="clearDataBtn">${isEn ? 'Clear Selected Data' : '清除所选数据'}</button>
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header">
            <div>
              <div class="card-title">${isEn ? 'Download & Storage' : '下载与存储'}</div>
              <div class="card-subtitle">${isEn ? 'Configure where downloaded files are stored' : '配置下载文件的默认存储位置与配额'}</div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">${t('download.storageLocation')}</label>
            <div class="flex gap-3">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="downloadStorage" value="browser" ${settings.downloadStorage === 'browser' ? 'checked' : ''}>
                ${t('download.browserStorage')}
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="downloadStorage" value="server" ${settings.downloadStorage === 'server' ? 'checked' : ''}>
                ${t('download.serverStorage')}
              </label>
            </div>
          </div>

          <div class="form-group" id="browserBackendGroup" style="${settings.downloadStorage === 'browser' ? '' : 'display:none'}">
            <label class="form-label">${t('download.browserBackend')}</label>
            <select class="select" id="browserBackend">
              <option value="indexeddb" ${settings.browserStorageBackend === 'indexeddb' ? 'selected' : ''}>IndexedDB</option>
              <option value="fsa" ${settings.browserStorageBackend === 'fsa' ? 'selected' : ''}>File System Access</option>
              <option value="localstorage" ${settings.browserStorageBackend === 'localstorage' ? 'selected' : ''}>localStorage</option>
            </select>
          </div>

          <div class="form-group" id="serverPathGroup" style="${settings.downloadStorage === 'server' ? '' : 'display:none'}">
            <label class="form-label">${isEn ? 'Server Directory' : '服务端目录'}</label>
            <input type="text" class="input" id="serverDownloadPath" value="${settings.storageQuota?.serverPath || './downloads'}" placeholder="./downloads">
            <div class="text-sm text-muted mt-2">${isEn ? 'Relative to server working directory' : '相对于服务端工作目录'}</div>
          </div>

          <div class="form-group">
            <label class="form-label">${isEn ? 'Browser Quota (MB)' : '浏览器配额 (MB)'}</label>
            <input type="number" class="input" id="browserQuotaMb" value="${Math.floor((settings.storageQuota?.browserMaxBytes || 500 * 1024 * 1024) / 1024 / 1024)}" min="1">
          </div>

          <div class="form-group">
            <label class="form-label">${isEn ? 'Server Quota (MB)' : '服务端配额 (MB)'}</label>
            <input type="number" class="input" id="serverQuotaMb" value="${Math.floor((settings.storageQuota?.serverMaxBytes || 2 * 1024 * 1024 * 1024) / 1024 / 1024)}" min="1">
          </div>

          <div class="flex items-center justify-between" style="padding: 12px 0; border-bottom: 1px solid var(--ord-divider);">
            <div>
              <div class="fw-500 mb-1">${isEn ? 'Enforce Quota' : '强制配额'}</div>
              <div class="text-sm text-muted">${isEn ? 'Reject downloads that exceed the quota' : '超出配额时拒绝下载'}</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="enforceQuota" ${settings.storageQuota?.enforce !== false ? 'checked' : ''}>
              <span class="switch-slider"></span>
            </label>
          </div>

          <div class="flex justify-end mt-4">
            <button class="btn btn-primary" id="saveDownloadSettings">${t('common.save')}</button>
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header">
            <div>
              <div class="card-title">${isEn ? 'Export & Import' : '导出与导入'}</div>
              <div class="card-subtitle">${isEn ? 'Backup and restore your data' : '备份和恢复你的数据'}</div>
            </div>
          </div>
          <div style="padding: 12px 0; border-bottom: 1px solid var(--ord-divider);">
            <div class="fw-500 mb-1">${isEn ? 'Export Data' : '导出数据'}</div>
            <div class="text-sm text-muted mb-3">${isEn ? 'Choose what to export' : '选择要导出的内容'}</div>
            <div class="flex gap-2 flex-wrap mb-3">
              <button class="btn btn-ghost btn-sm" data-export-scope="all">${isEn ? 'All Data' : '全部数据'}</button>
              <button class="btn btn-ghost btn-sm" data-export-scope="agents">Agents</button>
              <button class="btn btn-ghost btn-sm" data-export-scope="conversations">${isEn ? 'Conversations' : '会话'}</button>
              <button class="btn btn-ghost btn-sm" data-export-scope="providers">${isEn ? 'Providers' : '服务商'}</button>
              <button class="btn btn-ghost btn-sm" data-export-scope="prompts">${isEn ? 'Prompts' : '提示词'}</button>
              <button class="btn btn-ghost btn-sm" data-export-scope="settings">${isEn ? 'Settings' : '设置'}</button>
            </div>
          </div>
          <div style="padding: 12px 0;">
            <div class="fw-500 mb-1">${isEn ? 'Import Data' : '导入数据'}</div>
            <div class="text-sm text-muted mb-3">${isEn ? 'Upload a JSON backup file' : '上传 JSON 备份文件'}</div>
            <input type="file" id="importFile" accept=".json" style="display:none;">
            <button class="btn btn-secondary" id="importBtn">${isEn ? 'Choose File & Import' : '选择文件并导入'}</button>
          </div>
        </div>
      </div>
    `;

    // Locale buttons
    content.querySelectorAll('[data-locale]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const locale = (btn as HTMLElement).getAttribute('data-locale') as Locale;
        await this.api.updateSettings({ locale });
        this.store.setLocale(locale);
        this.onThemeChange();
        await this.render();
      });
    });

    // UI Mode buttons
    document.getElementById('uiModeClassic')?.addEventListener('click', async () => {
      await this.api.updateSettings({ uiMode: 'classic' });
      this.store.setUIMode('classic');
      this.onThemeChange();
      await this.render();
      this.toast(isEn ? 'Switched to Classic UI' : '已切换到经典界面');
    });

    document.getElementById('uiModeModern')?.addEventListener('click', async () => {
      await this.api.updateSettings({ uiMode: 'modern' });
      this.store.setUIMode('modern');
      this.onThemeChange();
      await this.render();
      this.toast(isEn ? 'Switched to Modern UI' : '已切换到新版界面');
    });

    // UI Effects buttons
    document.getElementById('uiEffectsMinimal')?.addEventListener('click', async () => {
      await this.api.updateSettings({ uiEffects: 'minimal' });
      this.store.setUIEffects('minimal');
      this.onThemeChange();
      await this.render();
      this.toast(isEn ? 'Effects set to Minimal' : '已切换到极简动效');
    });

    document.getElementById('uiEffectsBalanced')?.addEventListener('click', async () => {
      await this.api.updateSettings({ uiEffects: 'balanced' });
      this.store.setUIEffects('balanced');
      this.onThemeChange();
      await this.render();
      this.toast(isEn ? 'Effects set to Balanced' : '已切换到均衡动效');
    });

    document.getElementById('uiEffectsExpressive')?.addEventListener('click', async () => {
      await this.api.updateSettings({ uiEffects: 'expressive' });
      this.store.setUIEffects('expressive');
      this.onThemeChange();
      await this.render();
      this.toast(isEn ? 'Effects set to Expressive' : '已切换到华丽动效');
    });

    // Performance mode buttons
    document.getElementById('perfModeAuto')?.addEventListener('click', async () => {
      await this.api.updateSettings({ performanceMode: 'auto' });
      this.store.setPerformanceMode('auto');
      this.onThemeChange();
      await this.render();
      this.toast(isEn ? 'Performance mode: Auto' : '性能模式：自动');
    });

    document.getElementById('perfModeHigh')?.addEventListener('click', async () => {
      await this.api.updateSettings({ performanceMode: 'high' });
      this.store.setPerformanceMode('high');
      this.onThemeChange();
      await this.render();
      this.toast(isEn ? 'Performance mode: Quality' : '性能模式：画质优先');
    });

    document.getElementById('perfModeMedium')?.addEventListener('click', async () => {
      await this.api.updateSettings({ performanceMode: 'medium' });
      this.store.setPerformanceMode('medium');
      this.onThemeChange();
      await this.render();
      this.toast(isEn ? 'Performance mode: Balanced' : '性能模式：平衡');
    });

    document.getElementById('perfModeLow')?.addEventListener('click', async () => {
      await this.api.updateSettings({ performanceMode: 'low' });
      this.store.setPerformanceMode('low');
      this.onThemeChange();
      await this.render();
      this.toast(isEn ? 'Performance mode: Power Save' : '性能模式：省电流畅');
    });

    // Theme cards
    content.querySelectorAll('.theme-card').forEach(card => {
      card.addEventListener('click', async () => {
        const theme = (card.getAttribute('data-theme') || 'ordpaw-light') as ThemeId;
        await this.api.updateSettings({ theme });
        this.store.setTheme(theme);
        this.onThemeChange();
        content.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });

    // Debug toggle
    document.getElementById('debugToggle')?.addEventListener('change', async (e) => {
      const debugMode = (e.target as HTMLInputElement).checked;
      await this.api.updateSettings({ debugMode });
      this.store.setSettings({ debugMode });
    });

    // Save system settings
    document.getElementById('saveSystemSettings')?.addEventListener('click', async () => {
      const logLevel = (document.getElementById('logLevel') as HTMLSelectElement)?.value as any;
      const checkpointStrategy = (document.getElementById('checkpointStrategy') as HTMLSelectElement)?.value as any;
      await this.api.updateSettings({ logLevel, checkpointStrategy });
      this.store.setSettings({ logLevel, checkpointStrategy });
      this.toast(t('settings.saved'));
    });

    // Save API keys
    document.getElementById('saveApiKeys')?.addEventListener('click', async () => {
      const openai = (document.getElementById('openaiKey') as HTMLInputElement)?.value;
      const anthropic = (document.getElementById('anthropicKey') as HTMLInputElement)?.value;
      await this.api.updateSettings({ apiKeys: { openai, anthropic } });
      this.toast(t('settings.saved'));
    });

    // Download storage radios toggle
    content.querySelectorAll<HTMLInputElement>('input[name="downloadStorage"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const value = (document.querySelector('input[name="downloadStorage"]:checked') as HTMLInputElement)?.value;
        const browserGroup = document.getElementById('browserBackendGroup');
        const serverGroup = document.getElementById('serverPathGroup');
        if (browserGroup) browserGroup.style.display = value === 'browser' ? '' : 'none';
        if (serverGroup) serverGroup.style.display = value === 'server' ? '' : 'none';
      });
    });

    // Save download settings
    document.getElementById('saveDownloadSettings')?.addEventListener('click', async () => {
      const downloadStorage = (document.querySelector('input[name="downloadStorage"]:checked') as HTMLInputElement)?.value as 'browser' | 'server';
      const browserStorageBackend = (document.getElementById('browserBackend') as HTMLSelectElement)?.value as 'indexeddb' | 'fsa' | 'localstorage';
      const serverPath = (document.getElementById('serverDownloadPath') as HTMLInputElement)?.value || './downloads';
      const browserQuotaMb = parseInt((document.getElementById('browserQuotaMb') as HTMLInputElement)?.value || '500', 10);
      const serverQuotaMb = parseInt((document.getElementById('serverQuotaMb') as HTMLInputElement)?.value || '2048', 10);
      const enforce = (document.getElementById('enforceQuota') as HTMLInputElement)?.checked ?? true;

      const storageQuota = {
        browserMaxBytes: Math.max(1, browserQuotaMb) * 1024 * 1024,
        serverMaxBytes: Math.max(1, serverQuotaMb) * 1024 * 1024,
        enforce,
        serverPath
      };

      await this.api.updateSettings({ downloadStorage, browserStorageBackend, storageQuota });
      this.store.setSettings({ downloadStorage, browserStorageBackend, storageQuota });
      this.toast(t('settings.saved'));
    });

    // Reset settings
    document.getElementById('resetSettingsBtn')?.addEventListener('click', async () => {
      if (!confirm(isEn ? 'Are you sure you want to reset all settings to defaults?' : '确定要重置所有设置为默认值吗？')) return;
      await this.api.resetSettings();
      const fresh = await this.api.getSettings();
      this.store.setSettings(fresh);
      this.onThemeChange();
      this.toast(isEn ? 'Settings reset to defaults' : '设置已重置为默认值');
      await this.render();
    });

    // Clear data
    document.getElementById('clearDataBtn')?.addEventListener('click', async () => {
      const checked = Array.from(content.querySelectorAll<HTMLInputElement>('.clear-target:checked')).map(el => el.value);
      if (checked.length === 0) {
        this.toast(isEn ? 'Please select data to clear' : '请选择要清除的数据');
        return;
      }
      if (!confirm(isEn ? `Clear ${checked.join(', ')}? This cannot be undone.` : `确定要清除 ${checked.join('、')} 吗？此操作不可撤销。`)) return;
      const result = await this.api.clearData(checked);
      this.toast(isEn ? `Cleared: ${result.cleared.join(', ')}` : `已清除: ${result.cleared.join('、')}`);
    });

    // Export buttons
    content.querySelectorAll('[data-export-scope]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const scope = (btn as HTMLElement).getAttribute('data-export-scope') || 'all';
        const data = await this.api.exportData(scope);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agent-studio-${scope}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast(isEn ? 'Export successful' : '导出成功');
      });
    });

    // Import button
    document.getElementById('importBtn')?.addEventListener('click', () => {
      document.getElementById('importFile')?.click();
    });
    document.getElementById('importFile')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!confirm(isEn ? 'Import data? Existing data with same IDs will be overwritten.' : '导入数据？相同 ID 的现有数据将被覆盖。')) return;
        const result = await this.api.importData(data);
        this.toast(isEn ? `Imported: ${result.imported.join(', ')}` : `已导入: ${result.imported.join('、')}`);
      } catch (err) {
        this.toast(isEn ? 'Import failed: invalid file' : '导入失败: 无效文件');
      }
    });
  }

  private themePreviewStyle(theme: ThemeId): string {
    const previews: Record<ThemeId, string> = {
      'ordpaw-light': 'background: linear-gradient(135deg, #faf7f2 0%, #ebe4d8 100%); color: #d97757;',
      'ordpaw-dark': 'background: linear-gradient(135deg, #1a1814 0%, #2a271f 100%); color: #e89473;',
      'ordpaw-twilight': 'background: linear-gradient(135deg, #1e1b2e 0%, #322d4a 100%); color: #b794f6;',
      'minimal': 'background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%); color: #000000;',
      'forest': 'background: linear-gradient(135deg, #f4f7f4 0%, #e3f0e6 100%); color: #4a7c59;',
      'ocean': 'background: linear-gradient(135deg, #f0f5fa 0%, #e3eef8 100%); color: #2a7cc6;',
      'neon': 'background: linear-gradient(135deg, #0a0a12 0%, #181826 100%); color: #00f0ff;',
      'material': 'background: linear-gradient(135deg, #f2f5f9 0%, #e9eef6 100%); color: #6750a4;'
    };
    return previews[theme];
  }

  private themeDesc(theme: ThemeId, locale: Locale): string {
    const desc: Record<ThemeId, { zh: string; en: string }> = {
      'ordpaw-light': { zh: '温暖、有机的默认主题', en: 'Warm, organic default' },
      'ordpaw-dark': { zh: '舒适的暗色模式', en: 'Comfortable dark mode' },
      'ordpaw-twilight': { zh: '深邃神秘的紫色调', en: 'Deep mysterious violet' },
      'minimal': { zh: '极简黑白，专注内容', en: 'Minimal black & white' },
      'forest': { zh: '森林绿意，自然清新', en: 'Fresh forest green' },
      'ocean': { zh: '深海蓝色，沉静专业', en: 'Calm deep blue' },
      'neon': { zh: '霓虹赛博，高对比', en: 'Neon cyberpunk' },
      'material': { zh: 'Material You 多彩', en: 'Material You colorful' }
    };
    return desc[theme][locale === 'en-US' ? 'en' : 'zh'];
  }

  private toast(message: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }
}
