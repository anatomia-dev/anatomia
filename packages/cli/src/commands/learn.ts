/**
 * ana learn — session management for Learn agent.
 *
 * Subcommands:
 *   end   Mark the session boundary so next Learn session knows what's new.
 *
 * Usage:
 *   ana learn end          End learn session, write timestamp, commit + push
 *   ana learn end --json   Output JSON format
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { findProjectRoot } from '../utils/validators.js';
import { readArtifactBranch, getCurrentBranch, readCoAuthor } from '../utils/git-operations.js';
import { commitAndPushProofChanges, pullBeforeRead } from './proof.js';
import { wrapJsonResponse } from '../utils/proofSummary.js';
import { isWorktreeDirectory } from '../utils/worktree.js';

/**
 * Register the `ana learn` command with subcommands.
 *
 * @param program - Commander program instance
 */
export function registerLearnCommand(program: Command): void {
  const learnCommand = new Command('learn')
    .description('Learn session management');

  const endCommand = new Command('end')
    .description('End learn session — mark timestamp for next session')
    .option('--json', 'Output JSON format')
    .action(async (options: { json?: boolean }) => {
      const proofRoot = findProjectRoot();
      const useJson = options.json || learnCommand.opts()['json'];

      // Branch check: must be on artifact branch
      const artifactBranch = readArtifactBranch(proofRoot);
      const currentBranch = getCurrentBranch();
      if (currentBranch !== artifactBranch) {
        if (useJson) {
          console.log(JSON.stringify({
            command: 'learn end',
            error: { code: 'WRONG_BRANCH', message: `Wrong branch. Switch to \`${artifactBranch}\` to end learn session.` },
          }, null, 2));
        } else {
          console.error(chalk.red(`Error: Wrong branch. Switch to \`${artifactBranch}\` to end learn session.`));
          if (isWorktreeDirectory()) {
            console.error("  You're in a worktree. Run from the main project directory.");
          } else {
            console.error(`  Run: git checkout ${artifactBranch}`);
          }
        }
        process.exit(1);
        return;
      }

      pullBeforeRead(proofRoot);

      // Ensure learn directory exists (handles pre-feature projects)
      const learnDir = path.join(proofRoot, '.ana', 'learn');
      if (!fs.existsSync(learnDir)) {
        fs.mkdirSync(learnDir, { recursive: true });
      }

      // Count active findings for the "old next time" message
      let findingsCount = 0;
      const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
      try {
        if (fs.existsSync(proofChainPath)) {
          const chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
          for (const entry of chain.entries || []) {
            for (const finding of entry.findings || []) {
              if (!finding.status || finding.status === 'active') {
                findingsCount++;
              }
            }
          }
        }
      } catch { /* no chain or parse error — count stays 0 */ }

      // Write timestamp
      const now = new Date().toISOString();
      const statePath = path.join(learnDir, 'state.json');
      fs.writeFileSync(statePath, JSON.stringify({ last_session_at: now }, null, 2), 'utf-8');

      // Commit and push
      const coAuthor = readCoAuthor(proofRoot);
      const stateRelPath = path.relative(proofRoot, statePath);
      commitAndPushProofChanges({
        proofRoot,
        files: [stateRelPath],
        message: '[learn] End session',
        coAuthor,
      });

      // Output
      if (useJson) {
        console.log(JSON.stringify(wrapJsonResponse('learn end', {
          last_session_at: now,
          findings_before_cutoff: findingsCount,
        }, { entries: [] }), null, 2));
      } else {
        console.log(`Learn session ended.`);
        console.log(`  Timestamp: ${now}`);
        console.log(`  Findings now "old" in next session: ${findingsCount}`);
      }
    });

  learnCommand.addCommand(endCommand);
  program.addCommand(learnCommand);
}
