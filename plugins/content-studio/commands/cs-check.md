---
description: Run the Content Studio repo health check (every gate + self-test) against the current workspace. Reliable fallback for when `node ${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs` can't run because the variable isn't set in your shell — this command resolves the plugin path for you.
allowed-tools: Bash
---

Content Studio health check for this workspace:

!`node "${CLAUDE_PLUGIN_ROOT}"/scripts/check.mjs`

`✔ repo healthy` means every gate and self-test passed. Otherwise, fix the `✖` items listed above and run it again.
