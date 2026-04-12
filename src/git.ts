import execa from 'execa';
import { theme } from './theme';

function log(cmd: string) {
  console.log(theme.muted(`> ${cmd}`));
}

async function run(cmd: string, args: string[]): Promise<string> {
  const full = `${cmd} ${args.join(' ')}`;
  log(full);
  const result = await execa(cmd, args);
  return result.stdout.trim();
}

export async function getCurrentBranch(): Promise<string> {
  return run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
}

export async function getDiff(): Promise<string> {
  const unstaged = await run('git', ['diff']);
  const staged = await run('git', ['diff', '--cached']);
  const untracked = await run('git', [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]);

  let diff = '';
  if (staged) diff += staged + '\n';
  if (unstaged) diff += unstaged + '\n';
  if (untracked) {
    diff += '\n--- Untracked files ---\n' + untracked + '\n';
  }

  return diff;
}

export async function branchExists(name: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--verify', name]);
    return true;
  } catch {
    return false;
  }
}

export async function createAndCheckoutBranch(name: string): Promise<void> {
  await run('git', ['checkout', '-b', name]);
}

export async function addAll(): Promise<void> {
  await run('git', ['add', '.']);
}

export async function commit(message: string): Promise<string> {
  await run('git', ['commit', '-m', message]);
  return run('git', ['rev-parse', 'HEAD']);
}

export async function push(branch: string): Promise<void> {
  await run('git', ['push', 'origin', branch]);
}

export async function checkout(branch: string): Promise<void> {
  await run('git', ['checkout', branch]);
}

export async function pull(branch: string): Promise<void> {
  await run('git', ['pull', 'origin', branch]);
}

export async function cherryPick(sha: string): Promise<void> {
  await run('git', ['cherry-pick', sha]);
}

export async function getConflictedFiles(): Promise<string[]> {
  const result = await execa('git', ['diff', '--name-only', '--diff-filter=U']);
  return result.stdout.trim().split('\n').filter(Boolean);
}

export async function cherryPickContinue(): Promise<void> {
  await run('git', ['cherry-pick', '--continue', '--no-edit']);
}

export async function stashPush(): Promise<void> {
  await run('git', ['stash', 'push', '--include-untracked', '-m', 'gitla-auto-stash']);
}

export async function stashPop(): Promise<void> {
  await run('git', ['stash', 'pop']);
}

export async function findCommitsByTicket(ticket: string): Promise<string[]> {
  const result = await execa('git', ['log', '--grep', ticket, '--format=%H', '--reverse']);
  return result.stdout.trim().split('\n').filter(Boolean);
}

export async function getCommitOneliner(sha: string): Promise<string> {
  return run('git', ['log', '--oneline', '-1', sha]);
}

export async function getCommitSubject(sha: string): Promise<string> {
  return run('git', ['log', '--format=%s', '-1', sha]);
}

async function isMergeCommit(sha: string): Promise<boolean> {
  const result = await execa('git', ['rev-parse', `${sha}^2`]).catch(() => null);
  return result !== null;
}

export async function revertNoCommit(shas: string[]): Promise<void> {
  for (const sha of shas) {
    const merge = await isMergeCommit(sha);
    const args = merge
      ? ['revert', '--no-commit', '-m', '1', sha]
      : ['revert', '--no-commit', sha];
    await run('git', args);
  }
}

export async function findCommitsInRange(a: string, b: string): Promise<string[]> {
  // Determine which commit is the ancestor (older) automatically
  const aIsAncestor = await execa('git', ['merge-base', '--is-ancestor', a, b]).then(() => true).catch(() => false);
  const [oldest, newest] = aIsAncestor ? [a, b] : [b, a];
  const result = await execa('git', ['log', '--format=%H', '--reverse', `${oldest}^..${newest}`]);
  return result.stdout.trim().split('\n').filter(Boolean);
}
