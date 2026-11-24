---
name: config
description: Configure oliba - which topics the wait band draws from, and archiving or tagging topics. Use when the user says "oliba config", "only show me Italian cards", "which cards does the band show", "archive <topic>", "pause this project", "bring back <topic>", "tag <topic> as work", "wake the band", "unsnooze".
---

# Configure oliba

## Wait band topics

The wait band's topics are `waitTopics` in oliba's config: comma-separated tags or projects, empty for whatever is due first. Set it from the CLI, then confirm the change in one line; it takes effect next session.

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set waitTopics "italiano, code-de-la-route"
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-unset waitTopics                            # whatever is due first
```

## Wake the band

Snooze in the band saves `waitSnoozedUntil` in the config. To wake it early, clear it; a snooze for "this session" is not saved and ends with the session.

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-unset waitSnoozedUntil
```

## Archive and tag projects

Archiving rests a project: its cards leave `/review`, the wait band and grilling, and nothing is deleted. Unarchiving brings them back as they were; don't mention the time away. Tags group projects on `~/.oliba/index.html` and work as `/review <tag>`.

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-archive <projectId>               # --unarchive to bring it back
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-set <projectId> --tags "work,music"  # replaces the tags; --tags "" clears them
```

Match the topic with `project-list` (it shows `archived` and `tags`). The index page only shows the result: every change goes through these commands.

After a change to how pages look, `index --all` re-renders every page from the store (oliba also does it once per upgrade, at session start).

After a change, confirm in one line what changed. Example: "Teoria musical is resting."
