#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from './config';
import { runWorkflow } from './workflow';

const program = new Command();

program
  .name('gitla')
  .description('Automate git branch/commit/push/cherry-pick workflow')
  .argument('<taskNumber>', 'Jira task number (e.g. 123)')
  .option('--dry-run', 'Show what would happen without making changes')
  .option('-m, --message <msg>', 'Skip AI and use this commit message')
  .option('-t, --type <type>', 'Skip AI classification: "feature" or "bugfix"')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (taskNumber: string, opts: any) => {
    try {
      const config = loadConfig();

      if (opts.type && opts.type !== 'feature' && opts.type !== 'bugfix') {
        console.error('Error: --type must be "feature" or "bugfix"');
        process.exit(1);
      }

      await runWorkflow(taskNumber, config, {
        dryRun: opts.dryRun,
        message: opts.message,
        type: opts.type,
        yes: opts.yes,
      });
    } catch (err: any) {
      console.error(`\n\x1b[31mError: ${err.message}\x1b[0m`);
      process.exit(1);
    }
  });

program.parse();
