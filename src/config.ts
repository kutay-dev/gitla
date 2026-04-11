import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

export interface AiConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model?: string;
  flags: string[];
}

export interface Config {
  board: string;
  ai?: AiConfig;
  alwaysOpenPR: boolean;
  buildBeforeProceed: boolean;
}

export const CONFIG_PATH = path.join(os.homedir(), '.gitlarc.json');

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

export async function runSetup(): Promise<Config> {
  console.log("No config found. Let's set it up:\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const board = await ask(rl, 'Jira board name (e.g. TTBO): ');

  let ai: AiConfig | undefined;
  const providerInput = await ask(rl, 'AI provider (anthropic/openai) — press enter to skip AI: ');

  if (providerInput === 'anthropic' || providerInput === 'openai') {
    const apiKey = await ask(rl, 'API key: ');

    const flagsInput = await ask(
      rl,
      'Branch type flags, comma separated (e.g. feature,bugfix,chore): ',
    );
    const flags = flagsInput
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    ai = { provider: providerInput, apiKey, flags };
  } else if (providerInput !== '') {
    console.log('  Skipping AI setup (invalid provider entered).');
  }

  const alwaysOpenPRInput = await ask(rl, 'Always open a PR after push? (y/n): ');
  const alwaysOpenPR = alwaysOpenPRInput.toLowerCase() === 'y';

  const buildInput = await ask(rl, 'Run build check before proceeding? (y/n): ');
  const buildBeforeProceed = buildInput.toLowerCase() === 'y';

  rl.close();

  const config: Config = { board, ai, alwaysOpenPR, buildBeforeProceed };

  validateConfig(config);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  console.log(`\nConfig saved to ${CONFIG_PATH}\nYou can open it by running: 'gitla config'\n`);

  return config;
}

function validateConfig(config: Config): void {
  if (!config.board) throw new Error('"board" is required in ~/.gitlarc.json');
  if (config.ai) {
    if (!config.ai.apiKey) throw new Error('"ai.apiKey" is required in ~/.gitlarc.json');
    if (!['anthropic', 'openai'].includes(config.ai.provider)) {
      throw new Error('"ai.provider" must be "anthropic" or "openai"');
    }
    if (!config.ai.flags?.length) {
      throw new Error('"ai.flags" must be a non-empty array in ~/.gitlarc.json');
    }
  }
}

export async function loadConfig(): Promise<Config> {
  if (!fs.existsSync(CONFIG_PATH)) {
    return runSetup();
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  const config: Config = {
    board: raw.board || '',
    ai: raw.ai
      ? {
          provider: raw.ai.provider || 'anthropic',
          apiKey: raw.ai.apiKey || '',
          model: raw.ai.model,
          flags: raw.ai.flags || ['feature', 'bugfix'],
        }
      : undefined,
    alwaysOpenPR: raw.alwaysOpenPR ?? false,
    buildBeforeProceed: raw.buildBeforeProceed ?? true,
  };

  validateConfig(config);
  return config;
}
