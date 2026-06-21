import { API } from '../api';
import { t } from '../i18n';
import type { TestSuite, Agent } from '@ordpaw/shared';

export class TestsView {
  private api: API;
  private agents: Agent[] = [];

  constructor(api: API) {
    this.api = api;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    this.agents = await this.api.getAgents();
    const suites = await this.api.getTestSuites();

    content.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">${t('test.title')}</div>
          <div class="card-subtitle">${suites.length} ${t('test.items')}</div>
        </div>
        <button class="btn btn-primary" id="createSuiteBtn">
          <span>+</span>
          <span>${t('test.createSuite')}</span>
        </button>
      </div>

      ${
        suites.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-state-icon">▣</div>
          <div class="empty-state-title">${t('common.empty')}</div>
          <div class="text-sm text-muted">${t('test.createSuite')}</div>
        </div>
      `
          : `
        <div class="grid grid-2" id="suites-list">
          ${suites.map((s) => this.renderSuiteCard(s)).join('')}
        </div>
      `
      }
    `;

    document
      .getElementById('createSuiteBtn')
      ?.addEventListener('click', () => this.showSuiteModal());
    content.querySelectorAll('.suite-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        if (id) this.showSuiteModal(id);
      });
    });
    content.querySelectorAll('.suite-run').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        if (id) this.runSuite(id);
      });
    });
    content.querySelectorAll('.suite-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        if (id && confirm(t('test.deleteConfirm'))) this.deleteSuite(id);
      });
    });
    content.querySelectorAll('.suite-add-case').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        if (id) this.showCaseModal(id);
      });
    });
    content.querySelectorAll('.suite-view-runs').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        if (id) this.showRuns(id);
      });
    });
  }

  private renderSuiteCard(s: TestSuite) {
    const agent = this.agents.find((a) => a.id === s.agentId);
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${this.escapeHtml(s.name)}</div>
            <div class="card-subtitle">${this.escapeHtml(s.description || '')}</div>
          </div>
          <span class="badge badge-sage">${s.cases.length} ${t('test.cases')}</span>
        </div>
        <div class="text-sm text-secondary mb-2">Agent: ${this.escapeHtml(agent?.name || '-')}</div>
        ${
          s.cases.length > 0
            ? `
          <div class="mb-3">
            ${s.cases.map((c) => `<div class="text-sm">• ${this.escapeHtml(c.name)}</div>`).join('')}
          </div>
        `
            : ''
        }
        <div class="flex gap-2" style="justify-content:flex-end; flex-wrap:wrap">
          <button class="btn btn-sm btn-secondary suite-add-case" data-id="${s.id}">+ ${t('test.addCase')}</button>
          <button class="btn btn-sm btn-primary suite-run" data-id="${s.id}">▶ ${t('test.run')}</button>
          <button class="btn btn-sm btn-ghost suite-view-runs" data-id="${s.id}">${t('test.runs')}</button>
          <button class="btn btn-sm btn-ghost suite-edit" data-id="${s.id}">${t('common.edit')}</button>
          <button class="btn btn-sm btn-ghost suite-delete" data-id="${s.id}">${t('common.delete')}</button>
        </div>
        <div class="test-run-result mt-3" id="run-result-${s.id}" style="display:none"></div>
      </div>
    `;
  }

  private async showSuiteModal(id?: string) {
    const suite = id ? await this.api.getTestSuite(id) : undefined;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <div class="modal-title">${id ? t('common.edit') : t('test.createSuite')}</div>
          <button class="modal-close" id="closeModal">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">${t('test.name')}</label>
          <input type="text" class="input" id="suiteName" value="${suite ? this.escapeHtml(suite.name) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Agent</label>
          <select class="input" id="suiteAgent">
            ${this.agents.map((a) => `<option value="${a.id}" ${suite?.agentId === a.id ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${t('test.description')}</label>
          <input type="text" class="input" id="suiteDesc" value="${suite ? this.escapeHtml(suite.description) : ''}">
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancelModal">${t('common.cancel')}</button>
          <button class="btn btn-primary" id="saveSuite">${t('common.save')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    document.getElementById('closeModal')?.addEventListener('click', close);
    document.getElementById('cancelModal')?.addEventListener('click', close);

    document.getElementById('saveSuite')?.addEventListener('click', async () => {
      const name = (document.getElementById('suiteName') as HTMLInputElement).value.trim();
      const agentId = (document.getElementById('suiteAgent') as HTMLSelectElement).value;
      const description = (document.getElementById('suiteDesc') as HTMLInputElement).value.trim();
      if (!name || !agentId) return;
      if (id) {
        await this.api.updateTestSuite(id, { name, description });
      } else {
        await this.api.createTestSuite({ agentId, name, description });
      }
      close();
      await this.render();
    });
  }

  private async showCaseModal(suiteId: string) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div class="modal-header">
          <div class="modal-title">${t('test.addCase')}</div>
          <button class="modal-close" id="closeModal">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">${t('test.caseName')}</label>
          <input type="text" class="input" id="caseName">
        </div>
        <div class="form-group">
          <label class="form-label">${t('test.input')}</label>
          <textarea class="input" id="caseInput" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">${t('test.expectedContains')}</label>
          <input type="text" class="input" id="caseContains" placeholder="keyword1, keyword2">
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancelModal">${t('common.cancel')}</button>
          <button class="btn btn-primary" id="saveCase">${t('common.save')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    document.getElementById('closeModal')?.addEventListener('click', close);
    document.getElementById('cancelModal')?.addEventListener('click', close);

    document.getElementById('saveCase')?.addEventListener('click', async () => {
      const name = (document.getElementById('caseName') as HTMLInputElement).value.trim();
      const input = (document.getElementById('caseInput') as HTMLTextAreaElement).value.trim();
      const contains = (document.getElementById('caseContains') as HTMLInputElement).value.trim();
      if (!name || !input) return;
      const expectedContains = contains
        ? contains
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      await this.api.createTestCase(suiteId, { name, input, expectedContains });
      close();
      await this.render();
    });
  }

  private async runSuite(id: string) {
    const resultEl = document.getElementById(`run-result-${id}`);
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `<div class="text-sm text-muted">${t('test.running')}...</div>`;
    }
    const run = await this.api.runTestSuite(id);
    if (resultEl) {
      resultEl.innerHTML = `
        <div class="card" style="background:var(--ord-bg-sunken)">
          <div class="text-sm mb-2">${t('test.passed')}: ${run.passed} / ${t('test.failed')}: ${run.failed}</div>
          ${run.results
            .map(
              (r) => `
            <div class="text-sm ${r.passed ? 'text-sage' : 'text-coral'}">
              ${r.passed ? '✓' : '✗'} ${this.escapeHtml(r.output.slice(0, 120))}${r.output.length > 120 ? '...' : ''}
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }
  }

  private async showRuns(id: string) {
    const runs = await this.api.getTestRuns(id);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:640px; max-height:80vh; overflow:auto">
        <div class="modal-header">
          <div class="modal-title">${t('test.runs')}</div>
          <button class="modal-close" id="closeModal">×</button>
        </div>
        ${
          runs.length === 0
            ? `<div class="text-sm text-muted">${t('common.empty')}</div>`
            : runs
                .map(
                  (run) => `
          <div class="card mb-3">
            <div class="text-sm mb-2">${new Date(run.createdAt).toLocaleString()} · ${t('test.passed')}: ${run.passed} · ${t('test.failed')}: ${run.failed}</div>
            ${run.results
              .map(
                (r) => `
              <div class="text-sm ${r.passed ? 'text-sage' : 'text-coral'}">
                ${r.passed ? '✓' : '✗'} ${this.escapeHtml(r.output.slice(0, 100))}${r.output.length > 100 ? '...' : ''}
              </div>
            `
              )
              .join('')}
          </div>
        `
                )
                .join('')
        }
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('closeModal')?.addEventListener('click', () => overlay.remove());
  }

  private async deleteSuite(id: string) {
    await this.api.deleteTestSuite(id);
    await this.render();
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
