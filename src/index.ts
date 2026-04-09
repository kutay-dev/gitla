#!/usr/bin/env node

import { Command } from 'commander';
import * as readline from 'readline';
import { loadConfig } from './config';
import { notify } from './notify';
import { theme } from './theme';
import { runWorkflow } from './workflow';

function askTaskNumber(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
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
  .option('-m, --message <msg>', 'Commit message (skips AI message generation)')
  .option('-b, --branch <flag/taskNumber>', 'Branch type and task number (e.g. feat/123), skips AI entirely when combined with -m')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--skip-build', 'Skip the build step even if buildBeforeProceed is enabled')
  .action(async (argTaskNumber: string | undefined, opts: any) => {
    try {
      const config = await loadConfig();

      let taskNumber = argTaskNumber;
      let type: string | undefined;

      if (opts.branch) {
        const slash = opts.branch.indexOf('/');
        if (slash === -1) {
          console.error(theme.error('Error: -b format must be <type>/<taskNumber> (e.g. feat/123)'));
          process.exit(1);
        }
        type = opts.branch.slice(0, slash);
        taskNumber = opts.branch.slice(slash + 1);

        if (!type || !taskNumber) {
          console.error(theme.error('Error: -b format must be <type>/<taskNumber> (e.g. feat/123)'));
          process.exit(1);
        }

        if (!config.flags.includes(type)) {
          console.error(theme.error(`Error: branch type "${type}" must be one of: ${config.flags.join(', ')}`));
          process.exit(1);
        }
      }

      if (!taskNumber) {
        taskNumber = await askTaskNumber();
      }

      if (!taskNumber) {
        console.error(theme.error('Error: task number is required'));
        process.exit(1);
      }

      await runWorkflow(taskNumber, config, {
        dryRun: opts.dryRun,
        message: opts.message,
        type,
        yes: opts.yes,
        skipBuild: opts.skipBuild,
      });
    } catch (err: any) {
      await notify('gitla', 'Failed — check your terminal');
      console.error(`\n${theme.error(`Error: ${err.message}`)}`);
      process.exit(1);
    }
  });

program.parse();
