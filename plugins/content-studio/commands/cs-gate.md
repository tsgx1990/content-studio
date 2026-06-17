---
description: Run any Content Studio gate/script by name against the current workspace — a reliable fallback that resolves the plugin path for you when `${CLAUDE_PLUGIN_ROOT}` isn't set in an ad-hoc shell. Usage: /content-studio:cs-gate <script.mjs> [args]. Example: cs-gate check-prepublish.mjs projects/my-site/seo/en/foo.md
argument-hint: <script.mjs> [args...]
allowed-tools: Bash
---

Running the Content Studio gate `$ARGUMENTS` against this workspace:

!`node "${CLAUDE_PLUGIN_ROOT}"/scripts/$ARGUMENTS`

Review the output above: a `✖` line or a non-zero exit means the gate failed — fix the file and run it again. Common gates: `check-prepublish.mjs <file.md>`, `check-batch.mjs <dir|paths>`, `check-ai-tells.mjs <file.md> [--strict] [--compliance]`, `validate-sidecar.mjs <sidecar.json>`, `render.mjs <source.json> [--write]`, and the per-type gates (`check-xhsnote.mjs`, `check-script.mjs`, …).
