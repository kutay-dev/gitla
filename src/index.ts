#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import { CONFIG_PATH, loadConfig, runSetup } from './config';
import { notify } from './notify';
import { theme } from './theme';
import { runWorkflow } from './workflow';

const program = new Command();

program
  .name('gitla')
  .description('Automate git branch/commit/push/cherry-pick workflow')
  .option('--ai <taskNumber>', 'Use AI to generate branch type and commit message')
  .option('-m, --message <msg>', 'Commit message (use with -b for fully manual mode)')
  .option('-b, --branch <type-taskNumber>', 'Branch type and task number (e.g. feat-123)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--skip-build', 'Skip the build step even if buildBeforeProceed is enabled')
  .action(async (opts: any) => {
    try {
      const isManual = !!(opts.branch && opts.message);
      if (!opts.ai && !isManual) {
        if (!fs.existsSync(CONFIG_PATH)) {
          await runSetup();
        } else {
          program.help();
        }
        return;
      }

      const config = await loadConfig();

      let taskNumber: string;
      let type: string | undefined;

      if (opts.branch) {
        const sep = opts.branch.indexOf('-');
        if (sep === -1) {
          console.error(theme.error('Error: -b format must be <type>-<taskNumber> (e.g. feat-123)'));
          process.exit(1);
        }
        type = opts.branch.slice(0, sep);
        taskNumber = opts.branch.slice(sep + 1);

        if (!type || !taskNumber) {
          console.error(theme.error('Error: -b format must be <type>-<taskNumber> (e.g. feat-123)'));
          process.exit(1);
        }

        if (config.ai && !config.ai.flags.includes(type)) {
          console.error(theme.error(`Error: branch type "${type}" must be one of: ${config.ai.flags.join(', ')}`));
          process.exit(1);
        }
      } else {
        taskNumber = opts.ai;
      }

      if (!taskNumber) {
        console.error(theme.error('Error: task number is required'));
        process.exit(1);
      }

      await runWorkflow(taskNumber, config, {
        message: opts.message,
        type,
        yes: opts.yes,
        skipBuild: opts.skipBuild,
        ai: !!opts.ai,
      });
    } catch (err: any) {
      await notify('gitla', 'Failed — check your terminal');
      console.error(`\n${theme.error(`Error: ${err.message}`)}`);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Open the config file in your editor')
  .action(async () => {
    try {
      const execa = (await import('execa')).default;
      await execa('open', [CONFIG_PATH]);
    } catch {
      console.log(`Could not open file. Edit it manually:\n\n  ${theme.primary(CONFIG_PATH)}`);
    }
  });

program.parse();
