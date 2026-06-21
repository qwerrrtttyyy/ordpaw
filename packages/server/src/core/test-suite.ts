import { v4 as uuidv4 } from 'uuid';
import type { TestSuite, TestCase, TestRun, TestRunResult, CreateTestSuiteRequest } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { agentRuntime } from './agent-runtime.js';
import { sessionManager } from './session.js';
import { queryAll, queryOne, safeJsonParse } from '../db/utils.js';
import { logger } from './logger.js';

interface SuiteRow {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
}

interface CaseRow {
  id: string;
  suite_id: string;
  name: string;
  input: string;
  expected_output: string;
  expected_contains_json: string;
  variables_json: string;
  created_at: number;
  updated_at: number;
}

interface RunRow {
  id: string;
  suite_id: string;
  agent_id: string;
  results_json: string;
  passed: number;
  failed: number;
  created_at: number;
}

export class TestSuiteManager {
  listSuites(agentId?: string): TestSuite[] {
    try {
      const db = getDatabase();
      const rows = agentId
        ? queryAll<SuiteRow>(db, 'SELECT * FROM test_suites WHERE agent_id = ? ORDER BY updated_at DESC', [agentId])
        : queryAll<SuiteRow>(db, 'SELECT * FROM test_suites ORDER BY updated_at DESC');
      return rows.map(row => this.rowToSuite(row));
    } catch (err) {
      logger.error(err, 'listSuites 错误:');
      return [];
    }
  }

  getSuite(id: string): TestSuite | null {
    try {
      const db = getDatabase();
      const row = queryOne<SuiteRow>(db, 'SELECT * FROM test_suites WHERE id = ?', [id]);
      return row ? this.rowToSuite(row) : null;
    } catch (err) {
      logger.error(err, 'getSuite 错误:');
      return null;
    }
  }

