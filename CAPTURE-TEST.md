# CAPTURE-TEST — 8x assignment, Asadullah

Status: **capture verified and working.** Canary prompts from two separate fresh
sessions both landed as PROMPT + RESPONSE entries in `.agent-logs/`.

---

## 1. Tool and model

- **Tool**: `opencode` (the CLI / coding agent I am running as), version 1.18.3.
  This is the "other" option in the assignment's tool list.
- **Model**: `opencode/big-pickle` — a single model. The same `build` agent both
  plans and executes. There is no separate "planner vs executor" model split;
  subagents (`explore`, `general`) reuse the same model. Model IDs are recorded
  per exchange so any mid-build switch would be visible in the log.
- **Hook / lifecycle mechanism**: opencode has no Claude-Code-style `Prompt`/`EndOfTurn`
  config hooks, but it has a first-class equivalent that fires on its own —
  **project plugins with an `event` hook**. The plugin subscribes to the opencode
  event bus and reacts to every session message event; no manual logging is ever
  involved. (I verified the event payloads against the opencode source instead of
  guessing: `message.updated` carries `{ sessionID, info }`, `message.part.updated`
  carries `{ sessionID, part, time }`, and end-of-turn is `session.status` with
  `{ sessionID, status: { type: "idle" } }`.)

## 2. Mechanism and config

- **Config file changed**: none. Project plugins are **auto-discovered** from
  `.opencode/plugins/` and loaded at opencode startup.
- **The plugin**: `.opencode/plugins/capture-agent-log.js`. On every event it keeps
  an in-memory buffer of the current session's messages/parts, and on the idle
  signal it writes the last exchange to `.agent-logs/`. Each entry records the
  prompt verbatim, the final response verbatim, a UTC timestamp, and the model.
  Child sessions (sub-agents/plan) are excluded; the root session is captured.
- **Config note**: opencode loads config/plugins once at startup. For the *longest
  running* TUI session the plugin is captured by a freshly started opencode
  session after restart. Every `opencode run` invocation boots a fresh server that
  loads the plugin immediately, which is how the canaries below were verified.

## 3. Log location

`E:\naano-clone\.agent-logs\` (in the repo root, committed with the repo).

Canary logs:

- `2026-09-12_12-04-54_ses_f6a7e6363ffetK53vkx5XDMNJy.md` (canary 1)
- `2026-09-12_12-07-36_ses_f6a7becf3ffeA86EZBfmgE3y81.md` (canary 2)

## 4. Canary 1 — raw entry

```
---
session_id: ses_f6a7e6363ffetK53vkx5XDMNJy
date: 2026-09-12
author: Asadullah
model: opencode/big-pickle
tool: opencode
project: naano-clone
total_exchanges: 1
first_prompt_time: 2026-09-12T12:04:54.749Z
last_prompt_time: 2026-09-12T12:07:14.018Z
---

# Session Log - 2026-09-12

Session: `ses_f6a7` | Project: `naano-clone` | Author: `Asadullah`

---


[LOG_ENTRY type=PROMPT num=1 session=ses_f6a7]
timestamp: 2026-09-12T12:04:54.749Z
model: opencode/big-pickle

"CAPTURE TEST - 8x assignment, Asadullah (session 1)"


[LOG_ENTRY type=RESPONSE num=1 session=ses_f6a7]
timestamp: 2026-09-12T12:07:14.013Z
model: opencode/big-pickle

Capture test acknowledged. This session will be logged by `.opencode/plugins/capture-agent-log.js` when it goes idle, written to `.agent-logs/<timestamp>_<session-id>.md`.

The previous test (`.agent-logs/2026-09-12_12-04-17_ses_f6a7efa84ffeDv9qobuGSxBxt1.md`) captured the prompt but recorded `[error]` as the response. This run will overwrite freshness — expecting prompt 1 → response 1 captured cleanly.
```

## 5. Canary 2 — raw entry (fresh second session)

```
---
session_id: ses_f6a7becf3ffeA86EZBfmgE3y81
date: 2026-09-12
author: Asadullah
model: opencode/big-pickle
tool: opencode
project: naano-clone
total_exchanges: 1
first_prompt_time: 2026-09-12T12:07:36.049Z
last_prompt_time: 2026-09-12T12:07:48.324Z
---

# Session Log - 2026-09-12

Session: `ses_f6a7` | Project: `naano-clone` | Author: `Asadullah`

---


[LOG_ENTRY type=PROMPT num=1 session=ses_f6a7]
timestamp: 2026-09-12T12:07:36.049Z
model: opencode/big-pickle

"CAPTURE TEST - 8x assignment, Asadullah (session 2)"


[LOG_ENTRY type=RESPONSE num=1 session=ses_f6a7]
timestamp: 2026-09-12T12:07:48.317Z
model: opencode/big-pickle

Ready. What do you need help with?
```

Both canaries were sent to **different, freshly started sessions** (`opencode run`
boots an in-process server that loads the plugin from `.opencode/plugins/`, so a
hook that only worked in the session that created it is ruled out).

## 6. Multi-exchange proof (same session, append path)

I also resumed canary session `ses_f6a74e8ebffeTqDUQQlV2dUICY` with a second
prompt after the two canaries above, to prove appends land in the *same* file with
`total_exchanges` bumped:

```
[LOG_ENTRY type=PROMPT num=2 session=ses_f6a7]
timestamp: 2026-09-12T12:16:11.415Z
model: opencode/big-pickle

"Second exchange for session 3 redo - reply CORK"


[LOG_ENTRY type=RESPONSE num=2 session=ses_f6a7]
timestamp: 2026-09-12T12:16:20.346Z
model: opencode/big-pickle

CORK
```

(`total_exchanges: 2` in that file's frontmatter.)

## 7. Things I tried first that did not work

1. **First canary run used the wrong default model.** Sending the first canary
   without `--model` picked the config-default `google/gemini-3-pro-image-preview`,
   whose OpenRouter routing failed with "No endpoints found that support tool use."
   The capture still fired and recorded the failure honestly: the RESPONSE entry is
   `[error]`. Left in the repo as-is:
   `2026-09-12_12-04-17_ses_f6a7efa84ffeDv9qobuGSxBxt1.md`.
2. **File-naming bug (first plugin version).** A resumed exchange was written to a
   *second* file for the same session id (`2026-09-12_12-08-10_ses_f6a7becf3...md`)
   because the file name was derived from each turn's prompt timestamp instead of
   the session's first. Fixed by reusing the session's existing log file.
   Both files remain in the logs as the honest record of the bug.
3. **Broken intermediate edit.** While fixing (2), one edit left a duplicated block
   in `flush()`, which made the plugin fail to *load* and silently stopped all
   capture (runs produced no entries and no errors). I diagnosed it by instrumenting
   the plugin, then rewrote the function cleanly. The fixed version captured the
   "session 3 redo" canary and the append test above.