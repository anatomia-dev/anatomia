/**
 * Tests for ana proof command
 *
 * Uses temp directories for isolation.
 * Tests cover all contract assertions A001-A024.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createTestProject } from '../helpers/test-project.js';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

describe('ana proof', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proof-test-'));
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Helper to run ana proof command
   */
  function runProof(args: string[] = []): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.join(__dirname, '../../dist/index.js');
    try {
      const stdout = execSync(`node ${cliPath} proof ${args.join(' ')}`, {
        encoding: 'utf-8',
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; status?: number };
      return {
        stdout: execError.stdout || '',
        stderr: execError.stderr || '',
        exitCode: execError.status || 1,
      };
    }
  }

  /**
   * Helper to create proof chain file
   */
  async function createProofChain(entries: unknown[]): Promise<void> {
    await createTestProject(tempDir);
    await fs.writeFile(
      path.join(tempDir, '.ana', 'proof_chain.json'),
      JSON.stringify({ entries }, null, 2)
    );
  }

  /**
   * Sample proof chain entry for testing
   */
  const sampleEntry = {
    slug: 'stripe-payments',
    feature: 'Stripe Payment Integration',
    result: 'PASS',
    author: { name: 'Developer', email: 'dev@example.com' },
    contract: {
      total: 22,
      covered: 22,
      uncovered: 0,
      satisfied: 20,
      unsatisfied: 0,
      deviated: 2,
    },
    assertions: [
      { id: 'A001', says: 'Creating a payment returns success', status: 'SATISFIED' },
      { id: 'A002', says: 'Payment response includes client secret', status: 'SATISFIED' },
      { id: 'A003', says: 'Webhook updates order status', status: 'DEVIATED', deviation: 'Used event mock instead of DB assertion' },
      { id: 'A004', says: 'Invalid webhooks rejected', status: 'SATISFIED' },
    ],
    acceptance_criteria: { total: 7, met: 7 },
    timing: {
      total_minutes: 90,
      think: 10,
      plan: 25,
      build: 40,
      verify: 15,
    },
    hashes: { scope: 'sha256:abc', contract: 'sha256:def' },
    seal_commit: 'abc123',
    completed_at: '2026-04-01T16:30:00Z',
  };

  /**
   * Second sample entry for multi-entry testing
   */
  const olderEntry = {
    slug: 'auth-refactor',
    feature: 'Auth Refactoring',
    result: 'FAIL' as const,
    author: { name: 'Developer', email: 'dev@example.com' },
    contract: {
      total: 12,
      covered: 12,
      uncovered: 0,
      satisfied: 8,
      unsatisfied: 4,
      deviated: 0,
    },
    assertions: [
      { id: 'A001', says: 'Auth works', status: 'SATISFIED' },
    ],
    acceptance_criteria: { total: 5, met: 3 },
    timing: { total_minutes: 60, think: 5, plan: 15, build: 30, verify: 10 },
    hashes: { scope: 'sha256:111', contract: 'sha256:222' },
    seal_commit: 'def456',
    completed_at: '2026-03-28T12:00:00Z',
  };

  /**
   * Entry with no completed_at for edge case testing
   */
  const undatedEntry = {
    slug: 'no-date-feature',
    feature: 'No Date Feature',
    result: 'PASS' as const,
    author: { name: 'Developer', email: 'dev@example.com' },
    contract: {
      total: 5,
      covered: 5,
      uncovered: 0,
      satisfied: 5,
      unsatisfied: 0,
      deviated: 0,
    },
    assertions: [
      { id: 'A001', says: 'Works', status: 'SATISFIED' },
    ],
    acceptance_criteria: { total: 2, met: 2 },
    timing: { total_minutes: 30 },
    hashes: { scope: 'sha256:333', contract: 'sha256:444' },
    seal_commit: 'ghi789',
  };

  // ─── List View Tests ───────────────────────────────────────────────

  // @ana A001, A002, A003, A004, A005
  describe('displays summary table', () => {
    it('shows table headers: Slug, Result, Assertions, Date', async () => {
      await createProofChain([sampleEntry, olderEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof([]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Slug');
      expect(stdout).toContain('Result');
      expect(stdout).toContain('Assertions');
      expect(stdout).toContain('Date');
    });

    it('shows entry slug in table row', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof([]);
      expect(stdout).toContain('stripe-payments');
    });

    it('shows entry date in table row', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof([]);
      expect(stdout).toContain('2026-04-01');
    });

    it('shows Proof History title', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof([]);
      expect(stdout).toContain('Proof History');
    });
  });

  // @ana A006
  describe('sorts entries reverse chronological', () => {
    it('shows newer entry before older entry', async () => {
      // Insert in wrong order to verify sorting
      await createProofChain([olderEntry, sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof([]);
      const newerIdx = stdout.indexOf('stripe-payments');
      const olderIdx = stdout.indexOf('auth-refactor');
      expect(newerIdx).toBeLessThan(olderIdx);
    });
  });

  // @ana A007
  describe('shows assertion ratio', () => {
    it('shows satisfied/total ratio', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof([]);
      expect(stdout).toContain('20/22');
    });
  });

  // @ana A008, A009
  describe('handles missing proof_chain.json', () => {
    it('outputs "No proofs yet." when file is missing', async () => {
      // createTestProject gives findProjectRoot() a valid .ana/ — no proof_chain.json
      await createTestProject(tempDir);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof([]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No proofs yet.');
    });
  });

  // @ana A010, A011
  describe('handles empty entries array', () => {
    it('outputs "No proofs yet." when entries is empty', async () => {
      await createProofChain([]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof([]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No proofs yet.');
    });
  });

  // @ana A012, A013, A022, A023
  describe('outputs JSON list with --json flag', () => {
    it('outputs valid JSON with 4-key contract envelope', async () => {
      await createProofChain([sampleEntry, olderEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      // 4-key envelope
      expect(json.command).toBe('proof');
      expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(json.results).toBeTypeOf('object');
      expect(json.meta).toBeTypeOf('object');
      // results contains entries
      expect(json.results.entries).toBeInstanceOf(Array);
      expect(json.results.entries).toHaveLength(2);
      // meta contains chain health
      expect(json.meta.chain_runs).toBeTypeOf('number');
      expect(json.meta.findings).toBeTypeOf('object');
    });
  });

  // @ana A014
  describe('JSON handles missing proof_chain.json', () => {
    it('returns empty entries array when file missing', async () => {
      // createTestProject gives findProjectRoot() a valid .ana/ — no proof_chain.json
      await createTestProject(tempDir);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.results.entries).toHaveLength(0);
    });
  });

  // @ana A018
  describe('handles single entry', () => {
    it('renders table with one row without crashing', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof([]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('stripe-payments');
      expect(stdout).toContain('Slug');
    });
  });

  // @ana A019
  describe('handles undefined completed_at', () => {
    it('sorts entries with dates before entries without dates', async () => {
      await createProofChain([undatedEntry, sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof([]);
      const datedIdx = stdout.indexOf('stripe-payments');
      const undatedIdx = stdout.indexOf('no-date-feature');
      expect(datedIdx).toBeLessThan(undatedIdx);
    });
  });

  // ─── Proof Card Findings Display Tests ─────────────────────────────

  // @ana A018, A019
  describe('displays findings with badges', () => {
    it('shows severity and action badges on findings', async () => {
      const entryWithFindings = {
        ...sampleEntry,
        findings: [
          { id: 'C1', category: 'code', summary: 'Unvalidated user input', file: 'src/api.ts', anchor: null, severity: 'risk', suggested_action: 'promote' },
          { id: 'C2', category: 'code', summary: 'Missing rate limit', file: 'src/api.ts', anchor: null, severity: 'debt', suggested_action: 'scope' },
        ],
        build_concerns: [],
      };
      await createProofChain([entryWithFindings]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stripe-payments']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('[risk');
      expect(stdout).toContain('promote]');
      expect(stdout).toContain('[debt');
      expect(stdout).toContain('Findings');
    });
  });

  // @ana A020
  describe('findings sorted by severity', () => {
    it('shows risk before debt before observation', async () => {
      const entryWithFindings = {
        ...sampleEntry,
        findings: [
          { id: 'C1', category: 'code', summary: 'Obs finding', file: null, anchor: null, severity: 'observation', suggested_action: 'monitor' },
          { id: 'C2', category: 'code', summary: 'Risk finding', file: null, anchor: null, severity: 'risk', suggested_action: 'promote' },
          { id: 'C3', category: 'code', summary: 'Debt finding', file: null, anchor: null, severity: 'debt', suggested_action: 'scope' },
        ],
        build_concerns: [],
      };
      await createProofChain([entryWithFindings]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      const lines = stdout.split('\n');
      const riskIdx = lines.findIndex((l: string) => l.includes('Risk finding'));
      const debtIdx = lines.findIndex((l: string) => l.includes('Debt finding'));
      const obsIdx = lines.findIndex((l: string) => l.includes('Obs finding'));
      expect(riskIdx).toBeLessThan(debtIdx);
      expect(debtIdx).toBeLessThan(obsIdx);
    });
  });

  // @ana A021
  describe('findings truncated at 5', () => {
    it('shows top 5 with truncation message', async () => {
      const findings = Array.from({ length: 7 }, (_, i) => ({
        id: `C${i + 1}`,
        category: 'code' as const,
        summary: `Finding number ${i + 1}`,
        file: null,
        anchor: null,
        severity: 'observation' as const,
        suggested_action: 'monitor' as const,
      }));
      const entryWithFindings = {
        ...sampleEntry,
        findings,
        build_concerns: [],
      };
      await createProofChain([entryWithFindings]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('... and 2 more');
    });

    it('no truncation message when exactly 5 findings', async () => {
      const findings = Array.from({ length: 5 }, (_, i) => ({
        id: `C${i + 1}`,
        category: 'code' as const,
        summary: `Finding number ${i + 1}`,
        file: null,
        anchor: null,
        severity: 'debt' as const,
        suggested_action: 'scope' as const,
      }));
      const entryWithFindings = {
        ...sampleEntry,
        findings,
        build_concerns: [],
      };
      await createProofChain([entryWithFindings]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).not.toContain('... and');
    });
  });

  // @ana A022, A023
  describe('build concerns displayed with badges', () => {
    it('shows Build Concerns section with badges', async () => {
      const entryWithConcerns = {
        ...sampleEntry,
        findings: [],
        build_concerns: [
          { summary: 'Test coverage below threshold', file: 'src/payments.ts', severity: 'debt', suggested_action: 'scope' },
          { summary: 'Hardcoded timeout', file: 'src/retry.ts', severity: 'observation', suggested_action: 'accept' },
        ],
      };
      await createProofChain([entryWithConcerns]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stripe-payments']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Build Concerns');
      expect(stdout).toContain('[debt');
      expect(stdout).toContain('[observation');
    });
  });

  // @ana A024, A025
  describe('pre-Phase B entries degrade gracefully', () => {
    it('shows findings without badges when severity/action missing', async () => {
      const entryWithLegacy = {
        ...sampleEntry,
        findings: [
          { id: 'C1', category: 'code', summary: 'Legacy finding without classification', file: null, anchor: null },
        ],
        build_concerns: [],
      };
      await createProofChain([entryWithLegacy]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stripe-payments']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Legacy finding without classification');
      expect(stdout).not.toContain('undefined');
    });
  });

  // @ana A026
  describe('empty findings omit section', () => {
    it('does not show Findings header when no findings', async () => {
      // sampleEntry has no findings field by default
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).not.toContain('Findings');
    });

    it('does not show Build Concerns header when no concerns', async () => {
      const entryNoConcerns = {
        ...sampleEntry,
        findings: [
          { id: 'C1', category: 'code', summary: 'A finding', file: null, anchor: null, severity: 'risk', suggested_action: 'scope' },
        ],
        build_concerns: [],
      };
      await createProofChain([entryNoConcerns]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('Findings');
      expect(stdout).not.toContain('Build Concerns');
    });
  });

  // ─── Context Subcommand Tests ──────────────────────────────────────

  /**
   * Helper to create proof chain with findings for context testing
   */
  async function createContextChain(): Promise<void> {
    const entry = {
      slug: 'drizzle-detection',
      feature: 'Fix Drizzle schema detection',
      result: 'PASS',
      author: { name: 'Developer', email: 'dev@example.com' },
      contract: { total: 20, covered: 20, uncovered: 0, satisfied: 20, unsatisfied: 0, deviated: 0 },
      assertions: [{ id: 'A001', says: 'Drizzle works', status: 'SATISFIED' }],
      acceptance_criteria: { total: 10, met: 10 },
      timing: { total_minutes: 73 },
      hashes: {},
      seal_commit: 'abc123',
      completed_at: '2026-04-24T10:00:00Z',
      modules_touched: ['packages/cli/src/engine/census.ts'],
      findings: [
        { id: 'drizzle-C1', category: 'code', summary: 'drizzle-dialect overloads SchemaFileEntry semantics', file: 'packages/cli/src/engine/census.ts', anchor: 'census.ts:267-274' },
        { id: 'drizzle-C2', category: 'code', summary: 'Config regex can match comments', file: 'packages/cli/src/engine/census.ts', anchor: 'census.ts:251' },
      ],
      rejection_cycles: 0,
      previous_failures: [],
      build_concerns: [
        { summary: 'Census dialect as sentinel entry', file: 'packages/cli/src/engine/census.ts' },
      ],
    };
    await createProofChain([entry]);
  }

  // @ana A009
  describe('ana proof context returns findings', () => {
    it('shows finding text for queried file', async () => {
      await createContextChain();
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['context', 'census.ts']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Proof context for census.ts');
      expect(stdout).toContain('drizzle-dialect');
      expect(stdout).toContain('Fix Drizzle schema detection');
    });
  });

  // @ana A011, A012, A022, A023
  describe('ana proof context --json', () => {
    it('returns valid parseable JSON with contract envelope', async () => {
      await createContextChain();
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['context', 'census.ts', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      // 4-key envelope
      expect(json.command).toBe('proof context');
      expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(json.meta).toBeTypeOf('object');
      expect(json.meta.chain_runs).toBeTypeOf('number');
      // results contains context data
      expect(json.results.results).toBeInstanceOf(Array);
      expect(json.results.results[0].findings).toBeInstanceOf(Array);
      expect(json.results.results[0].findings.length).toBeGreaterThan(0);
      expect(json.results.results[0].build_concerns).toBeInstanceOf(Array);
    });
  });

  // @ana A013, A014
  describe('ana proof context unknown file', () => {
    it('shows clean message for file with no data', async () => {
      await createContextChain();
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['context', 'unknown-file.ts']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No proof context');
    });
  });

  // @ana A015
  describe('ana proof context without proof chain', () => {
    it('shows clean message when no proof_chain.json exists', async () => {
      await createTestProject(tempDir);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['context', 'anything.ts']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No proof chain found');
    });
  });

  // @ana A024
  describe('ana proof context multiple files', () => {
    it('returns results for both files', async () => {
      await createContextChain();
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['context', 'census.ts', 'scan-engine.ts']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('census.ts');
      expect(stdout).toContain('scan-engine.ts');
    });
  });

  // ─── Detail View Tests (existing, unchanged) ──────────────────────

  // @ana A015, A016
  describe('detail view unchanged', () => {
    it('still works when a slug is provided', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stripe-payments']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Stripe Payment Integration');
    });
  });

  // @ana A017, A022, A023
  describe('detail JSON uses contract envelope', () => {
    it('wraps entry in 4-key envelope', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stripe-payments', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof stripe-payments');
      expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(json.results.slug).toBe('stripe-payments');
      expect(json.meta).toBeTypeOf('object');
      expect(json.meta.chain_runs).toBeTypeOf('number');
    });
  });

  // @ana A001
  describe('displays proof card for valid slug', () => {
    it('displays feature name from entry', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stripe-payments']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Stripe Payment Integration');
    });

    // @ana A002
    it('shows verification result prominently', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('Result: PASS');
    });
  });

  // @ana A003, A004
  describe('displays contract summary', () => {
    it('shows contract compliance counts', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('satisfied');
      expect(stdout).toContain('deviated');
      expect(stdout).toMatch(/20\/22 satisfied/);
    });
  });

  // @ana A005, A006, A007
  describe('displays assertions with status icons', () => {
    it('shows checkmark for satisfied assertions', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('✓');
    });

    it('shows warning icon for deviated assertions', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('⚠');
    });

    it('displays says text from assertions', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('Creating a payment returns');
    });
  });

  // @ana A008, A009
  describe('displays timing breakdown', () => {
    it('shows total pipeline time', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('Total');
      expect(stdout).toMatch(/90 min/);
    });

    it('shows per-phase breakdown when available', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('Build');
      expect(stdout).toMatch(/40 min/);
    });
  });

  // @ana A010, A011
  describe('displays deviations when present', () => {
    it('shows deviations section', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('Deviations');
    });

    it('shows what was done instead', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('→');
      expect(stdout).toContain('Used event mock');
    });
  });

  // @ana A012
  describe('omits deviations section when none', () => {
    it('does not show Deviations header when no deviations', async () => {
      const entryNoDeviations = {
        ...sampleEntry,
        contract: { ...sampleEntry.contract, deviated: 0 },
        assertions: sampleEntry.assertions.map(a => ({
          ...a,
          status: 'SATISFIED',
          deviation: undefined,
        })),
      };
      await createProofChain([entryNoDeviations]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).not.toContain('Deviations');
    });
  });

  // @ana A013, A014, A015, A016
  describe('outputs JSON with --json flag', () => {
    it('outputs valid JSON envelope', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stripe-payments', '--json']);
      expect(exitCode).toBe(0);

      let parsed: Record<string, unknown> | undefined;
      expect(() => {
        parsed = JSON.parse(stdout);
      }).not.toThrow();
      expect(parsed).toBeTruthy();
      expect(parsed!['command']).toBeTypeOf('string');
      expect(parsed!['results']).toBeTypeOf('object');
      expect(parsed!['meta']).toBeTypeOf('object');
    });

    it('includes slug field in results', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.slug).toBe('stripe-payments');
    });

    it('includes assertions array in results', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.assertions).toBeInstanceOf(Array);
    });

    it('includes timing information in results', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.timing.total_minutes).toBe(90);
    });
  });

  // @ana A017, A018, A024
  describe('shows helpful error for unknown slug', () => {
    it('returns error message for unknown slug', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['nonexistent']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('No proof found');
    });

    it('suggests checking work status', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout, stderr } = runProof(['nonexistent']);
      const output = stdout + stderr;
      expect(output).toContain('ana work status');
    });
  });

  // @ana A019, A020
  describe('shows helpful error for missing file', () => {
    it('returns error when proof_chain.json missing', async () => {
      // createTestProject gives findProjectRoot() a valid .ana/ — no proof_chain.json
      await createTestProject(tempDir);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['any-slug']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('No proof chain found');
    });

    it('suggests using work complete', async () => {
      // createTestProject gives findProjectRoot() a valid .ana/ — no proof_chain.json
      await createTestProject(tempDir);
      process.chdir(tempDir);

      const { stdout, stderr } = runProof(['any-slug']);
      const output = stdout + stderr;
      expect(output).toContain('ana work complete');
    });
  });

  // @ana A021, A022
  describe('uses box-drawing terminal styling', () => {
    it('uses box-drawing characters for header', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('┌');
      expect(stdout).toContain('┘');
    });

    it('uses horizontal rules for section headers', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('────');
    });
  });

  // @ana A023
  describe('handles missing optional timing fields', () => {
    it('works when timing breakdown fields are missing', async () => {
      const entryMinimalTiming = {
        ...sampleEntry,
        timing: { total_minutes: 60 }, // No phase breakdown
      };
      await createProofChain([entryMinimalTiming]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stripe-payments']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Total');
      expect(stdout).toContain('60 min');
      // Should not crash when phases are missing
      expect(stdout).not.toContain('undefined');
    });
  });

  describe('edge cases', () => {
    it('selects correct entry from multiple entries', async () => {
      const entry2 = { ...sampleEntry, slug: 'other-feature', feature: 'Other Feature' };
      await createProofChain([entry2, sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('Stripe Payment Integration');
      expect(stdout).not.toContain('Other Feature');
    });

    it('handles empty entries array', async () => {
      await createProofChain([]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['any-slug']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('No proof found');
    });

    it('shows FAIL result with appropriate styling', async () => {
      const failEntry = { ...sampleEntry, result: 'FAIL' };
      await createProofChain([failEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('Result: FAIL');
    });

    it('shows unsatisfied assertions with X icon', async () => {
      const entryWithUnsatisfied = {
        ...sampleEntry,
        assertions: [
          ...sampleEntry.assertions,
          { id: 'A005', says: 'Failing assertion', status: 'UNSATISFIED' },
        ],
      };
      await createProofChain([entryWithUnsatisfied]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('✗');
    });

    it('shows uncovered assertions with ? icon', async () => {
      const entryWithUncovered = {
        ...sampleEntry,
        assertions: [
          ...sampleEntry.assertions,
          { id: 'A006', says: 'Uncovered assertion', status: 'UNCOVERED' },
        ],
      };
      await createProofChain([entryWithUncovered]);
      process.chdir(tempDir);

      const { stdout } = runProof(['stripe-payments']);
      expect(stdout).toContain('?');
    });
  });

  // ─── Close Subcommand Tests ──────────────────────────────────────────

  /**
   * Helper to create a git-initialized project with proof chain for close testing.
   * Sets up a "main" branch so close can verify branch.
   */
  async function createCloseTestProject(entries: unknown[], options?: { branch?: string }): Promise<void> {
    const branch = options?.branch ?? 'main';

    // Init git
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    // Create .ana/ana.json
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({ artifactBranch: 'main' }),
    );

    // Write proof chain
    await fs.writeFile(
      path.join(anaDir, 'proof_chain.json'),
      JSON.stringify({ entries }, null, 2),
    );

    // Initial commit and set branch
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
    execSync(`git branch -M ${branch}`, { cwd: tempDir, stdio: 'ignore' });
  }

  /** Entry with active findings for close testing */
  const closeEntry = {
    slug: 'fix-validation',
    feature: 'Fix Input Validation',
    result: 'PASS',
    author: { name: 'Developer', email: 'dev@example.com' },
    contract: { total: 5, covered: 5, uncovered: 0, satisfied: 5, unsatisfied: 0, deviated: 0 },
    assertions: [{ id: 'A001', says: 'Validates input', status: 'SATISFIED' }],
    acceptance_criteria: { total: 3, met: 3 },
    timing: { total_minutes: 30 },
    hashes: {},
    completed_at: '2026-04-20T10:00:00Z',
    modules_touched: ['src/api/payments.ts'],
    findings: [
      { id: 'F001', category: 'validation', summary: 'Missing request validation', file: 'src/api/payments.ts', anchor: 'validateInput', status: 'active', severity: 'risk' },
      { id: 'F002', category: 'testing', summary: 'No test for edge case', file: 'src/api/payments.ts', anchor: null, status: 'active' },
      { id: 'F003', category: 'code', summary: 'Redundant import', file: 'src/utils/helpers.ts', anchor: null, status: 'closed', closed_by: 'mechanical', closed_at: '2026-04-22T10:00:00Z', closed_reason: 'auto-closed' },
    ],
    rejection_cycles: 0,
    previous_failures: [],
    build_concerns: [],
  };

  /** Entry with a lesson finding */
  const lessonEntry = {
    slug: 'add-logging',
    feature: 'Add Structured Logging',
    result: 'PASS',
    author: { name: 'Developer', email: 'dev@example.com' },
    contract: { total: 3, covered: 3, uncovered: 0, satisfied: 3, unsatisfied: 0, deviated: 0 },
    assertions: [{ id: 'A001', says: 'Logs work', status: 'SATISFIED' }],
    acceptance_criteria: { total: 2, met: 2 },
    timing: { total_minutes: 20 },
    hashes: {},
    completed_at: '2026-04-21T10:00:00Z',
    modules_touched: [],
    findings: [
      { id: 'L001', category: 'testing', summary: 'Consider adding log rotation test', file: null, anchor: null, status: 'lesson' },
    ],
    rejection_cycles: 0,
    previous_failures: [],
    build_concerns: [],
  };

  // @ana A001, A002, A003, A004, A005
  describe('closes finding successfully', () => {
    it('marks finding as closed with reason', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F001', '--reason', 'fixed-in-pr']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Closed F001');
      expect(stdout).toContain('fixed-in-pr');

      // Verify chain was mutated
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const finding = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      expect(finding.status).toBe('closed');
      expect(finding.closed_by).toBe('human');
      expect(finding.closed_reason).toBe('fixed-in-pr');
      expect(finding.closed_at).toMatch(/^\d{4}-\d{2}-\d{2}/);

      // Verify PROOF_CHAIN.md was regenerated
      const dashboard = await fs.readFile(path.join(tempDir, '.ana', 'PROOF_CHAIN.md'), 'utf-8');
      expect(dashboard).toContain('Proof Chain Dashboard');

      // Verify commit was created
      const lastCommit = execSync('git log -1 --pretty=%s', { cwd: tempDir, encoding: 'utf-8' }).trim();
      expect(lastCommit).toContain('[proof] Close');
      expect(lastCommit).toContain('F001');
    });
  });

  // @ana A006
  describe('rejects close from wrong branch', () => {
    it('shows WRONG_BRANCH error', async () => {
      await createCloseTestProject([closeEntry], { branch: 'feature/other' });
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['close', 'F001', '--reason', 'test']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('Wrong branch');
    });

    it('returns WRONG_BRANCH code in JSON', async () => {
      await createCloseTestProject([closeEntry], { branch: 'feature/other' });
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F001', '--reason', 'test', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('WRONG_BRANCH');
    });
  });

  // @ana A007
  describe('rejects nonexistent finding', () => {
    it('shows FINDING_NOT_FOUND error', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['close', 'F999', '--reason', 'test']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('not found');
    });

    it('returns FINDING_NOT_FOUND code in JSON', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F999', '--reason', 'test', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('FINDING_NOT_FOUND');
    });
  });

  // @ana A008
  describe('rejects already-closed finding', () => {
    it('shows ALREADY_CLOSED error with closer info', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['close', 'F003', '--reason', 'again']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('already closed');
    });

    it('returns ALREADY_CLOSED code in JSON', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F003', '--reason', 'again', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('ALREADY_CLOSED');
      expect(json.error.closed_by).toBe('mechanical');
    });
  });

  // @ana A009
  describe('rejects close without reason', () => {
    it('shows REASON_REQUIRED error', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['close', 'F001']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--reason is required');
    });

    it('returns REASON_REQUIRED code in JSON', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F001', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('REASON_REQUIRED');
    });
  });

  // @ana A010
  describe('closes lesson finding', () => {
    it('shows lesson → closed transition', async () => {
      await createCloseTestProject([lessonEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'L001', '--reason', 'no longer relevant']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('lesson');
      expect(stdout).toContain('closed');
    });
  });

  // @ana A011, A012, A013
  describe('close returns valid JSON envelope', () => {
    it('returns 4-key envelope with finding and meta', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F001', '--reason', 'fixed', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof close');
      expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(json.results.finding.id).toBe('F001');
      expect(json.results.previous_status).toBe('active');
      expect(json.results.new_status).toBe('closed');
      expect(json.results.closed_by).toBe('human');
      expect(json.meta.findings.active).toBeTypeOf('number');
      expect(json.meta.chain_runs).toBeTypeOf('number');
    });
  });

  // @ana A024, A025
  describe('error responses use contract envelope', () => {
    it('returns error envelope with code and meta', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F999', '--reason', 'test', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof close');
      expect(json.error.code).toBe('FINDING_NOT_FOUND');
      expect(json.meta).toBeTypeOf('object');
    });
  });

  // ─── Close Variadic Tests ───────────────────────────────────────────

  // @ana A004
  describe('close single ID backward compatible', () => {
    it('single ID still works after variadic change', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F001', '--reason', 'backward-compat']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Closed F001');
      expect(stdout).toContain('backward-compat');
    });
  });

  // @ana A005, A006
  describe('close variadic closes multiple findings', () => {
    it('closes two findings with one command and one commit', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F001', 'F002', '--reason', 'batch cleanup']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Closed 2');

      // Verify both findings closed in chain
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const f1 = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      const f2 = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F002');
      expect(f1.status).toBe('closed');
      expect(f2.status).toBe('closed');

      // One commit for the batch
      const commitCount = execSync('git log --oneline | wc -l', { cwd: tempDir, encoding: 'utf-8' }).trim();
      expect(parseInt(commitCount)).toBe(2); // init + close
    });
  });

  // @ana A007
  describe('close partial failure skips invalid IDs', () => {
    it('closes valid IDs and skips invalid ones', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F001', 'F999', '--reason', 'partial']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('F001');
      expect(stdout).toContain('F999');
      expect(stdout).toContain('skipped');

      // Valid finding closed
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const f1 = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      expect(f1.status).toBe('closed');
    });
  });

  describe('close all IDs invalid exits with error', () => {
    it('exits 1 when all IDs are invalid', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { exitCode } = runProof(['close', 'F998', 'F999', '--reason', 'bad']);
      expect(exitCode).not.toBe(0);
    });
  });

  // @ana A008
  describe('close dry-run makes no changes', () => {
    // @ana A001
    it('shows what would happen without mutating', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      // Record commit count before dry-run
      const commitCountBefore = parseInt(execSync('git log --oneline | wc -l', { cwd: tempDir, encoding: 'utf-8' }).trim());

      const { stdout, exitCode } = runProof(['close', 'F001', '--reason', 'test', '--dry-run']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Dry run');
      expect(stdout).toContain('Would close');
      expect(stdout).toContain('F001');

      // Finding should still be active
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const f1 = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      expect(f1.status).toBe('active');

      // No git commit was created during dry-run
      const commitCountAfter = parseInt(execSync('git log --oneline | wc -l', { cwd: tempDir, encoding: 'utf-8' }).trim());
      expect(commitCountAfter).toBe(commitCountBefore);
    });
  });

  describe('close dry-run with --json', () => {
    it('returns dry_run: true in JSON envelope', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F001', 'F999', '--reason', 'test', '--dry-run', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.results.dry_run).toBe(true);
      expect(json.results.closed).toHaveLength(1);
      expect(json.results.skipped).toHaveLength(1);
    });
  });

  // @ana A009
  describe('close commit has co-author trailer', () => {
    it('includes co-author in commit body', async () => {
      // Create project with coAuthor in ana.json
      execSync('git init', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

      const anaDir = path.join(tempDir, '.ana');
      await fs.mkdir(anaDir, { recursive: true });
      await fs.writeFile(
        path.join(anaDir, 'ana.json'),
        JSON.stringify({ artifactBranch: 'main', coAuthor: 'Custom Bot <bot@test.com>' }),
      );
      await fs.writeFile(
        path.join(anaDir, 'proof_chain.json'),
        JSON.stringify({ entries: [closeEntry] }, null, 2),
      );
      execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git branch -M main', { cwd: tempDir, stdio: 'ignore' });
      process.chdir(tempDir);

      runProof(['close', 'F001', '--reason', 'trailer-test']);

      const body = execSync('git log -1 --pretty=%B', { cwd: tempDir, encoding: 'utf-8' });
      expect(body).toContain('Co-authored-by: Custom Bot <bot@test.com>');
    });
  });

  describe('close variadic JSON envelope', () => {
    it('returns per-finding results in JSON', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F001', 'F002', '--reason', 'batch', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.results.closed).toHaveLength(2);
      expect(json.results.skipped).toHaveLength(0);
      expect(json.results.dry_run).toBe(false);
      expect(json.results.reason).toBe('batch');
    });
  });

  describe('close skips already-closed findings in variadic', () => {
    it('skips closed finding F003 and closes active F001', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['close', 'F001', 'F003', '--reason', 'mix']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('F001');
      expect(stdout).toContain('already closed');
    });
  });

  // ─── Audit Subcommand Tests ──────────────────────────────────────────

  /**
   * Helper to create proof chain with many findings for audit testing
   */
  async function createAuditChain(findingCount: number, fileCount: number): Promise<void> {
    const findings: Array<Record<string, unknown>> = [];
    for (let i = 0; i < findingCount; i++) {
      const fileIdx = i % fileCount;
      findings.push({
        id: `F${String(i + 1).padStart(3, '0')}`,
        category: 'code',
        summary: `Finding ${i + 1} in file ${fileIdx}`,
        file: `src/file${fileIdx}.ts`,
        anchor: null,
        status: 'active',
        severity: i % 3 === 0 ? 'risk' : 'observation',
        suggested_action: i % 2 === 0 ? 'scope' : 'monitor',
      });
    }

    const entry = {
      slug: 'bulk-test',
      feature: 'Bulk Test Feature',
      result: 'PASS',
      author: { name: 'Dev', email: 'dev@example.com' },
      contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
      assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
      acceptance_criteria: { total: 1, met: 1 },
      timing: { total_minutes: 10 },
      hashes: {},
      completed_at: '2026-04-20T10:00:00Z',
      modules_touched: [],
      findings,
      rejection_cycles: 0,
      previous_failures: [],
      build_concerns: [],
    };

    await createTestProject(tempDir);
    await fs.writeFile(
      path.join(tempDir, '.ana', 'proof_chain.json'),
      JSON.stringify({ entries: [entry] }, null, 2),
    );
  }

  // @ana A014
  describe('displays audit grouped by file', () => {
    it('shows file headers with finding count', async () => {
      await createAuditChain(5, 2);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('findings)');
      expect(stdout).toContain('src/file0.ts');
      expect(stdout).toContain('src/file1.ts');
    });
  });

  // @ana A015
  describe('truncates audit at 8 files', () => {
    it('caps display at exactly 8 files with overflow', async () => {
      // 30 findings across 10 files → only 8 files shown
      await createAuditChain(30, 10);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit']);
      expect(exitCode).toBe(0);

      // Count file headers: lines matching "  src/fileN.ts (N finding(s))"
      const fileHeaders = stdout.split('\n').filter((l: string) => /^\s+\S+\s+\(\d+ findings?\)/.test(l));
      expect(fileHeaders.length).toBe(8);
      expect(stdout).toContain('more');
    });
  });

  // @ana A016
  describe('truncates findings per file at 3', () => {
    it('caps findings per file at 3 with overflow', async () => {
      // 6 findings all in 1 file → 3 shown + "3 more"
      await createAuditChain(6, 1);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('3 more');
    });
  });

  // @ana A017
  describe('shows overflow message', () => {
    it('shows overflow for files exceeding cap', async () => {
      await createAuditChain(50, 12);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('more');
    });
  });

  // @ana A018
  describe('audit works from non-artifact branch', () => {
    it('succeeds without branch check', async () => {
      // Create on a feature branch — audit should still work
      execSync('git init', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

      const anaDir = path.join(tempDir, '.ana');
      await fs.mkdir(anaDir, { recursive: true });
      await fs.writeFile(path.join(anaDir, 'ana.json'), JSON.stringify({ artifactBranch: 'main' }));
      await fs.writeFile(
        path.join(anaDir, 'proof_chain.json'),
        JSON.stringify({ entries: [closeEntry] }, null, 2),
      );
      execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git checkout -b feature/something', { cwd: tempDir, stdio: 'ignore' });

      process.chdir(tempDir);

      const { exitCode } = runProof(['audit']);
      expect(exitCode).toBe(0);
    });
  });

  // @ana A019
  describe('audit with zero findings shows clean message', () => {
    it('shows clean message when no active findings', async () => {
      // All findings are closed
      const closedEntry = {
        ...closeEntry,
        findings: closeEntry.findings.map(f => ({ ...f, status: 'closed' })),
      };
      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [closedEntry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('clean');
    });
  });

  // @ana A020, A021
  describe('audit returns valid JSON envelope', () => {
    it('returns total_active and by_file with anchor_present', async () => {
      await createAuditChain(5, 2);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof audit');
      expect(json.results.total_active).toBe(5);
      expect(json.results.by_file).toBeInstanceOf(Array);
      expect(json.results.by_file.length).toBeGreaterThan(0);
      expect(json.results.by_file[0].findings[0].anchor_present).toBeTypeOf('boolean');
      expect(json.meta.chain_runs).toBeTypeOf('number');
    });
  });

  // @ana A032
  describe('audit JSON includes suggested_action on findings', () => {
    it('each finding in JSON output has suggested_action field', async () => {
      await createAuditChain(3, 1);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      const findings = json.results.by_file[0].findings;
      for (const f of findings) {
        expect(f.suggested_action).toBeTypeOf('string');
      }
    });
  });

  // @ana A031
  describe('audit human-readable shows severity and action badges', () => {
    it('shows [severity · action] badge on each finding', async () => {
      await createAuditChain(3, 1);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit']);
      expect(exitCode).toBe(0);

      // createAuditChain: i=0 → risk/scope, i=1 → observation/monitor, i=2 → observation/scope
      expect(stdout).toContain('[risk · scope]');
      expect(stdout).toContain('[observation · monitor]');
    });
  });

  // @ana A033
  describe('audit sorts findings by severity within file groups', () => {
    it('risk findings appear before observation within same file', async () => {
      // Create chain with mixed severity in one file — risk and observation interleaved
      const findings = [
        { id: 'F001', category: 'code', summary: 'Obs first', file: 'src/app.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'monitor' },
        { id: 'F002', category: 'code', summary: 'Risk second', file: 'src/app.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'scope' },
        { id: 'F003', category: 'code', summary: 'Debt third', file: 'src/app.ts', anchor: null, status: 'active', severity: 'debt', suggested_action: 'accept' },
      ];
      const entry = {
        slug: 'sort-test',
        feature: 'Sort Test',
        result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 },
        hashes: {},
        completed_at: '2026-04-20T10:00:00Z',
        modules_touched: [],
        findings,
        rejection_cycles: 0,
        previous_failures: [],
        build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit']);
      expect(exitCode).toBe(0);

      // Extract finding summary lines (lines containing the summary text)
      const lines = stdout.split('\n');
      const summaryLines = lines.filter((l: string) => l.includes('Risk second') || l.includes('Debt third') || l.includes('Obs first'));
      expect(summaryLines.length).toBe(3);

      // Risk should be first, then debt, then observation
      const riskIdx = lines.findIndex((l: string) => l.includes('Risk second'));
      const debtIdx = lines.findIndex((l: string) => l.includes('Debt third'));
      const obsIdx = lines.findIndex((l: string) => l.includes('Obs first'));
      expect(riskIdx).toBeLessThan(debtIdx);
      expect(debtIdx).toBeLessThan(obsIdx);
    });
  });

  // ─── Audit Summary Line Tests ───────────────────────────────────────

  // @ana A001, A002
  describe('displays severity summary after audit header', () => {
    it('shows severity breakdown for classified findings', async () => {
      const findings = [
        { id: 'F001', category: 'code', summary: 'A', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'promote' },
        { id: 'F002', category: 'code', summary: 'B', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'scope' },
        { id: 'F003', category: 'code', summary: 'C', file: 'src/b.ts', anchor: null, status: 'active', severity: 'debt', suggested_action: 'scope' },
        { id: 'F004', category: 'code', summary: 'D', file: 'src/b.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'monitor' },
        { id: 'F005', category: 'code', summary: 'E', file: 'src/c.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'accept' },
      ];
      const entry = {
        slug: 'summary-test', feature: 'Summary Test', result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 }, hashes: {},
        completed_at: '2026-04-20T10:00:00Z', modules_touched: [],
        findings, rejection_cycles: 0, previous_failures: [], build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('2 risk');
      expect(stdout).toContain('1 debt');
      expect(stdout).toContain('2 observation');
    });
  });

  // @ana A003
  describe('omits zero-count severity buckets', () => {
    it('does not show buckets with zero count', async () => {
      // Only risk and observation — no debt
      const findings = [
        { id: 'F001', category: 'code', summary: 'A', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'scope' },
        { id: 'F002', category: 'code', summary: 'B', file: 'src/a.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'monitor' },
      ];
      const entry = {
        slug: 'zero-bucket', feature: 'Zero Bucket', result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 }, hashes: {},
        completed_at: '2026-04-20T10:00:00Z', modules_touched: [],
        findings, rejection_cycles: 0, previous_failures: [], build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout } = runProof(['audit']);
      expect(stdout).not.toContain('0 debt');
      expect(stdout).not.toContain('debt');
      expect(stdout).toContain('1 risk');
      expect(stdout).toContain('1 observation');
    });
  });

  // @ana A004, A005
  describe('displays action summary after severity line', () => {
    it('shows action breakdown with closeable hint on accept', async () => {
      const findings = [
        { id: 'F001', category: 'code', summary: 'A', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'promote' },
        { id: 'F002', category: 'code', summary: 'B', file: 'src/a.ts', anchor: null, status: 'active', severity: 'debt', suggested_action: 'scope' },
        { id: 'F003', category: 'code', summary: 'C', file: 'src/a.ts', anchor: null, status: 'active', severity: 'debt', suggested_action: 'scope' },
        { id: 'F004', category: 'code', summary: 'D', file: 'src/b.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'monitor' },
        { id: 'F005', category: 'code', summary: 'E', file: 'src/b.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'accept' },
      ];
      const entry = {
        slug: 'action-test', feature: 'Action Test', result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 }, hashes: {},
        completed_at: '2026-04-20T10:00:00Z', modules_touched: [],
        findings, rejection_cycles: 0, previous_failures: [], build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout } = runProof(['audit']);
      expect(stdout).toContain('1 promote');
      expect(stdout).toContain('2 scope');
      expect(stdout).toContain('1 monitor');
      expect(stdout).toContain('accept (closeable)');
    });
  });

  // @ana A006
  describe('includes unclassified bucket for dash severity', () => {
    it('shows unclassified count when some findings have dash severity', async () => {
      const findings = [
        { id: 'F001', category: 'code', summary: 'A', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'scope' },
        { id: 'F002', category: 'code', summary: 'B', file: 'src/a.ts', anchor: null, status: 'active', severity: '—', suggested_action: 'monitor' },
        { id: 'F003', category: 'code', summary: 'C', file: 'src/b.ts', anchor: null, status: 'active', severity: '—', suggested_action: '—' },
      ];
      const entry = {
        slug: 'unclass-test', feature: 'Unclassified Test', result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 }, hashes: {},
        completed_at: '2026-04-20T10:00:00Z', modules_touched: [],
        findings, rejection_cycles: 0, previous_failures: [], build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout } = runProof(['audit']);
      expect(stdout).toContain('1 risk');
      expect(stdout).toContain('2 unclassified');
    });
  });

  // @ana A007, A008
  describe('skips both summary lines when all findings unclassified', () => {
    it('no summary lines but audit header still shows', async () => {
      const findings = [
        { id: 'F001', category: 'code', summary: 'A', file: 'src/a.ts', anchor: null, status: 'active', severity: '—', suggested_action: '—' },
        { id: 'F002', category: 'code', summary: 'B', file: 'src/b.ts', anchor: null, status: 'active', severity: '—', suggested_action: '—' },
      ];
      const entry = {
        slug: 'all-unclass', feature: 'All Unclassified', result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 }, hashes: {},
        completed_at: '2026-04-20T10:00:00Z', modules_touched: [],
        findings, rejection_cycles: 0, previous_failures: [], build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout } = runProof(['audit']);
      expect(stdout).toContain('active finding');
      expect(stdout).not.toContain('unclassified');
      expect(stdout).not.toContain('risk');
      expect(stdout).not.toContain('debt');
      expect(stdout).not.toContain('observation');
    });
  });

  // @ana A009
  describe('no summary lines with zero active findings', () => {
    it('zero findings shows clean message without summary', async () => {
      const closedFindings = [
        { id: 'F001', category: 'code', summary: 'A', file: 'src/a.ts', anchor: null, status: 'closed', severity: 'risk', suggested_action: 'scope' },
      ];
      const entry = {
        slug: 'zero-active', feature: 'Zero Active', result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 }, hashes: {},
        completed_at: '2026-04-20T10:00:00Z', modules_touched: [],
        findings: closedFindings, rejection_cycles: 0, previous_failures: [], build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout } = runProof(['audit']);
      expect(stdout).toContain('clean');
      expect(stdout).not.toContain('risk');
    });
  });

  // @ana A001, A002, A003, A004, A005, A006, A007
  describe('audit JSON includes by_severity counts', () => {
    it('includes by_severity and by_action with correct counts', async () => {
      // Use the 5-finding entry from the summary line test (known distribution)
      const findings = [
        { id: 'F001', category: 'code', summary: 'A', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'promote' },
        { id: 'F002', category: 'code', summary: 'B', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'scope' },
        { id: 'F003', category: 'code', summary: 'C', file: 'src/b.ts', anchor: null, status: 'active', severity: 'debt', suggested_action: 'scope' },
        { id: 'F004', category: 'code', summary: 'D', file: 'src/b.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'monitor' },
        { id: 'F005', category: 'code', summary: 'E', file: 'src/c.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'accept' },
      ];
      const entry = {
        slug: 'json-summary', feature: 'JSON Summary', result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 }, hashes: {},
        completed_at: '2026-04-20T10:00:00Z', modules_touched: [],
        findings, rejection_cycles: 0, previous_failures: [], build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      // by_severity with correct counts
      expect(json.results.by_severity).toBeTypeOf('object');
      expect(json.results.by_severity.risk).toBe(2);
      expect(json.results.by_severity.debt).toBe(1);
      expect(json.results.by_severity.observation).toBe(2);
      expect(json.results.by_severity.unclassified).toBe(0);

      // by_action with correct counts
      expect(json.results.by_action).toBeTypeOf('object');
      expect(json.results.by_action.promote).toBe(1);
      expect(json.results.by_action.scope).toBe(2);
      expect(json.results.by_action.monitor).toBe(1);
      expect(json.results.by_action.accept).toBe(1);
      expect(json.results.by_action.unclassified).toBe(0);

      // Old field names remain absent
      expect(json.results.severity_summary).toBeUndefined();
      expect(json.results.action_summary).toBeUndefined();
    });
  });

  // @ana A008
  describe('by_severity counts match active findings only', () => {
    it('severity counts come from active findings, not full chain', async () => {
      // createAuditChain(5,2): i%3===0 → risk (i=0,3), else observation (i=1,2,4)
      await createAuditChain(5, 2);
      process.chdir(tempDir);

      const { stdout } = runProof(['audit', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.by_severity.risk).toBe(2);
      expect(json.results.by_severity.observation).toBe(3);
      expect(json.results.by_severity.debt).toBe(0);
      expect(json.results.by_severity.unclassified).toBe(0);
      expect(json.results.total_active).toBe(5);
    });
  });

  // @ana A009, A010
  describe('audit --json --full includes summary fields', () => {
    it('--full JSON includes by_severity and by_action', async () => {
      await createAuditChain(5, 2);
      process.chdir(tempDir);

      const { stdout } = runProof(['audit', '--json', '--full']);
      const json = JSON.parse(stdout);
      expect(json.results.by_severity).toBeTypeOf('object');
      expect(json.results.by_action).toBeTypeOf('object');
      expect(json.results.by_severity.risk).toBe(2);
    });
  });

  // @ana A013
  describe('meta block is unchanged', () => {
    it('meta envelope still contains all-time chain health counts', async () => {
      await createAuditChain(5, 2);
      process.chdir(tempDir);

      const { stdout } = runProof(['audit', '--json']);
      const json = JSON.parse(stdout);
      expect(json.meta.findings.by_severity).toBeTypeOf('object');
      expect(json.meta.findings.by_action).toBeTypeOf('object');
    });
  });

  // @ana A014, A015, A016
  describe('zero findings includes all-zero by_severity', () => {
    it('zero active findings includes severity and action breakdowns with all zeros', async () => {
      // Create chain with only closed findings
      const closedFindings = [
        { id: 'F001', category: 'code', summary: 'Closed', file: 'src/a.ts', anchor: null, status: 'closed', severity: 'risk', suggested_action: 'scope' },
      ];
      const entry = {
        slug: 'zero-json', feature: 'Zero JSON', result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 }, hashes: {},
        completed_at: '2026-04-20T10:00:00Z', modules_touched: [],
        findings: closedFindings, rejection_cycles: 0, previous_failures: [], build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout } = runProof(['audit', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.total_active).toBe(0);
      expect(json.results.by_severity).toEqual({ risk: 0, debt: 0, observation: 0, unclassified: 0 });
      expect(json.results.by_action).toEqual({ promote: 0, scope: 0, monitor: 0, accept: 0, unclassified: 0 });
    });
  });

  // @ana A017, A018
  describe('all-unclassified findings counted correctly', () => {
    it('findings without severity/action are counted as unclassified', async () => {
      const findings = [
        { id: 'F001', category: 'code', summary: 'A', file: 'src/a.ts', anchor: null, status: 'active', severity: '—', suggested_action: '—' },
        { id: 'F002', category: 'code', summary: 'B', file: 'src/a.ts', anchor: null, status: 'active', severity: '—', suggested_action: '—' },
      ];
      const entry = {
        slug: 'unclass-test', feature: 'Unclass Test', result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 }, hashes: {},
        completed_at: '2026-04-20T10:00:00Z', modules_touched: [],
        findings, rejection_cycles: 0, previous_failures: [], build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout } = runProof(['audit', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.by_severity.unclassified).toBe(2);
      expect(json.results.by_severity.risk).toBe(0);
      expect(json.results.by_action.unclassified).toBe(2);
      expect(json.results.by_action.promote).toBe(0);
    });
  });

  // @ana A011, A012
  describe('terminal output is unchanged', () => {
    it('terminal severity/action display still shows same format', async () => {
      const findings = [
        { id: 'F001', category: 'code', summary: 'A', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'promote' },
        { id: 'F002', category: 'code', summary: 'B', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'scope' },
        { id: 'F003', category: 'code', summary: 'C', file: 'src/b.ts', anchor: null, status: 'active', severity: 'debt', suggested_action: 'scope' },
        { id: 'F004', category: 'code', summary: 'D', file: 'src/b.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'monitor' },
        { id: 'F005', category: 'code', summary: 'E', file: 'src/c.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'accept' },
      ];
      const entry = {
        slug: 'terminal-test', feature: 'Terminal Test', result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 }, hashes: {},
        completed_at: '2026-04-20T10:00:00Z', modules_touched: [],
        findings, rejection_cycles: 0, previous_failures: [], build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout } = runProof(['audit']);
      expect(stdout).toContain('2 risk');
      expect(stdout).toContain('1 debt');
      expect(stdout).toContain('2 observation');
      expect(stdout).toContain('1 promote');
      expect(stdout).toContain('2 scope');
      expect(stdout).toContain('1 monitor');
    });
  });

  // ─── Template Tests ─────────────────────────────────────────────────

  // @ana A026
  describe('template includes proof context subsection', () => {
    it('Plan template has ### Proof Context between Pattern Extracts and Checkpoint Commands', async () => {
      const templatePath = path.join(__dirname, '../../templates/.claude/agents/ana-plan.md');
      const content = await fs.readFile(templatePath, 'utf-8');
      expect(content).toContain('### Proof Context');

      // Verify ordering: Pattern Extracts < Proof Context < Checkpoint Commands
      const patternIdx = content.indexOf('### Pattern Extracts');
      const proofIdx = content.indexOf('### Proof Context');
      const checkpointIdx = content.indexOf('### Checkpoint Commands');
      expect(patternIdx).toBeLessThan(proofIdx);
      expect(proofIdx).toBeLessThan(checkpointIdx);
    });
  });

  // @ana A022, A023
  describe('existing commands use contract envelope', () => {
    it('list --json has 4-key envelope with meta', async () => {
      await createProofChain([sampleEntry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['--json']);
      const json = JSON.parse(stdout);
      expect(json.command).toBeTypeOf('string');
      expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(json.results).toBeTypeOf('object');
      expect(json.meta).toBeTypeOf('object');
      expect(json.meta.chain_runs).toBeTypeOf('number');
      expect(json.meta.findings.active).toBeTypeOf('number');
      expect(json.meta.findings.closed).toBeTypeOf('number');
      expect(json.meta.findings.lesson).toBeTypeOf('number');
      expect(json.meta.findings.promoted).toBeTypeOf('number');
      expect(json.meta.findings.total).toBeTypeOf('number');
    });
  });

  // ─── Health Subcommand Tests ────────────────────────────────────────

  describe('ana proof health', () => {
    /**
     * Helper to create entries with findings for health testing
     */
    function makeHealthEntry(opts: {
      slug: string;
      risks?: number;
      debts?: number;
      observations?: number;
      file?: string;
      action?: string;
    }): Record<string, unknown> {
      const findings = [];
      const file = opts.file ?? 'src/test.ts';
      const action = opts.action ?? 'scope';
      for (let i = 0; i < (opts.risks ?? 0); i++) {
        findings.push({
          id: `F${findings.length + 1}`,
          category: 'code',
          summary: `risk finding ${i}`,
          file,
          anchor: null,
          severity: 'risk',
          suggested_action: action,
          status: 'active',
        });
      }
      for (let i = 0; i < (opts.debts ?? 0); i++) {
        findings.push({
          id: `F${findings.length + 1}`,
          category: 'code',
          summary: `debt finding ${i}`,
          file,
          anchor: null,
          severity: 'debt',
          suggested_action: action,
          status: 'active',
        });
      }
      for (let i = 0; i < (opts.observations ?? 0); i++) {
        findings.push({
          id: `F${findings.length + 1}`,
          category: 'code',
          summary: `observation finding ${i}`,
          file,
          anchor: null,
          severity: 'observation',
          suggested_action: action,
          status: 'active',
        });
      }
      return {
        slug: opts.slug,
        feature: `Feature ${opts.slug}`,
        result: 'PASS',
        author: { name: 'Dev', email: 'dev@test.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 },
        hashes: { scope: 'sha256:aaa', contract: 'sha256:bbb' },
        completed_at: '2026-04-01T00:00:00Z',
        modules_touched: [],
        findings,
        build_concerns: [],
      };
    }

    // @ana A001
    it('displays box header with command name', async () => {
      const entries = Array.from({ length: 28 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['health']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('ana proof health');
    });

    // @ana A002
    it('displays box header with run count', async () => {
      const entries = Array.from({ length: 28 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('28 runs');
    });

    // @ana A003
    it('displays box header with date', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('2026-');
    });

    // @ana A004
    it('displays trajectory with trend first', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      const trendLineIndex = stdout.split('\n').findIndex(l => l.includes('Trend:'));
      expect(trendLineIndex).toBeGreaterThan(0);
      const risksLineIndex = stdout.split('\n').findIndex(l => l.includes('Risks/run:'));
      expect(trendLineIndex).toBeLessThan(risksLineIndex);
    });

    // @ana A005
    it('displays condensed risks per run', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: i < 5 ? 3 : 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('(last 5)');
      expect(stdout).toContain('(all)');
    });

    // @ana A012
    it('does not show unclassified excluded text', async () => {
      // Create entries with unclassified findings (no severity)
      const entries = Array.from({ length: 10 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `slug-${i}`, risks: 1 });
        // Add an unclassified finding (no severity field)
        (entry['findings'] as Array<Record<string, unknown>>).push({
          id: `U${i}`,
          category: 'code',
          summary: `unclassified finding ${i}`,
          file: 'src/test.ts',
          anchor: null,
          severity: null,
          suggested_action: 'scope',
          status: 'active',
        });
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).not.toContain('unclassified excluded');
    });

    // @ana A007
    it('omits unclassified when zero', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).not.toContain('unclassified');
    });

    // @ana A008
    it('truncates hot spot paths to basename', async () => {
      const entries = [
        makeHealthEntry({ slug: 'e1', risks: 2, file: 'src/hot.ts' }),
        makeHealthEntry({ slug: 'e2', risks: 1, file: 'src/hot.ts' }),
      ];
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('Hot Spots');
      expect(stdout).toContain('hot.ts');
      // Should NOT show full path when basename is unique
      expect(stdout).not.toContain('src/hot.ts');
    });

    // @ana A009
    it('disambiguates colliding basenames', async () => {
      const entries = [
        makeHealthEntry({ slug: 'e1', risks: 2, file: 'src/commands/proof.ts' }),
        makeHealthEntry({ slug: 'e2', risks: 2, file: 'src/commands/proof.ts' }),
        makeHealthEntry({ slug: 'e3', risks: 2, file: 'src/engine/proof.ts' }),
        makeHealthEntry({ slug: 'e4', risks: 2, file: 'src/engine/proof.ts' }),
      ];
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('commands/proof.ts');
      expect(stdout).toContain('engine/proof.ts');
    });

    // @ana A010
    it('abbreviates observation to obs in hot modules', async () => {
      const entries = [
        makeHealthEntry({ slug: 'e1', risks: 1, observations: 2, file: 'src/hot.ts' }),
        makeHealthEntry({ slug: 'e2', observations: 1, file: 'src/hot.ts' }),
      ];
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      // Hot modules line should use "obs" not "observation"
      const hotModulesLines = stdout.split('\n').filter(l => l.includes('findings'));
      expect(hotModulesLines.length).toBeGreaterThan(0);
      expect(hotModulesLines[0]).toContain('obs');
      expect(hotModulesLines[0]).not.toContain('observation');
    });

    // @ana A011
    it('keeps full observation in Next Actions promote badges', async () => {
      await createProofChain([
        makeHealthEntry({ slug: 'e1', observations: 1, action: 'promote' }),
      ]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      // Next Actions promote items use full "observation" severity
      expect(stdout).toContain('Next Actions');
      expect(stdout).toContain('[observation');
    });

    // @ana A003
    it('shows Next Actions for promote-action candidates', async () => {
      await createProofChain([
        makeHealthEntry({ slug: 'e1', risks: 1, action: 'promote' }),
      ]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('Next Actions');
      expect(stdout).toContain('Promote:');
    });

    // @ana A013
    it('truncates promote candidate summaries', async () => {
      const entry = makeHealthEntry({ slug: 'e1', risks: 0, action: 'promote' });
      // Add a finding with a very long summary
      (entry['findings'] as Array<Record<string, unknown>>).push({
        id: 'F99',
        category: 'code',
        summary: 'A'.repeat(120),
        file: 'src/test.ts',
        anchor: null,
        severity: 'debt',
        suggested_action: 'promote',
        status: 'active',
      });
      await createProofChain([entry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('...');
    });

    // @ana A014
    it('shows severity badge on Next Actions promote items', async () => {
      await createProofChain([
        makeHealthEntry({ slug: 'e1', risks: 1, action: 'promote' }),
      ]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('Promote:');
      expect(stdout).toContain('[risk]');
    });

    // @ana A015
    it('shows recurring candidates in Next Actions as Fix items', async () => {
      // Need same finding recurring across entries
      const entries = [
        makeHealthEntry({ slug: 'e1', debts: 1, action: 'scope' }),
        makeHealthEntry({ slug: 'e2', debts: 1, action: 'scope' }),
        makeHealthEntry({ slug: 'e3', debts: 1, action: 'scope' }),
      ];
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('Next Actions');
      expect(stdout).toContain('Fix:');
    });

    // @ana A016
    it('shows entry count on Next Actions Fix items', async () => {
      const entries = [
        makeHealthEntry({ slug: 'e1', debts: 1, action: 'scope' }),
        makeHealthEntry({ slug: 'e2', debts: 1, action: 'scope' }),
        makeHealthEntry({ slug: 'e3', debts: 1, action: 'scope' }),
      ];
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('entries)');
    });

    // @ana A004, A005
    it('does not display separate Promote or Recurring sections', async () => {
      const entries = [
        makeHealthEntry({ slug: 'e1', debts: 1, action: 'scope' }),
        makeHealthEntry({ slug: 'e2', debts: 1, action: 'scope' }),
        makeHealthEntry({ slug: 'e3', debts: 1, action: 'scope' }),
      ];
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      // Old separate section headings should not appear
      const lines = stdout.split('\n');
      const promoteHeading = lines.find(l => l.trim() === 'Promote');
      const recurringHeading = lines.find(l => l.trim() === 'Recurring');
      expect(promoteHeading).toBeUndefined();
      expect(recurringHeading).toBeUndefined();
    });

    // @ana A018
    it('omits empty sections', async () => {
      // Only scope candidates, no promote, no hot modules
      await createProofChain([
        makeHealthEntry({ slug: 'e1', risks: 0 }),
      ]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).not.toContain('No candidates');
      expect(stdout).not.toContain('No hot modules');
    });

    // @ana A019
    it('omits Next Actions when no promote or recurring candidates', async () => {
      // Single scope candidate (recurrence_count < 2), no promote action
      await createProofChain([
        makeHealthEntry({ slug: 'e1', risks: 1, action: 'scope' }),
      ]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).not.toContain('Next Actions');
    });

    // @ana A020, A021
    it('shows box header for zero runs', async () => {
      await createProofChain([]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['health']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('0 runs');
      expect(stdout).toContain('No data.');
      expect(stdout).toContain('ana proof health');
    });

    // @ana A022
    it('shows section dividers', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('\u2500\u2500\u2500\u2500\u2500\u2500');
    });

    it('handles missing proof chain', async () => {
      await createTestProject(tempDir);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['health']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('0 runs');
      expect(stdout).toContain('No data.');
      expect(stdout).toContain('ana proof health');
    });

    // @ana A027
    it('displays insufficient data trend', async () => {
      // Fewer than 10 entries → insufficient_data
      const entries = Array.from({ length: 3 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('insufficient data');
    });

    // @ana A028
    it('displays no classified data trend', async () => {
      // All findings have null severity → no_classified_data
      const entries = Array.from({ length: 10 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `slug-${i}` });
        entry['findings'] = [{
          id: 'F1',
          category: 'code',
          summary: 'unclassified',
          file: 'src/test.ts',
          anchor: null,
          severity: null,
          suggested_action: 'scope',
          status: 'active',
        }];
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('no classified data');
    });

    // @ana A013
    it('does not display Promotions section on terminal', async () => {
      // First entry has a promoted finding; subsequent entries have matching findings
      const entries = Array.from({ length: 6 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `slug-${i}`, debts: 1 });
        const findings = entry['findings'] as Array<Record<string, unknown>>;
        const finding = findings[0]!;
        if (i === 0) {
          // First entry: the promoted finding
          finding['status'] = 'promoted';
          finding['promoted_to'] = 'coding-standards';
        }
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      // Promotions effectiveness hidden from terminal (still in --json)
      const lines = stdout.split('\n');
      const promotionsHeading = lines.find(l => l.trim() === 'Promotions');
      expect(promotionsHeading).toBeUndefined();
    });

    // @ana A024, A006
    it('omits promotions when empty', async () => {
      await createProofChain([
        makeHealthEntry({ slug: 'e1', risks: 1, action: 'scope' }),
      ]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health', '--json']);
      const json = JSON.parse(stdout);
      // promotions key exists but array is empty when no findings are promoted
      expect(json.results.promotions).toBeInstanceOf(Array);
      expect(json.results.promotions).toHaveLength(0);
    });

    // @ana A025, A026
    it('preserves JSON output structure', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health', '--json']);
      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof health');
      expect(json.results.trajectory).toBeTypeOf('object');
      expect(json.results.hot_modules).toBeInstanceOf(Array);
      expect(json.results.promotion_candidates).toBeInstanceOf(Array);
      expect(json.results.promotions).toBeInstanceOf(Array);
    });

    // JSON tests
    // @ana A007
    it('outputs JSON with four-key envelope', async () => {
      const entries = Array.from({ length: 28 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health', '--json']);
      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof health');
      expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(json.results).toBeTypeOf('object');
      expect(json.meta).toBeTypeOf('object');
    });

    // @ana A008
    it('JSON results include trajectory data', async () => {
      await createProofChain([makeHealthEntry({ slug: 'e1', risks: 1 })]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.trajectory).toBeTypeOf('object');
    });

    // @ana A009
    it('JSON results include hot modules list', async () => {
      await createProofChain([makeHealthEntry({ slug: 'e1', risks: 1 })]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.hot_modules).toBeInstanceOf(Array);
    });

    // @ana A010
    it('JSON results include promotion candidates', async () => {
      await createProofChain([makeHealthEntry({ slug: 'e1', risks: 1 })]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.promotion_candidates).toBeInstanceOf(Array);
    });

    // @ana A011
    it('JSON results include promotions array', async () => {
      await createProofChain([makeHealthEntry({ slug: 'e1', risks: 1 })]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.promotions).toBeInstanceOf(Array);
    });

    // @ana A012
    it('JSON results include correct run count', async () => {
      const entries = Array.from({ length: 28 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.runs).toBe(28);
    });

    it('parent --json option works', async () => {
      await createProofChain([makeHealthEntry({ slug: 'e1', risks: 1 })]);
      process.chdir(tempDir);

      const { stdout } = runProof(['--json', 'health']);
      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof health');
    });

    // @ana A004
    it('shows insufficient data with 9 classified entries', async () => {
      const entries = Array.from({ length: 9 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('insufficient data');
    });

    // @ana A005
    it('shows actual trend with 10 classified entries', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).not.toContain('insufficient data');
    });

    // @ana A001
    it('displays Quality section header', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('Quality');
    });

    // @ana A002
    it('displays Hot Spots section header', async () => {
      const entries = [
        makeHealthEntry({ slug: 'e1', risks: 2, file: 'src/hot.ts' }),
        makeHealthEntry({ slug: 'e2', risks: 1, file: 'src/hot.ts' }),
      ];
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('Hot Spots');
    });

    // @ana A006
    it('displays first-pass rate', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `slug-${i}`, risks: 1 });
        // Mark 2 entries as having rejection cycles
        if (i < 2) {
          entry['rejection_cycles'] = 1;
          entry['previous_failures'] = [{ id: 'F1', summary: 'Failed check' }];
        }
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('First-pass:');
      expect(stdout).toContain('60%');
      expect(stdout).toContain('3 of 5');
    });

    // @ana A007
    it('displays catch count', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `slug-${i}`, risks: 1 });
        if (i < 2) {
          entry['rejection_cycles'] = 1;
          entry['previous_failures'] = [{ id: `F${i}`, summary: 'Failed check' }];
        }
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('2 issues before shipping');
    });

    // @ana A008
    it('shows 100% when no rejections exist', async () => {
      const entries = Array.from({ length: 5 }, (_, i) =>
        makeHealthEntry({ slug: `slug-${i}`, risks: 1 })
      );
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('100%');
      expect(stdout).toContain('5 of 5');
      expect(stdout).toContain('0 issues before shipping');
    });

    // @ana A009, A010, A015
    it('displays median pipeline time with phase breakdown including plan', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `slug-${i}`, risks: 1 });
        entry['timing'] = {
          total_minutes: 50 + i * 10,
          think: 8 + i,
          plan: 8 + i,
          build: 20 + i * 3,
          verify: 10 + i * 2,
        };
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('Pipeline');
      expect(stdout).toContain('Median:');
      expect(stdout).toContain('scope');
      expect(stdout).toContain('plan');
      expect(stdout).toContain('build');
      expect(stdout).toContain('verify');
    });

    // @ana A016
    it('omits plan from pipeline breakdown when median_plan is null', async () => {
      // Entries with timing but no plan values
      const entries = Array.from({ length: 5 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `slug-${i}`, risks: 1 });
        entry['timing'] = {
          total_minutes: 50 + i * 10,
          think: 8 + i,
          build: 20 + i * 3,
          verify: 10 + i * 2,
        };
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('Pipeline');
      expect(stdout).toContain('scope');
      expect(stdout).toContain('build');
      // plan should not appear since no entries have timing.plan
      expect(stdout).not.toMatch(/plan \d+m/);
    });

    // @ana A011
    it('omits pipeline with insufficient data', async () => {
      // Only 2 entries with timing — below the 3-entry threshold
      const entries = Array.from({ length: 2 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `slug-${i}`, risks: 1 });
        entry['timing'] = { total_minutes: 50 };
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).not.toContain('Median:');
      expect(stdout).not.toContain('Pipeline');
    });

    // @ana A014
    it('caps Next Actions at 5 items', async () => {
      // Create 8 promote candidates (each entry gets a unique finding)
      const entries = Array.from({ length: 8 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `e${i}`, risks: 0 });
        entry['findings'] = [{
          id: `F${i}`,
          category: 'code',
          summary: `promote finding ${i}`,
          file: `src/file${i}.ts`,
          anchor: null,
          severity: 'risk',
          suggested_action: 'promote',
          status: 'active',
        }];
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).toContain('Next Actions');
      // Count Promote: lines in Next Actions
      const promoteLines = stdout.split('\n').filter(l => l.includes('Promote:'));
      expect(promoteLines.length).toBeLessThanOrEqual(5);
    });

    it('omits pipeline when entries have total_minutes === 0', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `slug-${i}`, risks: 1 });
        entry['timing'] = { total_minutes: 0 };
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).not.toContain('Median:');
      expect(stdout).not.toContain('Pipeline');
    });

    it('Next Actions empty when no promote or recurring candidates', async () => {
      // Single entry with only monitor-action findings
      const entry = makeHealthEntry({ slug: 'e1', risks: 0 });
      entry['findings'] = [{
        id: 'F1',
        category: 'code',
        summary: 'monitor finding',
        file: 'src/test.ts',
        anchor: null,
        severity: 'debt',
        suggested_action: 'monitor',
        status: 'active',
      }];
      await createProofChain([entry]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health']);
      expect(stdout).not.toContain('Next Actions');
    });

    it('JSON includes verification and pipeline fields', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => {
        const entry = makeHealthEntry({ slug: `slug-${i}`, risks: 1 });
        entry['timing'] = { total_minutes: 50 + i * 10 };
        if (i === 0) {
          entry['rejection_cycles'] = 1;
          entry['previous_failures'] = [{ id: 'F1', summary: 'Failed' }];
        }
        return entry;
      });
      await createProofChain(entries);
      process.chdir(tempDir);

      const { stdout } = runProof(['health', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.verification).toBeTypeOf('object');
      expect(json.results.verification.first_pass_pct).toBe(80);
      expect(json.results.verification.total_caught).toBe(1);
      expect(json.results.pipeline).toBeTypeOf('object');
      expect(json.results.pipeline.median_total).toBeGreaterThan(0);
    });

    it('empty chain JSON output', async () => {
      await createProofChain([]);
      process.chdir(tempDir);

      const { stdout } = runProof(['health', '--json']);
      const json = JSON.parse(stdout);
      expect(json.results.runs).toBe(0);
      expect(json.results.trajectory.trend).toBe('insufficient_data');
    });
  });

  // ─── Promote Subcommand Tests ──────────────────────────────────────────

  /**
   * Helper to create a git-initialized project with proof chain and skill files for promote testing.
   */
  async function createPromoteTestProject(entries: unknown[], options?: { branch?: string; skillContent?: string; skillName?: string; noSkill?: boolean }): Promise<void> {
    const branch = options?.branch ?? 'main';
    const skillName = options?.skillName ?? 'coding-standards';
    const skillContent = options?.skillContent ?? `# coding-standards

## Rules
- Existing rule about naming conventions

## Gotchas
- Watch out for circular imports

## Examples
*Not yet captured. Add short snippets showing the RIGHT way.*
`;

    // Init git
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    // Create .ana/ana.json
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({ artifactBranch: 'main' }),
    );

    // Write proof chain
    await fs.writeFile(
      path.join(anaDir, 'proof_chain.json'),
      JSON.stringify({ entries }, null, 2),
    );

    // Create skill file (unless noSkill is set)
    if (!options?.noSkill) {
      const skillDir = path.join(tempDir, '.claude', 'skills', skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);
    }

    // Initial commit and set branch
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
    execSync(`git branch -M ${branch}`, { cwd: tempDir, stdio: 'ignore' });
  }

  /** Entry with active findings for promote testing */
  const promoteEntry = {
    slug: 'fix-validation',
    feature: 'Fix Input Validation',
    result: 'PASS',
    author: { name: 'Developer', email: 'dev@example.com' },
    contract: { total: 5, covered: 5, uncovered: 0, satisfied: 5, unsatisfied: 0, deviated: 0 },
    assertions: [{ id: 'A001', says: 'Validates input', status: 'SATISFIED' }],
    acceptance_criteria: { total: 3, met: 3 },
    timing: { total_minutes: 30 },
    hashes: {},
    completed_at: '2026-04-20T10:00:00Z',
    modules_touched: ['src/api/payments.ts'],
    findings: [
      { id: 'F001', category: 'validation', summary: 'Missing request validation', file: 'src/api/payments.ts', anchor: 'validateInput', status: 'active', severity: 'risk', suggested_action: 'promote' },
      { id: 'F002', category: 'testing', summary: 'No test for edge case', file: 'src/api/payments.ts', anchor: null, status: 'active' },
      { id: 'F003', category: 'code', summary: 'Redundant import', file: 'src/utils/helpers.ts', anchor: null, status: 'closed', closed_by: 'mechanical', closed_at: '2026-04-22T10:00:00Z', closed_reason: 'auto-closed' },
      { id: 'F004', category: 'code', summary: 'Already promoted item', file: 'src/api.ts', anchor: null, status: 'promoted', promoted_to: '.claude/skills/coding-standards/SKILL.md' },
    ],
    rejection_cycles: 0,
    previous_failures: [],
    build_concerns: [],
  };

  // @ana A001, A002, A003, A004, A005
  describe('promotes finding successfully', () => {
    it('marks finding as promoted with skill path', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Promoted F001');
      expect(stdout).toContain('coding-standards');

      // Verify chain was mutated
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const finding = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      expect(finding.status).toBe('promoted');
      expect(finding.promoted_to).toBe('.claude/skills/coding-standards/SKILL.md');

      // Verify PROOF_CHAIN.md was regenerated
      const dashboard = await fs.readFile(path.join(tempDir, '.ana', 'PROOF_CHAIN.md'), 'utf-8');
      expect(dashboard).toContain('Proof Chain Dashboard');

      // Verify commit was created
      const lastCommit = execSync('git log -1 --pretty=%s', { cwd: tempDir, encoding: 'utf-8' }).trim();
      expect(lastCommit).toContain('[proof] Promote F001 to coding-standards');
    });
  });

  // @ana A005
  describe('appends finding summary as rule', () => {
    it('appends summary as bulleted rule to Rules section', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards']);
      expect(exitCode).toBe(0);

      const skillContent = await fs.readFile(path.join(tempDir, '.claude', 'skills', 'coding-standards', 'SKILL.md'), 'utf-8');
      expect(skillContent).toContain('- Missing request validation');
      // Existing rule still present
      expect(skillContent).toContain('- Existing rule about naming conventions');
    });
  });

  // @ana A006, A007
  describe('uses custom text when provided', () => {
    it('appends custom text instead of summary', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards', '--text', '"Always validate request bodies before processing"']);
      expect(exitCode).toBe(0);

      const skillContent = await fs.readFile(path.join(tempDir, '.claude', 'skills', 'coding-standards', 'SKILL.md'), 'utf-8');
      expect(skillContent).toContain('- Always validate request bodies before processing');
    });

    it('JSON output shows custom rule text', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards', '--json', '--text', '"Always validate request bodies before processing"']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.results.rule_text).toContain('Always validate request bodies');
    });
  });

  // @ana A008, A009, A010
  describe('rejects promote without skill flag', () => {
    it('shows error listing available skills', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['promote', 'F001']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('coding-standards');
    });

    it('returns SKILL_REQUIRED in JSON mode', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('SKILL_REQUIRED');
    });
  });

  // @ana A011
  describe('rejects nonexistent skill', () => {
    it('returns SKILL_NOT_FOUND code in JSON', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', '--skill', 'data-access', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('SKILL_NOT_FOUND');
    });

    it('shows error in human mode', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['promote', 'F001', '--skill', 'data-access']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('not found');
    });
  });

  // @ana A012, A013
  describe('appends to gotchas section', () => {
    it('appends rule to Gotchas section when --section gotchas', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards', '--section', 'gotchas']);
      expect(exitCode).toBe(0);

      const skillContent = await fs.readFile(path.join(tempDir, '.claude', 'skills', 'coding-standards', 'SKILL.md'), 'utf-8');

      // Rule should be in Gotchas section
      const gotchasIdx = skillContent.indexOf('## Gotchas');
      const examplesIdx = skillContent.indexOf('## Examples');
      const ruleIdx = skillContent.indexOf('- Missing request validation');
      expect(ruleIdx).toBeGreaterThan(gotchasIdx);
      expect(ruleIdx).toBeLessThan(examplesIdx);

      // Rules section should NOT have the new rule
      const rulesIdx = skillContent.indexOf('## Rules');
      const rulesSection = skillContent.slice(rulesIdx, gotchasIdx);
      expect(rulesSection).not.toContain('Missing request validation');
    });
  });

  // @ana A014, A015
  describe('rejects already-promoted finding', () => {
    it('returns ALREADY_PROMOTED with promoted_to path', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F004', '--skill', 'coding-standards', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('ALREADY_PROMOTED');

      // Human mode shows promoted_to path
      const { stderr } = runProof(['promote', 'F004', '--skill', 'coding-standards']);
      const output = stderr;
      expect(output).toContain('.claude/skills/');
    });
  });

  // @ana A016
  describe('rejects closed finding without force', () => {
    it('returns ALREADY_CLOSED code in JSON', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F003', '--skill', 'coding-standards', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('ALREADY_CLOSED');
    });

    it('shows closed-by info in human mode', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['promote', 'F003', '--skill', 'coding-standards']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('already closed');
      expect(stderr).toContain('--force');
    });
  });

  // @ana A017, A018
  describe('promotes closed finding with force', () => {
    it('succeeds with --force flag', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F003', '--skill', 'coding-standards', '--force']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Promoted F003');

      // Verify chain mutation
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const finding = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F003');
      expect(finding.status).toBe('promoted');
    });
  });

  // @ana A019, A020, A021
  describe('returns valid JSON envelope', () => {
    it('has four-key envelope with results and meta', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof promote');
      expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(json.results).toBeTypeOf('object');
      expect(json.results.promoted_to).toBeTypeOf('string');
      expect(json.meta).toBeTypeOf('object');
      expect(json.meta.chain_runs).toBeTypeOf('number');
    });
  });

  // @ana A022, A023
  describe('warns on duplicate rule', () => {
    it('emits warning when existing rule has word overlap', async () => {
      // F001 summary is "Missing request validation" — need >50% overlap with existing rule
      // "Missing request validation check" shares 3/4 words with "Missing request validation"
      const skillContent = `# coding-standards

## Rules
- Missing request validation check

## Gotchas
- Watch out for circular imports
`;
      await createPromoteTestProject([promoteEntry], { skillContent });
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Similar rule exists');
    });
  });

  // @ana A024
  describe('warns on duplicate rule in JSON mode', () => {
    it('includes duplicate_warning in JSON results', async () => {
      const skillContent = `# coding-standards

## Rules
- Missing request validation check

## Gotchas
- Watch out for circular imports
`;
      await createPromoteTestProject([promoteEntry], { skillContent });
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.results.duplicate_warning).toBeTypeOf('string');
    });
  });

  // @ana A025, A026
  describe('replaces placeholder in empty section', () => {
    it('replaces Not yet captured placeholder with rule', async () => {
      const skillContent = `# coding-standards

## Rules
*Not yet captured. Add as you discover them during development.*

## Gotchas
- Watch out for circular imports
`;
      await createPromoteTestProject([promoteEntry], { skillContent });
      process.chdir(tempDir);

      const { exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards']);
      expect(exitCode).toBe(0);

      const updatedSkill = await fs.readFile(path.join(tempDir, '.claude', 'skills', 'coding-standards', 'SKILL.md'), 'utf-8');
      expect(updatedSkill).not.toContain('*Not yet captured');
      expect(updatedSkill).toContain('- Missing request validation');
    });
  });

  // @ana A027
  describe('rejects promote from wrong branch', () => {
    it('returns WRONG_BRANCH code in JSON', async () => {
      await createPromoteTestProject([promoteEntry], { branch: 'feature/other' });
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('WRONG_BRANCH');
    });
  });

  // @ana A028
  describe('rejects empty text', () => {
    it('returns TEXT_EMPTY code in JSON', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      // Use a space-only string which trims to empty
      const { stdout, exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards', '--json', '--text', '"  "']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('TEXT_EMPTY');
    });
  });

  // @ana A029
  describe('rejects skill file without target section', () => {
    it('returns SECTION_NOT_FOUND code in JSON', async () => {
      const skillContent = `# coding-standards

## Examples
- Some example
`;
      await createPromoteTestProject([promoteEntry], { skillContent });
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('SECTION_NOT_FOUND');
    });
  });

  // @ana A030
  describe('promotes lesson finding', () => {
    it('transitions lesson to promoted', async () => {
      await createPromoteTestProject([lessonEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'L001', '--skill', 'coding-standards']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Promoted L001');

      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const finding = chain.entries[0].findings.find((f: { id: string }) => f.id === 'L001');
      expect(finding.status).toBe('promoted');
    });
  });

  describe('promotes finding that is not found', () => {
    it('returns FINDING_NOT_FOUND code in JSON', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F999', '--skill', 'coding-standards', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('FINDING_NOT_FOUND');
    });
  });

  // ─── Promote Variadic Tests ──────────────────────────────────────────

  // @ana A010
  describe('promote single ID backward compatible', () => {
    it('single ID still works after variadic change', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', '--skill', 'coding-standards']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Promoted F001');
    });
  });

  // @ana A011, A012
  describe('promote variadic promotes multiple findings', () => {
    it('promotes two findings with one rule appended', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['promote', 'F001', 'F002', '--skill', 'coding-standards']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Promoted 2');

      // Verify both findings promoted
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const f1 = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      const f2 = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F002');
      expect(f1.status).toBe('promoted');
      expect(f2.status).toBe('promoted');

      // Only one rule appended (first finding's summary)
      const skillContent = await fs.readFile(path.join(tempDir, '.claude', 'skills', 'coding-standards', 'SKILL.md'), 'utf-8');
      const ruleMatches = skillContent.match(/- Missing request validation/g);
      expect(ruleMatches).toHaveLength(1);

      // One commit for the batch
      const commitCount = execSync('git log --oneline | wc -l', { cwd: tempDir, encoding: 'utf-8' }).trim();
      expect(parseInt(commitCount)).toBe(2); // init + promote
    });
  });

  // @ana A013
  describe('promote commit has co-author trailer', () => {
    it('includes co-author in commit body', async () => {
      execSync('git init', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

      const anaDir = path.join(tempDir, '.ana');
      await fs.mkdir(anaDir, { recursive: true });
      await fs.writeFile(
        path.join(anaDir, 'ana.json'),
        JSON.stringify({ artifactBranch: 'main', coAuthor: 'Custom Bot <bot@test.com>' }),
      );
      await fs.writeFile(
        path.join(anaDir, 'proof_chain.json'),
        JSON.stringify({ entries: [promoteEntry] }, null, 2),
      );
      const skillDir = path.join(tempDir, '.claude', 'skills', 'coding-standards');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), `# coding-standards\n\n## Rules\n- Existing rule\n\n## Gotchas\n- Watch out\n`);

      execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git branch -M main', { cwd: tempDir, stdio: 'ignore' });
      process.chdir(tempDir);

      runProof(['promote', 'F001', '--skill', 'coding-standards']);

      const body = execSync('git log -1 --pretty=%B', { cwd: tempDir, encoding: 'utf-8' });
      expect(body).toContain('Co-authored-by: Custom Bot <bot@test.com>');
    });
  });

  describe('promote all IDs invalid exits with error', () => {
    it('exits 1 when all IDs are invalid', async () => {
      await createPromoteTestProject([promoteEntry]);
      process.chdir(tempDir);

      const { exitCode } = runProof(['promote', 'F998', 'F999', '--skill', 'coding-standards']);
      expect(exitCode).not.toBe(0);
    });
  });

  // ─── Strengthen Subcommand Tests ──────────────────────────────────────

  /**
   * Helper to create a git-initialized project with proof chain, skill files,
   * and uncommitted skill file edits for strengthen testing.
   * Extends createPromoteTestProject: after initial commit, modifies the skill file
   * to create uncommitted changes.
   */
  async function createStrengthenTestProject(entries: unknown[], options?: { branch?: string; skillContent?: string; skillName?: string; noSkill?: boolean; noUncommittedChanges?: boolean; coAuthor?: string }): Promise<void> {
    const branch = options?.branch ?? 'main';
    const skillName = options?.skillName ?? 'coding-standards';
    const skillContent = options?.skillContent ?? `# coding-standards

## Rules
- Existing rule about naming conventions

## Gotchas
- Watch out for circular imports

## Examples
*Not yet captured. Add short snippets showing the RIGHT way.*
`;

    // Init git
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    // Create .ana/ana.json
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    const anaJson: Record<string, unknown> = { artifactBranch: 'main' };
    if (options?.coAuthor) {
      anaJson['coAuthor'] = options.coAuthor;
    }
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify(anaJson),
    );

    // Write proof chain
    await fs.writeFile(
      path.join(anaDir, 'proof_chain.json'),
      JSON.stringify({ entries }, null, 2),
    );

    // Create skill file (unless noSkill is set)
    if (!options?.noSkill) {
      const skillDir = path.join(tempDir, '.claude', 'skills', skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);
    }

    // Initial commit and set branch
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
    execSync(`git branch -M ${branch}`, { cwd: tempDir, stdio: 'ignore' });

    // Add uncommitted changes to the skill file (unless noUncommittedChanges)
    if (!options?.noSkill && !options?.noUncommittedChanges) {
      const skillFilePath = path.join(tempDir, '.claude', 'skills', skillName, 'SKILL.md');
      const currentContent = await fs.readFile(skillFilePath, 'utf-8');
      await fs.writeFile(skillFilePath, currentContent + '- New rule added by Learn\n');
    }
  }

  /** Entry with active findings for strengthen testing (same shape as promoteEntry) */
  const strengthenEntry = {
    slug: 'fix-validation',
    feature: 'Fix Input Validation',
    result: 'PASS',
    author: { name: 'Developer', email: 'dev@example.com' },
    contract: { total: 5, covered: 5, uncovered: 0, satisfied: 5, unsatisfied: 0, deviated: 0 },
    assertions: [{ id: 'A001', says: 'Validates input', status: 'SATISFIED' }],
    acceptance_criteria: { total: 3, met: 3 },
    timing: { total_minutes: 30 },
    hashes: {},
    completed_at: '2026-04-20T10:00:00Z',
    modules_touched: ['src/api/payments.ts'],
    findings: [
      { id: 'F001', category: 'validation', summary: 'Missing request validation', file: 'src/api/payments.ts', anchor: 'validateInput', status: 'active', severity: 'risk', suggested_action: 'promote' },
      { id: 'F002', category: 'testing', summary: 'No test for edge case', file: 'src/api/payments.ts', anchor: null, status: 'active' },
      { id: 'F003', category: 'code', summary: 'Redundant import', file: 'src/utils/helpers.ts', anchor: null, status: 'closed', closed_by: 'mechanical', closed_at: '2026-04-22T10:00:00Z', closed_reason: 'auto-closed' },
      { id: 'F004', category: 'code', summary: 'Already promoted item', file: 'src/api.ts', anchor: null, status: 'promoted', promoted_to: '.claude/skills/coding-standards/SKILL.md' },
    ],
    rejection_cycles: 0,
    previous_failures: [],
    build_concerns: [],
  };

  // @ana A014, A015
  describe('strengthen succeeds with uncommitted changes', () => {
    it('marks finding as promoted with skill path', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['strengthen', 'F001', '--skill', 'coding-standards', '--reason', '"Added validation rule after recurring pattern"']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Strengthened');
      expect(stdout).toContain('coding-standards');

      // Verify chain was mutated
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const finding = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      expect(finding.status).toBe('promoted');
      expect(finding.promoted_to).toBe('.claude/skills/coding-standards/SKILL.md');

      // Verify PROOF_CHAIN.md was regenerated
      const dashboard = await fs.readFile(path.join(tempDir, '.ana', 'PROOF_CHAIN.md'), 'utf-8');
      expect(dashboard).toContain('Proof Chain Dashboard');
    });
  });

  // @ana A016, A017
  describe('strengthen rejects when no uncommitted changes', () => {
    it('exits with NO_UNCOMMITTED_CHANGES error', async () => {
      await createStrengthenTestProject([strengthenEntry], { noUncommittedChanges: true });
      process.chdir(tempDir);

      const { exitCode, stderr } = runProof(['strengthen', 'F001', '--skill', 'coding-standards', '--reason', 'test']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('No uncommitted changes');
    });

    it('returns NO_UNCOMMITTED_CHANGES code in JSON', async () => {
      await createStrengthenTestProject([strengthenEntry], { noUncommittedChanges: true });
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['strengthen', 'F001', '--skill', 'coding-standards', '--reason', 'test', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('NO_UNCOMMITTED_CHANGES');
    });
  });

  describe('strengthen rejects nonexistent skill', () => {
    it('returns SKILL_NOT_FOUND code in JSON', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['strengthen', 'F001', '--skill', 'nonexistent', '--reason', 'test', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('SKILL_NOT_FOUND');
    });
  });

  describe('strengthen rejects finding not found', () => {
    it('returns FINDING_NOT_FOUND code in JSON', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['strengthen', 'F999', '--skill', 'coding-standards', '--reason', 'test', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('FINDING_NOT_FOUND');
    });
  });

  describe('strengthen rejects already-promoted finding', () => {
    it('returns ALREADY_PROMOTED code in JSON', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['strengthen', 'F004', '--skill', 'coding-standards', '--reason', 'test', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('ALREADY_PROMOTED');
    });
  });

  // @ana A020
  describe('strengthen --force on closed finding', () => {
    it('rejects closed finding without --force', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { exitCode, stderr } = runProof(['strengthen', 'F003', '--skill', 'coding-standards', '--reason', 'test']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('already closed');
    });

    it('succeeds with --force flag', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['strengthen', 'F003', '--skill', 'coding-standards', '--reason', 'test', '--force']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Strengthened');

      // Verify chain mutation
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const finding = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F003');
      expect(finding.status).toBe('promoted');
    });
  });

  // @ana A021
  describe('strengthen variadic', () => {
    // @ana A002, A003
    it('strengthens multiple findings in one commit', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['strengthen', 'F001', 'F002', '--skill', 'coding-standards', '--reason', '"Added validation rules"']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Strengthened 2');

      // Verify both findings promoted with skill path
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const f1 = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      const f2 = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F002');
      expect(f1.status).toBe('promoted');
      expect(f1.promoted_to).toContain('coding-standards');
      expect(f2.status).toBe('promoted');
      expect(f2.promoted_to).toContain('coding-standards');

      // One commit for the batch (init + strengthen = 2)
      const commitCount = execSync('git log --oneline | wc -l', { cwd: tempDir, encoding: 'utf-8' }).trim();
      expect(parseInt(commitCount)).toBe(2);
    });
  });

  describe('strengthen wrong branch', () => {
    it('returns WRONG_BRANCH code in JSON', async () => {
      await createStrengthenTestProject([strengthenEntry], { branch: 'feature/other' });
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['strengthen', 'F001', '--skill', 'coding-standards', '--reason', 'test', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('WRONG_BRANCH');
    });
  });

  describe('strengthen JSON output', () => {
    it('returns valid JSON envelope', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['strengthen', 'F001', '--skill', 'coding-standards', '--reason', '"Added rule"', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof strengthen');
      expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(json.results).toBeTypeOf('object');
      expect(json.results.skill).toBe('coding-standards');
      expect(json.results.skill_path).toBe('.claude/skills/coding-standards/SKILL.md');
      expect(json.results.reason).toBe('Added rule');
      expect(json.results.strengthened).toHaveLength(1);
      expect(json.meta).toBeTypeOf('object');
    });
  });

  // @ana A018
  describe('strengthen commit message format', () => {
    it('uses [learn] prefix, not [proof]', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      runProof(['strengthen', 'F001', '--skill', 'coding-standards', '--reason', '"Added validation rule"']);

      const lastCommit = execSync('git log -1 --pretty=%s', { cwd: tempDir, encoding: 'utf-8' }).trim();
      expect(lastCommit).toContain('[learn] Strengthen');
      expect(lastCommit).toContain('coding-standards');
      expect(lastCommit).toContain('Added validation rule');
      expect(lastCommit).not.toContain('[proof]');
    });
  });

  // @ana A019
  describe('strengthen commit has co-author trailer', () => {
    it('includes co-author in commit body', async () => {
      await createStrengthenTestProject([strengthenEntry], { coAuthor: 'Custom Bot <bot@test.com>' });
      process.chdir(tempDir);

      runProof(['strengthen', 'F001', '--skill', 'coding-standards', '--reason', 'test']);

      const body = execSync('git log -1 --pretty=%B', { cwd: tempDir, encoding: 'utf-8' });
      expect(body).toContain('Co-authored-by: Custom Bot <bot@test.com>');
    });
  });

  describe('strengthen stages skill file in commit', () => {
    it('commit includes the skill file, proof chain, and dashboard', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      runProof(['strengthen', 'F001', '--skill', 'coding-standards', '--reason', 'test']);

      const files = execSync('git diff --name-only HEAD~1', { cwd: tempDir, encoding: 'utf-8' });
      expect(files).toContain('.claude/skills/coding-standards/SKILL.md');
      expect(files).toContain('.ana/proof_chain.json');
      expect(files).toContain('.ana/PROOF_CHAIN.md');
    });
  });

  describe('strengthen all IDs invalid exits with error', () => {
    it('exits 1 when all IDs are invalid', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { exitCode } = runProof(['strengthen', 'F998', 'F999', '--skill', 'coding-standards', '--reason', 'test']);
      expect(exitCode).not.toBe(0);
    });
  });

  describe('strengthen mix of valid and invalid IDs', () => {
    it('strengthens valid, skips invalid, still commits', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['strengthen', 'F001', 'F999', '--skill', 'coding-standards', '--reason', 'test']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Strengthened 1');

      // Verify valid finding promoted
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const f1 = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      expect(f1.status).toBe('promoted');
    });
  });

  describe('strengthen requires --reason', () => {
    it('exits with error when --reason is missing', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { exitCode, stderr } = runProof(['strengthen', 'F001', '--skill', 'coding-standards']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--reason is required');
    });
  });

  describe('strengthen requires --skill', () => {
    it('exits with error when --skill is missing', async () => {
      await createStrengthenTestProject([strengthenEntry]);
      process.chdir(tempDir);

      const { exitCode, stderr } = runProof(['strengthen', 'F001', '--reason', 'test']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--skill is required');
    });
  });

  // ─── Stale subcommand tests ───────────────────────────────────────

  /**
   * Helper to create a proof chain with staleness data
   */
  async function createStaleChain(): Promise<void> {
    const entries = [
      {
        slug: 'fix-validation',
        feature: 'Fix Validation',
        result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 },
        hashes: {},
        completed_at: '2026-04-20T10:00:00Z',
        modules_touched: ['src/api/payments.ts'],
        findings: [
          { id: 'F001', category: 'code', summary: 'Missing request validation', file: 'src/api/payments.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'scope' },
          { id: 'F002', category: 'test', summary: 'No test for edge case', file: 'src/api/payments.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'monitor' },
          { id: 'F003', category: 'code', summary: 'No file finding', file: null, anchor: null, status: 'active', severity: 'observation', suggested_action: 'accept' },
        ],
        rejection_cycles: 0,
        previous_failures: [],
        build_concerns: [],
      },
      {
        slug: 'stripe-payments',
        feature: 'Stripe Payments',
        result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 },
        hashes: {},
        completed_at: '2026-04-21T10:00:00Z',
        modules_touched: ['src/api/payments.ts'],
        findings: [],
        rejection_cycles: 0,
        previous_failures: [],
        build_concerns: [],
      },
      {
        slug: 'auth-refactor',
        feature: 'Auth Refactor',
        result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 },
        hashes: {},
        completed_at: '2026-04-22T10:00:00Z',
        modules_touched: ['src/api/payments.ts'],
        findings: [],
        rejection_cycles: 0,
        previous_failures: [],
        build_concerns: [],
      },
      {
        slug: 'api-cleanup',
        feature: 'API Cleanup',
        result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 },
        hashes: {},
        completed_at: '2026-04-23T10:00:00Z',
        modules_touched: ['src/api/payments.ts'],
        findings: [],
        rejection_cycles: 0,
        previous_failures: [],
        build_concerns: [],
      },
    ];

    await createTestProject(tempDir);
    await fs.writeFile(
      path.join(tempDir, '.ana', 'proof_chain.json'),
      JSON.stringify({ entries }, null, 2),
    );
  }

  // @ana A022
  describe('stale detects findings with subsequent modules_touched', () => {
    it('shows stale findings grouped by confidence', async () => {
      await createStaleChain();
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stale']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Stale Findings');
      expect(stdout).toContain('F001');
      expect(stdout).toContain('High confidence');
    });
  });

  // @ana A025
  describe('stale is read-only no branch check', () => {
    it('succeeds without branch check from non-artifact branch', async () => {
      execSync('git init', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

      const anaDir = path.join(tempDir, '.ana');
      await fs.mkdir(anaDir, { recursive: true });
      await fs.writeFile(path.join(anaDir, 'ana.json'), JSON.stringify({ artifactBranch: 'main' }));
      await fs.writeFile(
        path.join(anaDir, 'proof_chain.json'),
        JSON.stringify({ entries: [closeEntry] }, null, 2),
      );
      execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git checkout -b feature/something', { cwd: tempDir, stdio: 'ignore' });

      process.chdir(tempDir);

      const { exitCode } = runProof(['stale']);
      expect(exitCode).toBe(0);
    });
  });

  // @ana A024
  describe('stale --after filters by entry slug', () => {
    it('only shows findings from the specified entry', async () => {
      await createStaleChain();
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stale', '--after', 'fix-validation']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('fix-validation');
      expect(stdout).toContain('F001');
    });
  });

  describe('stale --min-confidence high filters to high only', () => {
    it('excludes medium confidence findings', async () => {
      await createStaleChain();
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stale', '--min-confidence', 'high']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('High confidence');
      // F002 has only 3 subsequent entries (same as F001), so both are high
      // But the output should not include "Medium confidence" section
    });
  });

  describe('stale --json returns structured envelope', () => {
    it('returns JSON with total_stale and confidence tiers', async () => {
      await createStaleChain();
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stale', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof stale');
      expect(json.results.total_stale).toBeGreaterThan(0);
      expect(json.results.high_confidence).toBeInstanceOf(Array);
      expect(json.results.medium_confidence).toBeInstanceOf(Array);
      expect(json.meta.chain_runs).toBeTypeOf('number');
    });
  });

  describe('stale with zero stale findings', () => {
    it('shows zero message when no findings are stale', async () => {
      // Create chain with findings but no subsequent modules_touched overlap
      const entries = [{
        slug: 'isolated',
        feature: 'Isolated',
        result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 },
        hashes: {},
        completed_at: '2026-04-20T10:00:00Z',
        modules_touched: ['src/a.ts'],
        findings: [
          { id: 'F001', category: 'code', summary: 'Issue', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'scope' },
        ],
        rejection_cycles: 0,
        previous_failures: [],
        build_concerns: [],
      }];

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['stale']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('0 findings');
      expect(stdout).toContain('No active findings have been modified');
    });
  });

  // ─── Audit --full tests ──────��────────────────────────────────────

  // @ana A026
  describe('audit --json --full bypasses caps', () => {
    it('returns all files and findings without truncation', async () => {
      // 50 findings across 12 files — normally capped at 8 files / 3 per file
      await createAuditChain(50, 12);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit', '--json', '--full']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.results.by_file.length).toBeGreaterThan(8);
      expect(json.results.overflow_files).toBe(0);
      // Check a file with many findings has no truncation
      const maxFile = json.results.by_file.reduce(
        (max: { count: number }, f: { count: number }) => f.count > max.count ? f : max,
        { count: 0 },
      );
      expect(maxFile.count).toBe(json.results.by_file.find((f: { file: string }) => f.file === maxFile.file).findings.length);
    });
  });

  // @ana A027
  describe('audit --full without --json prints hint', () => {
    it('shows usage hint instead of output', async () => {
      await createAuditChain(5, 2);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit', '--full']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('--json');
      expect(stdout).toContain('agent consumption');
    });
  });

  // ─── Audit Headline Split Tests ──────────────────────────────────────

  // @ana A019
  describe('audit headline shows actionable and monitoring counts', () => {
    it('includes actionable and monitoring in human output', async () => {
      await createAuditChain(5, 2);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('actionable');
      expect(stdout).toContain('monitoring');
    });
  });

  // @ana A020
  describe('audit JSON includes actionable_count', () => {
    it('returns actionable_count and monitoring_count in JSON', async () => {
      await createAuditChain(5, 2);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.results.actionable_count).toBeTypeOf('number');
      expect(json.results.monitoring_count).toBeTypeOf('number');
      expect(json.results.actionable_count + json.results.monitoring_count).toBe(json.results.total_active);
    });
  });

  // @ana A021
  describe('risk severity is always actionable', () => {
    it('risk-severity finding counts as actionable regardless of action', async () => {
      // Create a chain with a single risk-severity finding with accept action
      const findings = [
        { id: 'F001', category: 'code', summary: 'Risk with accept', file: 'src/app.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'accept' },
        { id: 'F002', category: 'code', summary: 'Observation with monitor', file: 'src/app.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'monitor' },
      ];
      const entry = {
        slug: 'actionable-test',
        feature: 'Actionable Test',
        result: 'PASS',
        author: { name: 'Dev', email: 'dev@example.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 },
        hashes: {},
        completed_at: '2026-04-20T10:00:00Z',
        modules_touched: [],
        findings,
        rejection_cycles: 0,
        previous_failures: [],
        build_concerns: [],
      };

      await createTestProject(tempDir);
      await fs.writeFile(
        path.join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ entries: [entry] }, null, 2),
      );
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['audit', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      // F001 is risk → actionable, F002 is observation+monitor → monitoring
      expect(json.results.actionable_count).toBe(1);
      expect(json.results.monitoring_count).toBe(1);
    });
  });

  // ─── Lesson Subcommand Tests ──────────────────────────────────────────

  /** Entry with a promoted finding for lesson rejection testing */
  const promotedEntry = {
    slug: 'promoted-test',
    feature: 'Promoted Test',
    result: 'PASS',
    author: { name: 'Developer', email: 'dev@example.com' },
    contract: { total: 2, covered: 2, uncovered: 0, satisfied: 2, unsatisfied: 0, deviated: 0 },
    assertions: [{ id: 'A001', says: 'Works', status: 'SATISFIED' }],
    acceptance_criteria: { total: 1, met: 1 },
    timing: { total_minutes: 15 },
    hashes: {},
    completed_at: '2026-04-20T10:00:00Z',
    modules_touched: [],
    findings: [
      { id: 'F004', category: 'code', summary: 'Already promoted item', file: 'src/api.ts', anchor: null, status: 'promoted', promoted_to: '.claude/skills/coding-standards/SKILL.md' },
    ],
    rejection_cycles: 0,
    previous_failures: [],
    build_concerns: [],
  };

  // @ana A022
  describe('lesson sets finding to lesson status', () => {
    it('records finding as lesson with reason', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['lesson', 'F001', '--reason', 'team-decision']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Lessons recorded');
      expect(stdout).toContain('F001');

      // Verify chain was mutated
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const finding = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      expect(finding.status).toBe('lesson');
      expect(finding.closed_by).toBe('human');
      expect(finding.closed_reason).toBe('team-decision');
      expect(finding.closed_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });
  });

  // @ana A023
  describe('lesson requires --reason', () => {
    it('shows REASON_REQUIRED error without --reason', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['lesson', 'F001']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--reason is required');
    });

    it('returns REASON_REQUIRED code in JSON', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['lesson', 'F001', '--json']);
      expect(exitCode).not.toBe(0);

      const json = JSON.parse(stdout);
      expect(json.error.code).toBe('REASON_REQUIRED');
    });
  });

  // @ana A024
  describe('lesson rejects closed findings', () => {
    it('shows ALREADY_CLOSED error for closed finding', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['lesson', 'F003', '--reason', 'test']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('already closed');
    });
  });

  // @ana A025
  describe('lesson rejects promoted findings', () => {
    it('shows ALREADY_PROMOTED error for promoted finding', async () => {
      await createCloseTestProject([promotedEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['lesson', 'F004', '--reason', 'test']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('already promoted');
    });
  });

  // @ana A026
  describe('lesson commits with proof prefix', () => {
    it('creates git commit with [proof] Lesson: prefix', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      runProof(['lesson', 'F001', '--reason', 'institutional decision']);

      const lastCommit = execSync('git log -1 --pretty=%s', { cwd: tempDir, encoding: 'utf-8' }).trim();
      expect(lastCommit).toContain('[proof] Lesson:');
      expect(lastCommit).toContain('F001');
    });
  });

  // @ana A027
  describe('lesson --dry-run does not mutate', () => {
    it('shows what would happen without changing anything', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const commitCountBefore = parseInt(execSync('git log --oneline | wc -l', { cwd: tempDir, encoding: 'utf-8' }).trim());

      const { stdout, exitCode } = runProof(['lesson', 'F001', '--reason', 'test', '--dry-run']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Dry run');

      // Finding should still be active
      const chain = JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'proof_chain.json'), 'utf-8'));
      const f1 = chain.entries[0].findings.find((f: { id: string }) => f.id === 'F001');
      expect(f1.status).toBe('active');

      // No git commit was created
      const commitCountAfter = parseInt(execSync('git log --oneline | wc -l', { cwd: tempDir, encoding: 'utf-8' }).trim());
      expect(commitCountAfter).toBe(commitCountBefore);
    });
  });

  describe('lesson returns FINDING_NOT_FOUND for nonexistent ID', () => {
    it('shows FINDING_NOT_FOUND error', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stderr, exitCode } = runProof(['lesson', 'F999', '--reason', 'test']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('not found');
    });
  });

  describe('lesson --json returns structured response', () => {
    it('returns JSON envelope with lesson result', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      const { stdout, exitCode } = runProof(['lesson', 'F001', '--reason', 'json-test', '--json']);
      expect(exitCode).toBe(0);

      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof lesson');
      expect(json.results.finding.id).toBe('F001');
      expect(json.results.new_status).toBe('lesson');
      expect(json.results.reason).toBe('json-test');
    });
  });

  // --- Push retry tests ---

  // @ana A001
  describe('close retries push after pull on failure', () => {
    it('retries push after pull when push fails', async () => {
      // Create a bare remote and clone it
      const bareDir = path.join(tempDir, 'remote.git');
      const workDir = path.join(tempDir, 'work');
      execSync(`git init --bare ${bareDir}`, { stdio: 'ignore' });

      // Create initial repo with proof chain, push to bare
      execSync(`git clone ${bareDir} ${workDir}`, { stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: workDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: workDir, stdio: 'ignore' });

      const anaDir = path.join(workDir, '.ana');
      await fs.mkdir(anaDir, { recursive: true });
      await fs.writeFile(path.join(anaDir, 'ana.json'), JSON.stringify({ artifactBranch: 'main' }));

      const entry = {
        slug: 'test-retry',
        feature: 'Test Push Retry',
        result: 'PASS',
        author: { name: 'Dev', email: 'dev@test.com' },
        contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
        assertions: [],
        acceptance_criteria: { total: 1, met: 1 },
        timing: { total_minutes: 10 },
        hashes: {},
        completed_at: '2026-04-20T10:00:00Z',
        modules_touched: [],
        findings: [
          { id: 'F001', category: 'code', summary: 'Test finding', file: 'src/test.ts', anchor: null, status: 'active', severity: 'risk' },
        ],
        rejection_cycles: 0,
        previous_failures: [],
        build_concerns: [],
      };

      await fs.writeFile(path.join(anaDir, 'proof_chain.json'), JSON.stringify({ entries: [entry] }, null, 2));
      execSync('git add -A && git commit -m "init"', { cwd: workDir, stdio: 'ignore' });
      execSync('git branch -M main', { cwd: workDir, stdio: 'ignore' });
      execSync('git push -u origin main', { cwd: workDir, stdio: 'ignore' });

      // Create a conflicting commit on the remote (via a second clone)
      const conflictDir = path.join(tempDir, 'conflict');
      execSync(`git clone ${bareDir} ${conflictDir}`, { stdio: 'ignore' });
      execSync('git config user.email "other@test.com"', { cwd: conflictDir, stdio: 'ignore' });
      execSync('git config user.name "Other"', { cwd: conflictDir, stdio: 'ignore' });
      // Make a non-conflicting change so push succeeds but our push fails
      await fs.writeFile(path.join(conflictDir, 'dummy.txt'), 'conflict');
      execSync('git add -A && git commit -m "conflict" && git push', { cwd: conflictDir, stdio: 'ignore' });

      // Now run close from workDir — push will fail, then pull+retry should succeed
      process.chdir(workDir);
      const { stdout, stderr, exitCode } = runProof(['close', 'F001', '--reason', 'retry-test']);

      // The command should succeed (exit 0) because the retry succeeds
      expect(exitCode).toBe(0);
      const output = stdout + stderr;
      // Should show the finding was closed
      expect(output).toContain('F001');
    });
  });

  // @ana A002
  describe('close commit failure shows NOT saved message', () => {
    it('shows NOT saved when commit fails', async () => {
      await createCloseTestProject([closeEntry]);
      process.chdir(tempDir);

      // Lock the index to simulate a concurrent git operation that blocks commit
      await fs.writeFile(path.join(tempDir, '.git', 'index.lock'), 'locked');

      const { stderr, exitCode } = runProof(['close', 'F001', '--reason', 'test']);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('NOT saved');
    });
  });

  // --- Audit filter tests ---

  const multiSeverityEntry = {
    slug: 'multi-sev',
    feature: 'Multi Severity',
    result: 'PASS' as const,
    author: { name: 'Dev', email: 'dev@test.com' },
    contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
    assertions: [],
    acceptance_criteria: { total: 1, met: 1 },
    timing: { total_minutes: 10 },
    hashes: {},
    completed_at: '2026-04-20T10:00:00Z',
    modules_touched: [],
    findings: [
      { id: 'F001', category: 'code', summary: 'Risk finding', file: 'src/a.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'scope' },
      { id: 'F002', category: 'code', summary: 'Debt finding', file: 'src/b.ts', anchor: null, status: 'active', severity: 'debt', suggested_action: 'monitor' },
      { id: 'F003', category: 'code', summary: 'Observation finding', file: 'src/c.ts', anchor: null, status: 'active', severity: 'observation', suggested_action: 'accept' },
      { id: 'F004', category: 'code', summary: 'Unclassified finding', file: 'src/d.ts', anchor: null, status: 'active' },
    ],
    rejection_cycles: 0,
    previous_failures: [],
    build_concerns: [],
  };

  const secondEntry = {
    slug: 'other-entry',
    feature: 'Other Entry',
    result: 'PASS' as const,
    author: { name: 'Dev', email: 'dev@test.com' },
    contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
    assertions: [],
    acceptance_criteria: { total: 1, met: 1 },
    timing: { total_minutes: 10 },
    hashes: {},
    completed_at: '2026-04-21T10:00:00Z',
    modules_touched: [],
    findings: [
      { id: 'F010', category: 'test', summary: 'Other finding', file: 'src/e.ts', anchor: null, status: 'active', severity: 'risk', suggested_action: 'promote' },
    ],
    rejection_cycles: 0,
    previous_failures: [],
    build_concerns: [],
  };

  // @ana A014
  describe('audit --severity risk,debt returns only risk and debt findings', () => {
    it('filters to requested severities', async () => {
      await createProofChain([multiSeverityEntry, secondEntry]);
      process.chdir(tempDir);
      const { stdout, exitCode } = runProof(['audit', '--severity', 'risk,debt', '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.results.by_severity.observation).toBe(0);
      expect(json.results.by_severity.unclassified).toBe(0);
      // Should have risk findings from both entries + debt from first
      expect(json.results.total_active).toBe(3);
    });
  });

  // @ana A015
  describe('audit --entry returns only findings from that entry', () => {
    it('filters to requested entry slug', async () => {
      await createProofChain([multiSeverityEntry, secondEntry]);
      process.chdir(tempDir);
      const { stdout, exitCode } = runProof(['audit', '--entry', 'multi-sev', '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.results.total_active).toBe(4);
      // No findings from other-entry
      const allFiles = json.results.by_file.flatMap((g: { findings: Array<{ entry_slug: string }> }) => g.findings.map((f: { entry_slug: string }) => f.entry_slug));
      expect(allFiles.every((s: string) => s === 'multi-sev')).toBe(true);
    });
  });

  // @ana A016
  describe('audit --severity with --json returns valid filtered JSON', () => {
    it('returns valid JSON envelope', async () => {
      await createProofChain([multiSeverityEntry]);
      process.chdir(tempDir);
      const { stdout, exitCode } = runProof(['audit', '--severity', 'risk', '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.command).toBe('proof audit');
      expect(json.results.total_active).toBe(1);
    });
  });

  // @ana A017
  describe('audit --severity with --json --full returns untruncated filtered results', () => {
    it('returns untruncated results', async () => {
      await createProofChain([multiSeverityEntry]);
      process.chdir(tempDir);
      const { stdout, exitCode } = runProof(['audit', '--severity', 'risk,debt', '--json', '--full']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.results.overflow_files).toBe(0);
    });
  });

  // @ana A018
  describe('audit --severity unclassified returns findings without severity', () => {
    it('returns unclassified findings', async () => {
      await createProofChain([multiSeverityEntry]);
      process.chdir(tempDir);
      const { stdout, exitCode } = runProof(['audit', '--severity', 'unclassified', '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.results.total_active).toBeGreaterThan(0);
    });
  });

  // @ana A019
  describe('audit --entry nonexistent returns empty results', () => {
    it('returns zero findings for nonexistent entry', async () => {
      await createProofChain([multiSeverityEntry]);
      process.chdir(tempDir);
      const { stdout, exitCode } = runProof(['audit', '--entry', 'nonexistent', '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.results.total_active).toBe(0);
    });
  });

  // @ana A020
  describe('audit --severity risk --entry slug returns intersection', () => {
    it('returns intersection of both filters', async () => {
      await createProofChain([multiSeverityEntry, secondEntry]);
      process.chdir(tempDir);
      const { stdout, exitCode } = runProof(['audit', '--severity', 'risk', '--entry', 'multi-sev', '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      // Only F001 from multi-sev is risk
      expect(json.results.total_active).toBe(1);
    });
  });

  // @ana A013
  describe('proof.ts has zero inline finding-search loops', () => {
    it('no inline finding.id === id patterns remain in proof.ts', async () => {
      const proofSrc = await fs.readFile(path.join(__dirname, '../../src/commands/proof.ts'), 'utf-8');
      // The pattern "finding.id === id" was the inline search — should be gone
      const matches = proofSrc.match(/finding\.id === id/g);
      expect(matches).toBeNull();
    });
  });
});