  createSuite(data: CreateTestSuiteRequest): TestSuite {
    const db = getDatabase();
    const now = Date.now();
    const id = uuidv4();
    const agentId = data.agentId.toString();
    const name = (data.name || '未命名测试套件').toString();
    const description = (data.description || '').toString();

    db.run(`
      INSERT INTO test_suites (id, agent_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, agentId, name, description, now, now]);

    const cases = data.cases || [];
    for (const c of cases) {
      this.createCaseInternal(id, c);
    }

    saveDatabase();
    return this.getSuite(id)!;
  }

  updateSuite(id: string, data: Partial<TestSuite>): TestSuite | null {
    const suite = this.getSuite(id);
    if (!suite) return null;

    const db = getDatabase();
    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name.toString());
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description.toString());
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(Date.now());
      params.push(id);
      db.run(`UPDATE test_suites SET ${updates.join(', ')} WHERE id = ?`, params);
      saveDatabase();
    }

    return this.getSuite(id);
  }

  deleteSuite(id: string): boolean {
    try {
      const db = getDatabase();
      const existing = db.exec('SELECT id FROM test_suites WHERE id = ?', [id]);
      if (existing.length === 0 || existing[0].values.length === 0) return false;
      db.run('DELETE FROM test_suites WHERE id = ?', [id]);
      saveDatabase();
      return true;
    } catch (err) {
      logger.error(err, 'deleteSuite 错误:');
      return false;
    }
  }

  createCase(suiteId: string, data: Partial<TestCase>): TestCase | null {
    const suite = this.getSuite(suiteId);
    if (!suite) return null;
    const c = this.createCaseInternal(suiteId, data);
    saveDatabase();
    return c;
  }

  updateCase(caseId: string, data: Partial<TestCase>): TestCase | null {
    const existing = this.getCase(caseId);
    if (!existing) return null;

    const db = getDatabase();
    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name.toString());
    }
    if (data.input !== undefined) {
      updates.push('input = ?');
      params.push(data.input.toString());
    }
    if (data.expectedOutput !== undefined) {
      updates.push('expected_output = ?');
      params.push(data.expectedOutput.toString());
    }
    if (data.expectedContains !== undefined) {
      updates.push('expected_contains_json = ?');
      params.push(JSON.stringify(this.normalizeExpectedContains(data.expectedContains)));
    }
    if (data.variables !== undefined) {
      updates.push('variables_json = ?');
      params.push(JSON.stringify(data.variables));
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(Date.now());
      params.push(caseId);
      db.run(`UPDATE test_cases SET ${updates.join(', ')} WHERE id = ?`, params);
      saveDatabase();
    }

    return this.getCase(caseId);
  }

  deleteCase(caseId: string): boolean {
    try {
      const db = getDatabase();
      const existing = db.exec('SELECT id FROM test_cases WHERE id = ?', [caseId]);
      if (existing.length === 0 || existing[0].values.length === 0) return false;
      db.run('DELETE FROM test_cases WHERE id = ?', [caseId]);
      saveDatabase();
      return true;
    } catch (err) {
      logger.error(err, 'deleteCase 错误:');
      return false;
    }
  }

  async runSuite(suiteId: string): Promise<TestRun | null> {
    const suite = this.getSuite(suiteId);
    if (!suite) return null;

    const agent = agentRuntime.getAgent(suite.agentId);
    if (!agent) return null;

    const results: TestRunResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const testCase of suite.cases) {
      const start = Date.now();
      let output = '';
      let error: string | undefined;
      let ok = false;
      try {
        const tempConv = sessionManager.createConversation(agent.id, `测试: ${testCase.name}`);
        await sessionManager.updateVariables(tempConv.id, testCase.variables || {});
        const msg = await agentRuntime.processMessage(tempConv.id, testCase.input);
        output = msg?.content || '';
        sessionManager.deleteConversation(tempConv.id);

        ok = this.evaluateCase(testCase, output);
      } catch (err: unknown) {
        error = err instanceof Error ? err.message : String(err);
        output = error || '';
      }
      const duration = Date.now() - start;
      if (ok) passed++; else failed++;
      results.push({ caseId: testCase.id, passed: ok, output, duration, error });
    }

    const run: TestRun = {
      id: uuidv4(),
      suiteId,
      agentId: agent.id,
      results,
      passed,
      failed,
      createdAt: Date.now()
    };

    const db = getDatabase();
    db.run(`
      INSERT INTO test_runs (id, suite_id, agent_id, results_json, passed, failed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [run.id, suiteId, agent.id, JSON.stringify(results), passed, failed, run.createdAt]);
    saveDatabase();

    return run;
  }

  listRuns(suiteId: string): TestRun[] {
    try {
      const db = getDatabase();
      const rows = queryAll<RunRow>(db, 'SELECT * FROM test_runs WHERE suite_id = ? ORDER BY created_at DESC', [suiteId]);
      return rows.map(r => ({
        id: r.id,
        suiteId: r.suite_id,
        agentId: r.agent_id,
        results: safeJsonParse<TestRunResult[]>(r.results_json, []),
        passed: r.passed,
        failed: r.failed,
        createdAt: r.created_at
      }));
    } catch (err) {
      logger.error(err, 'listRuns 错误:');
      return [];
    }
  }

  private normalizeExpectedContains(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(v => String(v).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  private evaluateCase(testCase: TestCase, output: string): boolean {
    if (testCase.expectedOutput !== undefined && testCase.expectedOutput !== null && testCase.expectedOutput !== '') {
      return output.trim() === testCase.expectedOutput.trim();
    }
    if (testCase.expectedContains && testCase.expectedContains.length > 0) {
      return testCase.expectedContains.every(c => output.includes(c));
    }
    return output.trim().length > 0;
  }

  private createCaseInternal(suiteId: string, data: Partial<TestCase>): TestCase {
    const db = getDatabase();
    const now = Date.now();
    const id = uuidv4();
    const name = (data.name || '未命名用例').toString();
    const input = (data.input || '').toString();
    const expectedOutput = (data.expectedOutput || '').toString();
    const expectedContains = this.normalizeExpectedContains(data.expectedContains);
    const variables = data.variables || {};

    db.run(`
      INSERT INTO test_cases (id, suite_id, name, input, expected_output, expected_contains_json, variables_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, suiteId, name, input, expectedOutput, JSON.stringify(expectedContains), JSON.stringify(variables), now, now]);

    return {
      id,
      suiteId,
      name,
      input,
      expectedOutput,
      expectedContains,
      variables,
      createdAt: now,
      updatedAt: now
    };
  }

  private getCase(id: string): TestCase | null {
    try {
      const db = getDatabase();
      const row = queryOne<CaseRow>(db, 'SELECT * FROM test_cases WHERE id = ?', [id]);
      return row ? this.rowToCase(row) : null;
    } catch (err) {
      logger.error(err, 'getCase 错误:');
      return null;
    }
  }

  private rowToSuite(s: SuiteRow): TestSuite {
    return {
      id: s.id,
      agentId: s.agent_id,
      name: s.name,
      description: s.description,
      cases: this.getSuiteCases(s.id),
      createdAt: s.created_at,
      updatedAt: s.updated_at
    };
  }

  private getSuiteCases(suiteId: string): TestCase[] {
    try {
      const db = getDatabase();
      const rows = queryAll<CaseRow>(db, 'SELECT * FROM test_cases WHERE suite_id = ? ORDER BY created_at ASC', [suiteId]);
      return rows.map(row => this.rowToCase(row));
    } catch (err) {
      logger.error(err, 'getSuiteCases 错误:');
      return [];
    }
  }

  private rowToCase(c: CaseRow): TestCase {
    return {
      id: c.id,
      suiteId: c.suite_id,
      name: c.name,
      input: c.input,
      expectedOutput: c.expected_output,
      expectedContains: safeJsonParse<string[]>(c.expected_contains_json, []),
      variables: safeJsonParse<Record<string, unknown>>(c.variables_json, {}),
      createdAt: c.created_at,
      updatedAt: c.updated_at
    };
  }
}

export const testSuiteManager = new TestSuiteManager();
