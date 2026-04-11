import { Config } from './config';
import { AI_THINKING_VERBS } from './constants/common.const';
import { Spinner } from './spinner';

export interface AiResult {
  type: string;
  commitMessage: string;
  tokensUsed?: { input: number; output: number; elapsedMs: number };
}

const MAX_DIFF_LENGTH = 8000;

function buildPrompt(flags: string[]): string {
  const flagList = flags.map((f) => `"${f}"`).join(', ');
  const flagDescriptions = flags.join(' / ');
  return `You are a git commit assistant. Analyze this git diff and respond with valid JSON only (no markdown, no code fences).

The JSON must have exactly these fields:
- "type": one of ${flagList} — pick the most appropriate based on the nature of the changes (${flagDescriptions})
- "commitMessage": a concise commit message, max 72 characters, imperative mood (e.g. "add user login endpoint", "fix null pointer in auth middleware")

Diff:
`;
}

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_LENGTH) return diff;
  return diff.slice(0, MAX_DIFF_LENGTH) + '\n... (truncated)';
}

function parseResponse(
  text: string,
  flags: string[],
): Omit<AiResult, 'tokensUsed'> {
  const cleaned = text
    .replace(/```json?\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed.type || !parsed.commitMessage) {
    throw new Error('AI response missing required fields');
  }

  if (!flags.includes(parsed.type)) {
    parsed.type = flags[0];
  }

  return {
    type: parsed.type,
    commitMessage: parsed.commitMessage.slice(0, 72),
  };
}

async function callAnthropic(
  diff: string,
  config: Config,
): Promise<{ text: string; tokensUsed: { input: number; output: number } }> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: config.ai!.apiKey });

  const model = config.ai!.model || 'claude-haiku-4-5-20251001';
  const response = await client.messages.create({
    model,
    max_tokens: 200,
    messages: [
      { role: 'user', content: buildPrompt(config.ai!.flags) + truncateDiff(diff) },
    ],
  });

  const block = response.content[0];
  if (block.type !== 'text')
    throw new Error('Unexpected response type from Anthropic');

  return {
    text: block.text,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

async function callOpenAI(
  diff: string,
  config: Config,
): Promise<{ text: string; tokensUsed: { input: number; output: number } }> {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: config.ai!.apiKey });

  const model = config.ai!.model || 'gpt-5.4-mini';
  const response = await client.chat.completions.create({
    model,
    max_completion_tokens: 200,
    messages: [
      { role: 'user', content: buildPrompt(config.ai!.flags) + truncateDiff(diff) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  return {
    text: content,
    tokensUsed: {
      input: response.usage?.prompt_tokens ?? 0,
      output: response.usage?.completion_tokens ?? 0,
    },
  };
}

export async function analyzeChanges(
  diff: string,
  config: Config,
): Promise<AiResult> {
  if (!config.ai) {
    throw new Error('AI is not configured. Run "gitla config" and add your AI provider details.');
  }
  const verb = AI_THINKING_VERBS[Math.floor(Math.random() * AI_THINKING_VERBS.length)];
  const spinner = new Spinner();
  spinner.start(`${verb}...`);
  const start = Date.now();
  try {
    const callAI =
      config.ai!.provider === 'anthropic' ? callAnthropic : callOpenAI;
    const { text, tokensUsed } = await callAI(diff, config);
    const elapsedMs = Date.now() - start;
    const result = parseResponse(text, config.ai!.flags);
    spinner.stop();
    return { ...result, tokensUsed: { ...tokensUsed, elapsedMs } };
  } catch (err) {
    spinner.stop();
    throw err;
  }
}
