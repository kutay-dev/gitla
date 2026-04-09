import * as readline from 'readline';
import { AiResult, analyzeChanges } from './ai';
import { Config } from './config';
import * as git from './git';

export interface WorkflowOptions {
  dryRun?: boolean;
  message?: string;
  type?: string;
  yes?: boolean;
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

  // Step 2: Get diff
  console.log('\nAnalyzing changes...');
  const diff = await git.getDiff();
  if (!diff.trim()) {
    throw new Error('No changes detected. Stage or modify some files first.');
  }

  // Step 3: Classify and get commit message
  let result: AiResult;
  if (options.message && options.type) {
    result = { type: options.type, commitMessage: options.message };
  } else {
    console.log(
      'Asking AI to classify changes and generate commit message...\n',
    );
    result = await analyzeChanges(diff, config);

    if (options.type) result.type = options.type;
    if (options.message) result.commitMessage = options.message;
  }

  const branchName = `${result.type}/${config.board}-${taskNumber}`;
  const devBranchName = `${branchName}-dev`;

  // Step 4: Show and confirm
  console.log(`  Type:           ${result.type}`);
  console.log(`  Commit message: ${result.commitMessage}`);
  console.log(`  Branch:         ${branchName}`);
  console.log(`  Dev branch:     ${devBranchName}`);
  console.log('');

  if (options.dryRun) {
    console.log('Dry run — no changes made.');
    return;
  }

  if (!options.yes) {
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
    // Step 5: Create branch from staging
    console.log('\n--- Staging branch workflow ---');
    await git.createAndCheckoutBranch(branchName);

    // Step 6: Add all
    await git.addAll();

    // Step 7: Commit
    commitSha = await git.commit(result.commitMessage);
    console.log(`Commit: ${commitSha}`);

    // Step 8: Push
    await git.push(branchName);
    console.log(`Pushed ${branchName}\n`);
  } catch (err: any) {
    console.error(
      `\n\x1b[31mFailed during staging branch workflow: ${err.message}\x1b[0m`,
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
    // Step 9: Checkout develop
    console.log('--- Develop branch workflow ---');
    await git.checkout('develop');

    // Step 10: Pull
    await git.pull('develop');

    // Step 11: Create dev branch
    await git.createAndCheckoutBranch(devBranchName);

    // Step 12: Cherry-pick
    await git.cherryPick(commitSha);

    // Step 13: Push dev branch
    await git.push(devBranchName);
    console.log(`Pushed ${devBranchName}\n`);
  } catch (err: any) {
    console.error(
      `\n\x1b[31mFailed during develop branch workflow: ${err.message}\x1b[0m`,
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

  // Step 14: Return to staging
  try {
    await git.checkout('staging');
  } catch {
    console.warn(
      '\nWarning: Could not return to staging branch. Run: git checkout staging',
    );
  }

  console.log('\x1b[32mDone!\x1b[0m');
  console.log(`  ${branchName} → pushed`);
  console.log(`  ${devBranchName} → pushed`);
}
