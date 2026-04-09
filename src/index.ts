#!/usr/bin/env node

import * as readline from 'readline';
import { Command } from 'commander';
import { loadConfig } from './config';
import { runWorkflow } from './workflow';

function askTaskNumber(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Task number: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const program = new Command();

program
  .name('gitla')
  .description('Automate git branch/commit/push/cherry-pick workflow')
  .argument('[taskNumber]', 'Jira task number (e.g. 123)')
  .option('--dry-run', 'Show what would happen without making changes')
  .option('-m, --message <msg>', 'Skip AI and use this commit message')
  .option('-t, --type <type>', 'Skip AI classification, use this branch type (must match a flag in ~/.gitlarc.json)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (taskNumber: string | undefined, opts: any) => {
    try {
      const config = await loadConfig();

      if (!taskNumber) {
        taskNumber = await askTaskNumber();
      }

      if (!taskNumber) {
        console.error('Error: task number is required');
        process.exit(1);
      }

      if (opts.type && !config.flags.includes(opts.type)) {
        console.error(`Error: --type must be one of: ${config.flags.join(', ')}`);
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
