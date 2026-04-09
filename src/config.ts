import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface Config {
  board: string;
  aiProvider: 'anthropic' | 'openai';
  apiKey: string;
  model?: string;
}

export function loadConfig(): Config {
  const configName = '.gitlarc.json';
  const candidates = [
    path.join(process.cwd(), configName),
    path.join(os.homedir(), configName),
  ];

  let fileConfig: Partial<Config> = {};

  for (const configPath of candidates) {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      fileConfig = JSON.parse(raw);
      break;
    }
  }

  const config: Config = {
    board: fileConfig.board || '',
    aiProvider: fileConfig.aiProvider || 'anthropic',
    apiKey: process.env.GITLA_API_KEY || fileConfig.apiKey || '',
    model: fileConfig.model,
  };

  if (!config.apiKey) {
    throw new Error(
      'No API key found. Set GITLA_API_KEY env var or add "apiKey" to .gitlarc.json',
    );
  }

  if (!['anthropic', 'openai'].includes(config.aiProvider)) {
    throw new Error(
      `Invalid aiProvider: "${config.aiProvider}". Use "anthropic" or "openai".`,
    );
  }

  return config;
}
