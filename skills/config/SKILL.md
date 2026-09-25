---
name: config
description: Configure oliba settings — status line setup, theme, grace period, cue toggle. Use when the user runs /config statusline, says "set up the status line", or the user says "show me cooking cards", "turn off the cue", "change the delay", "only code cards", "oliba config", or asks to adjust how the status line cue behaves.
---

# Configure oliba

Read or update `~/.oliba/config.json` via CLI.

## Set up the status line

When the user runs `/config statusline` or says yes to the status line offer:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" statusline-install
```

It points `statusLine` in `~/.claude/settings.json` at `~/.oliba/statusline.mjs`, a stable shim that survives plugin updates. It backs up `settings.json` first and touches no other key. If the user already had a status line, it is kept in `statusLinePrevious`: it runs first and the cue is appended after it. If the command fails because `settings.json` is not valid JSON, tell the user in one line and stop; never edit the file by hand. Confirm in one line: "Status line set. If it does not show, restart Claude Code."

## Show current config

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-get
```

## Available keys

| Key | Type | Default | What it does |
|-----|------|---------|--------------|
| `cueEnabled` | boolean | `true` | Master toggle for the status line cue |
| `cueDelayMinutes` | number | `5` | Grace period after session start before cues appear |
| `cueTags` | comma-separated | all | Only show cards matching these tags (e.g. `code-de-la-route`, `italian-cooking`) |

## Set a value

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set <key> <value>
```

Examples:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set cueTags code-de-la-route
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set cueTags italian-cooking,code-de-la-route
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set cueDelayMinutes 10
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set cueEnabled false
```

After changing `cueTags`, clear the pinned cue so the new filter takes effect:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" clear-cue
```

## Response

After updating, confirm in one line what changed. Example: "Status line now shows code-de-la-route cards only."
