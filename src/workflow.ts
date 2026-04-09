import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { AiResult, analyzeChanges } from './ai';
import { Config } from './config';
import * as git from './git';
import { Spinner } from './spinner';
import { theme } from './theme';

export interface WorkflowOptions {
  dryRun?: boolean;
  message?: string;
  type?: string;
  yes?: boolean;
  skipBuild?: boolean;
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

function getPackageScripts(): Record<string, string> {
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) return {};
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).scripts ?? {};
}

async function runLint(): Promise<void> {
  const scripts = getPackageScripts();
  if (!scripts.lint) return;

  console.log(theme.muted('\n> npm run lint\n'));
  const execa = (await import('execa')).default;
  await execa('npm', ['run', 'lint'], { stdio: 'inherit' });
}

async function runBuild(): Promise<void> {
  const scripts = getPackageScripts();
  if (!scripts.build) {
    throw new Error('No "build" script found in package.json');
  }

  console.log(theme.muted('\n> npm run build\n'));
  const execa = (await import('execa')).default;
  await execa('npm', ['run', 'build'], { stdio: 'inherit' });
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

export async function runWorkflow(
  taskNumber: string,
  config: Config,
  options: WorkflowOptions,
): Promise<void> {
  // Step 1: Verify we're on staging
  const currentBranch = await git.getCurrentBranch();
  if (currentBranch !== 'staging') {
    throw new Error(
      `You must be on the "staging" branch. Currently on: "${currentBranch}"`,
    );
  }

  // Step 2: Run build if configured
  if (!options.skipBuild) {
    try {
      await runLint();
    } catch (err: any) {
      throw new Error(`Lint failed — fix errors before committing.\n${err.message}`);
    }

    if (config.buildBeforeProceed) {
      try {
        await runBuild();
      } catch (err: any) {
        throw new Error(`Build failed — fix errors before committing.\n${err.message}`);
      }
    }

    console.log(`\n${theme.primary('✓')} Checks passed`);
  }

  // Step 3: Get diff
  const diff = await git.getDiff();
  if (!diff.trim()) {
    throw new Error('No changes detected. Stage or modify some files first.');
  }

  // Step 3: Classify and get commit message
  let result: AiResult;
  if (options.message && options.type) {
    result = { type: options.type, commitMessage: options.message };
  } else {
    result = await analyzeChanges(diff, config);
    if (options.type) result.type = options.type;
    if (options.message) result.commitMessage = options.message;
  }

  const branchName = `${result.type}/${config.board}-${taskNumber}`;
  const devBranchName = `${branchName}-dev`;
  result.commitMessage = `${branchName} ${result.commitMessage}`;

  // Step 4: Show and confirm
  console.log(
    `\n  ${theme.muted('Type:')}           ${theme.primary(result.type)}`,
  );
  console.log(`  ${theme.muted('Commit message:')} ${result.commitMessage}`);
  console.log(
    `  ${theme.muted('Branch:')}         ${theme.primary(branchName)}`,
  );
  console.log(
    `  ${theme.muted('Dev branch:')}     ${theme.primary(devBranchName)}`,
  );
  if (result.tokensUsed) {
    const secs = (result.tokensUsed.elapsedMs / 1000).toFixed(1);
    console.log(
      `  ${theme.muted('Tokens used:')}    ${result.tokensUsed.input} in / ${
        result.tokensUsed.output
      } out in ${secs}s`,
    );
  }
  console.log('');

  if (options.dryRun) {
    console.log('Dry run — no changes made.');
    return;
  }

  const manualMode = !!(options.type && options.message);
  if (!options.yes && !manualMode) {
    const ok = await confirm('Proceed? [Y/n] ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  // Check branches don't already exist
  if (await git.branchExists(branchName)) {
    throw new Error(
      `Branch "${branchName}" already exists. Delete it first or use a different task number.`,
    );
  }
  if (await git.branchExists(devBranchName)) {
    throw new Error(
      `Branch "${devBranchName}" already exists. Delete it first or use a different task number.`,
    );
  }

  let commitSha = '';

  try {
    console.log('');
    await withSpinner(`Creating branch ${branchName}`, () =>
      git.createAndCheckoutBranch(branchName),
    );
    await withSpinner('Staging changes', () => git.addAll());
    await withSpinner('Committing', async () => {
      commitSha = await git.commit(result.commitMessage);
    });
    await withSpinner(`Pushing ${branchName}`, () => git.push(branchName));
  } catch (err: any) {
    console.error(
      `\n${theme.error(
        `Failed during staging branch workflow: ${err.message}`,
      )}`,
    );
    console.error('Attempting to return to staging branch...');
    try {
      await git.checkout('staging');
    } catch {
      /* best effort */
    }
    throw err;
  }

  try {
    await withSpinner('Switching to develop', () => git.checkout('develop'));
    await withSpinner('Pulling develop', () => git.pull('develop'));
    await withSpinner(`Creating branch ${devBranchName}`, () =>
      git.createAndCheckoutBranch(devBranchName),
    );
    await withSpinner('Cherry-picking commit', () => git.cherryPick(commitSha));
    await withSpinner(`Pushing ${devBranchName}`, () =>
      git.push(devBranchName),
    );
  } catch (err: any) {
    console.error(
      `\n${theme.error(
        `Failed during develop branch workflow: ${err.message}`,
      )}`,
    );
    console.error(
      `\nThe staging branch "${branchName}" was pushed successfully.`,
    );
    console.error('You may need to resolve conflicts manually:');
    console.error(`  git cherry-pick --continue`);
    console.error(`  git push origin ${devBranchName}`);
    console.error(`  git checkout staging`);
    throw err;
  }

  // Return to staging
  try {
    await git.checkout('staging');
  } catch {
    console.warn(
      '\nWarning: Could not return to staging branch. Run: git checkout staging',
    );
  }

  console.log(`\n${theme.primary('✓ Done!')}`);
  console.log(`  ${theme.primary(branchName)} → pushed`);
  console.log(`  ${theme.primary(devBranchName)} → pushed`);

  const openPr =
    config.alwaysOpenPR || (await confirm('\nOpen PR to develop? [Y/n] '));
  if (openPr) {
    await createPr(devBranchName, 'develop', result.commitMessage);
  }
}

async function createPr(
  head: string,
  base: string,
  title: string,
): Promise<void> {
  try {
    const execa = (await import('execa')).default;
    const { stdout } = await execa('gh', [
      'pr',
      'create',
      '--head',
      head,
      '--base',
      base,
      '--title',
      title,
      '--body',
      '',
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
      console.error(
        theme.error(
          '  gh CLI not found. Install it from https://cli.github.com',
        ),
      );
    } else {
      console.error(
        theme.error(`  Failed to open PR: ${err.stderr || err.message}`),
      );
    }
  }
}
