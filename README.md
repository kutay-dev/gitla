# gitla

Git workflow automation CLI. From uncommitted changes to pushed branches in one command.

## What it does

Automates the team's standard git flow:

1. Stashes your changes
2. Pulls the latest `staging`
3. Applies the latest stash, if success: pops the stash
4. Runs lint + build checks
5. Creates a task branch from `staging`, commits and pushes
6. Checks out `develop`, creates a `-dev` branch, cherry-picks the commit, pushes
7. Optionally opens a PR to `develop`

---

## Installation

```bash
npm install -g gitla
```

That's it. `gitla` is now available globally.

---

## First run

The first time you run `gitla` with no arguments, it starts an interactive setup wizard:

```
No config found. Let's set it up, you can edit this later:

  Available tokens: {type}, {board}, {task}
  {board} and {task} are required in both patterns, {type} is optional

Jira board name (e.g. TTBO):
Branch name pattern (press enter for default "{type}/{board}-{task}"): 
Commit message prefix pattern (press enter for default "{type}: [{board}-{task}]"): 
AI provider (anthropic/openai) — press enter to skip AI: 
Always open a PR after push? (y/n):
Run build check before proceeding? (y/n):
```

Config is saved to `~/.gitlarc.json`

---

## Usage

### Manual mode — provide branch type and message yourself

```bash
gitla -b feat-123 -m "add login page"
```

Must be on `staging`. `-b` takes `<type>-<taskNumber>`. No confirmation prompt in manual mode.

---

### Update mode — already on a task branch, push an update

```bash
gitla -m "fix edge case in login"
```

---

### AI mode — let AI write the commit message and pick the branch type

```bash
gitla --ai 123
```

Must be on `staging`. AI analyzes your diff, picks the branch type (`feat`, `fix`, etc.) and writes the commit message.

Requires `ai` to be configured in `~/.gitlarc.json`

---

When you're already on a task branch (anything that's not `staging`, `develop`, or `master`), gitla skips branch creation and:

1. Commits and pushes the current branch
2. Checks out the `-dev` branch (creates it if it doesn't exist), cherry-picks, pushes
3. Returns you to the task branch

---

### Unfuck mode — remove changes from staging before a prod deploy

When you need to merge staging to master but some changes shouldn't go to prod yet, `--unfuck` removes them cleanly without messing up the git history. It creates a new `undo/{original-branch-name}` branch, applies the inverse of the commits, and opens a PR back to staging.

```bash
# By full branch name — finds all commits matching it in staging
gitla --unfuck TTBO-123

# Single commit
gitla --unfuck a1b2c3d

# Range of commits (includes both ends, order doesn't matter, gitla figures it out)
gitla --unfuck a1b2c3d e4f5g6h
```

Must be on `staging`. The undo branch is named after the original branch (e.g. `undo/feat/TTBO-123`).

---

## Options

| Flag | Description |
|---|---|
| `--ai <taskNumber>` | AI mode — generates branch type and commit message |
| `-b <type-task>` | Branch type and task number (e.g. `feat-123`) |
| `-m <message>` | Commit message |
| `--unfuck <target>` | Remove changes by ticket or commit hash(es) from staging |
| `-y, --yes` | Skip confirmation prompt |
| `--skip-build` | Skip lint and build checks for this run |

---

## Config

Config lives at `~/.gitlarc.json`. Open it with:

```bash
gitla config
```

### Fields

```json
{
  "board": "TTBO",
  "branchPattern": "{type}/{board}-{task}",
  "commitPattern": "{type}: [{board}-{task}]",
  "ai": {
    "provider": "anthropic",
    "apiKey": "sk-ant-...",
    "model": "claude-haiku-4-5-20251001",
    "flags": ["feat", "fix", "refactor", "chore"]
  },
  "alwaysOpenPR": false,
  "buildBeforeProceed": true
}
```

| Field | Required | Description |
|---|---|---|
| `board` | Yes | Jira board prefix (e.g. `TTBO`) |
| `branchPattern` | Yes | Branch name template. Must include `{board}` and `{task}`. `{type}` is optional. |
| `commitPattern` | Yes | Commit message prefix template. Same tokens. |
| `ai` | No | Remove or omit to disable AI entirely |
| `ai.provider` | Yes (if ai) | `anthropic` or `openai` |
| `ai.apiKey` | Yes (if ai) | Your API key |
| `ai.model` | No | Defaults to `claude-haiku-4-5-20251001` (Anthropic) or `gpt-5.4-mini` (OpenAI) |
| `ai.flags` | Yes (if ai) | Branch type options AI can choose from |
| `alwaysOpenPR` | No | Skip the PR prompt and always open one (default: `false`) |
| `buildBeforeProceed` | No | Run `npm run build` before git operations (default: `true`) |

### Pattern tokens

| Token | Value |
|---|---|
| `{type}` | Branch type (`feat`, `fix`, etc.) — optional |
| `{board}` | Your Jira board name (`TTBO`) |
| `{task}` | Task number (`123`) |

**Examples:**

| `branchPattern` | Result |
|---|---|
| `{type}/{board}-{task}` | `feat/TTBO-123` |
| `{board}-{task}` | `TTBO-123` |
| `{type}-{board}-{task}` | `feat-TTBO-123` |

| `commitPattern` | Result |
|---|---|
| `{type}: [{board}-{task}]` | `feat: [TTBO-123] add login page` |
| `{board}-{task}` | `TTBO-123 add login page` |
| `[{type}] {board}-{task}` | `[feat] TTBO-123 add login page` |

---

## Notifications

On completion (or failure), gitla fires a terminal bell and a macOS native notification.

To make notifications persist instead of disappearing instantly: **System Settings → Notifications → Script Editor → set to Alerts**.

---

## Updating gitla

```bash
npm update -g gitla
```

## Uninstalling gitla

```bash
npm uninstall -g gitla
```
