import { select, input } from '@inquirer/prompts';
import { Config } from './config';
import { theme } from './theme';

const promptTheme = {
  prefix: { idle: theme.primary('◆'), done: theme.primary('✔') },
  style: {
    answer: (text: string) => theme.primary(theme.bold(text)),
    message: (text: string) => theme.bold(text),
    highlight: (text: string) => theme.primary(text),
    error: (text: string) => theme.error(`  ${text}`),
    help: (text: string) => theme.muted(text),
    key: (text: string) => theme.muted(`<${text}>`),
  },
};

function applyPattern(pattern: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce(
    (str, [k, v]) => str.replace(`{${k}}`, v),
    pattern,
  );
}

export async function runInteractive(
  config: Config,
): Promise<{ type: string; taskNumber: string; message: string }> {
  const divider = theme.muted('  ' + '─'.repeat(40));
  console.log(`\n${divider}`);
  console.log(`  ${theme.primary(theme.bold('gitla'))}  ${theme.muted('new task')}`);
  console.log(`${divider}\n`);

  const type = await select({
    message: 'Branch type',
    choices: config.flags.map((f) => ({ value: f, name: f })),
    theme: promptTheme,
  });

  const taskNumber = await input({
    message: 'Task number',
    validate: (val) => (val.trim() ? true : 'Task number is required'),
    theme: promptTheme,
  });

  const message = await input({
    message: 'Commit message',
    validate: (val) => (val.trim() ? true : 'Commit message is required'),
    theme: promptTheme,
  });

  const task = taskNumber.trim();
  const msg = message.trim();
  const tokens = { type, board: config.board, task };
  const branchName = applyPattern(config.branchPattern, tokens);
  const commitPrefix = applyPattern(config.commitPattern, tokens);
  const commitMessage = `${commitPrefix} ${msg}`;

  console.log(`\n${divider}`);
  console.log(`  ${theme.muted('branch')}  ${theme.primary(branchName)}`);
  console.log(`  ${theme.muted('commit')}  ${commitMessage}`);
  console.log(`${divider}\n`);

  return { type, taskNumber: task, message: msg };
}
