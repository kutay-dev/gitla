import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

export interface Config {
  board: string;
  aiProvider: 'anthropic' | 'openai';
  apiKey: string;
  model?: string;
  flags: string[];
}

export const CONFIG_PATH = path.join(os.homedir(), '.gitlarc.json');

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function runSetup(): Promise<Config> {
  console.log('No config found. Let\'s set it up:\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const board = await ask(rl, 'Jira board name (e.g. TTBO): ');

  let aiProvider: 'anthropic' | 'openai';
  while (true) {
    const input = await ask(rl, 'AI provider (anthropic/openai): ');
    if (input === 'anthropic' || input === 'openai') {
      aiProvider = input;
      break;
    }
    console.log('  Please enter "anthropic" or "openai"');
  }

  const apiKey = await ask(rl, 'API key: ');

  const flagsInput = await ask(rl, 'Branch type flags, comma separated (e.g. feature,bugfix,chore): ');
  const flags = flagsInput.split(',').map((f) => f.trim()).filter(Boolean);

  rl.close();

  const config: Config = { board, aiProvider, apiKey, flags };

  validateConfig(config);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  console.log(`\nConfig saved to ${CONFIG_PATH}\n`);

  return config;
}

function validateConfig(config: Config): void {
  if (!config.board) throw new Error('"board" is required in ~/.gitlarc.json');
  if (!config.apiKey) throw new Error('"apiKey" is required in ~/.gitlarc.json');
  if (!['anthropic', 'openai'].includes(config.aiProvider)) {
    throw new Error(`"aiProvider" must be "anthropic" or "openai"`);
  }
  if (!config.flags.length) throw new Error('"flags" must be a non-empty array in ~/.gitlarc.json');
}

export async function loadConfig(): Promise<Config> {
  if (!fs.existsSync(CONFIG_PATH)) {
    return runSetup();
  }

  const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const config: Config = {
    board: fileConfig.board || '',
    aiProvider: fileConfig.aiProvider || 'anthropic',
    apiKey: fileConfig.apiKey || '',
    model: fileConfig.model,
    flags: fileConfig.flags || ['feature', 'bugfix'],
  };

  validateConfig(config);
  return config;
}
