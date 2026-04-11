import * as readline from 'readline';
import { Config } from './config';
import * as git from './git';
import { notify } from './notify';
import { Spinner } from './spinner';
import { theme } from './theme';

function branchFromSubject(subject: string, config: Config): string {
  const regexStr = config.commitPattern
    .replace('{type}', '\x00TYPE\x00')
    .replace('{board}', '\x00BOARD\x00')
    .replace('{task}', '\x00TASK\x00')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace('\x00TYPE\x00', '(?<type>[^/\\-:\\[\\] ]+)')
    .replace('\x00BOARD\x00', '(?<board>[^/\\-:\\[\\] ]+)')
    .replace('\x00TASK\x00', '(?<task>[^/\\-:\\[\\] ]+)');

  const match = subject.match(new RegExp(`^${regexStr}`));
  if (!match?.groups) return subject.slice(0, 50);

  const { type, board, task } = match.groups;
  return config.branchPattern
    .replace('{type}', type || '')
    .replace('{board}', board || config.board)
    .replace('{task}', task || '');
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(
        answer.toLowerCase() === 'y' ||
          answer.toLowerCase() === 'yes' ||
          answer === '',
      );
    });
  });
}

async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  const spinner = new Spinner();
  spinner.start(message);
  try {
    const result = await fn();
    spinner.stop(`${theme.primary('✓')} ${message}`);
    return result;
  } catch (err) {
    spinner.stop(`${theme.error('✗')} ${message}`);
    throw err;
  }
}

function isCommitHash(value: string): boolean {
  return /^[0-9a-f]{6,40}$/i.test(value);
}

export async function runUnfuck(
  targets: string[],
  config: Config,
): Promise<void> {
  // Must be on staging
  const currentBranch = await git.getCurrentBranch();
  if (currentBranch !== 'staging') {
    throw new Error(
      `You must be on "staging" to unfuck. Currently on: "${currentBranch}"`,
    );
  }

  // Resolve targets to commit hashes
  let commitsToRevert: string[] = [];
  let label: string;

  if (targets.length === 1 && !isCommitHash(targets[0])) {
    // Ticket number — search commit messages
    const ticket = targets[0];
    label = ticket;
    console.log(`\nSearching for commits matching "${ticket}"...\n`);
    commitsToRevert = await git.findCommitsByTicket(ticket);

    if (commitsToRevert.length === 0) {
      throw new Error(`No commits found matching "${ticket}" on this branch.`);
    }
  } else if (targets.length === 1 && isCommitHash(targets[0])) {
    // Single commit hash — reconstruct original branch name from commit subject
    commitsToRevert = [targets[0]];
    const subject = await git.getCommitSubject(targets[0]);
    label = branchFromSubject(subject, config);
  } else if (targets.length === 2 && isCommitHash(targets[0]) && isCommitHash(targets[1])) {
    // Range — reconstruct original branch name from oldest commit's subject
    const result = await git.findCommitsInRange(targets[0], targets[1]);
    if (result.length === 0) {
      throw new Error('No commits found in the given range.');
    }
    commitsToRevert = result;
    const subject = await git.getCommitSubject(result[0]);
    label = branchFromSubject(subject, config);
  } else {
    throw new Error(
      'Invalid --unfuck usage. Provide a ticket number (TTBO-123), one commit hash, or two commit hashes (oldest first).',
    );
  }

  // Show what will be undone
  console.log(`  ${theme.muted('Commits to undo:')}\n`);
  for (const sha of commitsToRevert) {
    const oneliner = await git.getCommitOneliner(sha);
    console.log(`    ${theme.error('✗')} ${oneliner}`);
  }

  const branchName = `undo/${label}`;
  console.log(`\n  ${theme.muted('New branch:')}     ${theme.primary(branchName)}`);
  console.log(`  ${theme.muted('PR target:')}      staging\n`);

  const ok = await confirm('Proceed? [Y/n] ');
  if (!ok) {
    console.log('Aborted.');
    return;
  }

  // Create branch, revert, commit, push
  console.log('');
  await withSpinner(`Creating branch ${branchName}`, () =>
    git.createAndCheckoutBranch(branchName),
  );

  await withSpinner('Reverting changes', () =>
    git.revertNoCommit([...commitsToRevert].reverse()),
  );

  const commitMessage = `undo: remove ${label} changes from staging`;
  await withSpinner('Committing', () => git.commit(commitMessage));
  await withSpinner(`Pushing ${branchName}`, () => git.push(branchName));

  await notify('gitla', `undone ${label}`);
  console.log(`\n${theme.primary('✓ Done!')}`);
  console.log(`  ${theme.primary(branchName)} → pushed\n`);

  // Offer to open PR
  const openPr = config.alwaysOpenPR || (await confirm('Open PR to staging? [Y/n] '));
  if (openPr) {
    await createPr(branchName, 'staging', commitMessage);
  }

  // Return to staging
  await git.checkout('staging');
}

async function createPr(
  head: string,
  base: string,
  title: string,
): Promise<void> {
  try {
    const execa = (await import('execa')).default;
    const { stdout } = await execa('gh', [
      'pr', 'create', '--head', head, '--base', base, '--title', title, '--body', '',
    ]);
    const url = stdout.trim();
    console.log(`  ${theme.primary('PR opened:')} ${url}`);

    try {
      await execa('pbcopy', [], { input: url });
      console.log(`  ${theme.primary('\n* URL copied to clipboard *\n')}`);
    } catch {
      // pbcopy not available (non-macOS), silently skip
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error(theme.error('  gh CLI not found. Install it from https://cli.github.com'));
    } else {
      console.error(theme.error(`  Failed to open PR: ${err.stderr || err.message}`));
    }
  }
}
