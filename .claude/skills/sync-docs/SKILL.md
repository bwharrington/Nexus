---
name: sync-docs
description: Review recent code changes and update any docs/ documentation that is stale or incomplete. Use when the user asks to "update docs", "sync documentation", "update relevant docs", or "reflect recent changes in docs".
argument-hint: [commit-range|branch]
allowed-tools: [Read, Glob, Grep, Bash, Edit]
---

# sync-docs

Review documentation in `docs/` and update anything that is stale, incomplete, or doesn't reflect the current code behavior.

This skill uses **two complementary passes**:

1. **Git pass** — find what recently changed and identify docs likely affected
2. **Code-first pass** — read each doc and verify its claims against the *actual current code*, catching anything the git diff doesn't surface (older undocumented changes, removed features still mentioned in docs, new config values never documented)

Both passes are always run. The git pass provides context and a starting list; the code-first pass is the authoritative check.

## Arguments

Optional: `$ARGUMENTS` — a git ref or commit range (e.g. `main..HEAD`). If omitted, defaults to `main...HEAD`. If on main with no diverging branch, falls back to `HEAD~10..HEAD`.

---

## Workflow

### Step 1 — Git pass: understand what recently changed

```bash
# Summarize changed files
git diff --stat main...HEAD

# Commit messages for context
git log main...HEAD --oneline
```

For each changed source file, read its full diff to understand *what* changed — not just that it changed:

```bash
git diff main...HEAD -- <file>
```

Build a list of: new exports, removed APIs, new config fields, renamed options, new UI controls, behavior changes, new IPC channels.

Use this mapping to identify which docs are *likely* affected by the git changes:

| Changed files matching... | Likely affected docs |
|---------------------------|----------------------|
| `*AIChatDialog*`, `*useAIChat*`, `*useAIMultiAgent*`, `*xai*`, `*aiIpc*` | `AI-Chat-Feature.md`, `Ask-Mode.md`, `Edit-Mode.md`, `Create-Mode.md` |
| `*Compare*` | `Compare-Feature.md` |
| `*FileDirectory*`, `*useFileOperations*`, `*fileWatcher*` | `File-Directory-Feature.md` |
| `*Settings*`, `*EditorContext*`, `*config*`, `*logger*` | `Nexus.md` |
| `main.ts`, `preload.ts`, `aiIpcHandlers.ts` | `Nexus.md`, any feature docs using those IPC channels |
| `*performance*` | `performance-considerations-react-typescript-electron.md` |
| `TODO.md` | Skip — not updated by this skill |

---

### Step 2 — Code-first pass: verify each doc against live code

**Read every doc in `docs/`** (except `TODO.md`). For each doc, extract all specific claims that can be verified against the code — then verify them. Do not skip a doc just because no relevant files appeared in the git diff; the code may have drifted from the doc well before these recent changes.

#### What to verify per doc

For each concrete claim in a doc, check whether it still holds:

| Claim type | How to verify |
|------------|---------------|
| A setting or config option exists (e.g. `silentFileUpdates`, `logLevel`) | `Grep` for the field name in `src/renderer/types/global.d.ts` and `EditorContext.tsx` |
| A setting appears in the UI | `Grep` for the label string in `SettingsDialog.tsx` |
| An IPC channel exists (e.g. `file:read`, `log:set-level`) | `Grep` for the channel name in `preload.ts` and `main.ts` / `aiIpcHandlers.ts` |
| A component or hook exists | `Glob` for the file, or `Grep` for the export name |
| A feature has specific modes or options | Read the relevant component/hook to confirm option names and behavior |
| An AI provider or model is supported | `Grep` for the provider name in `aiIpcHandlers.ts` |
| A keyboard shortcut or UI element | `Grep` for the label or key in renderer components |

**Flag as stale if:**
- A config key mentioned in the doc doesn't exist in the type definitions or defaultConfig
- A UI label mentioned in the doc doesn't appear in any component
- An IPC channel name mentioned in the doc doesn't appear in `preload.ts`
- A feature, mode, or option described in the doc has been renamed or removed
- The doc is missing coverage of a feature that clearly exists in the code (e.g. a visible UI control with no corresponding doc entry)

---

### Step 3 — Edit stale docs

For each issue found in either pass:

1. Read the full doc if not already read.
2. Edit only the stale or missing sections — do not rewrite accurate content.
3. Preserve the doc's existing style, heading structure, and tone.

**Do not:**
- Create new doc files unless clearly necessary for a substantial undocumented feature
- Modify `TODO.md`
- Add implementation details that belong in code comments, not docs
- Pad or reformat sections that are already correct

---

### Step 4 — Report

Output a summary after all edits are complete:

```
## Documentation Sync Summary

**Git range**: main...HEAD
**Commits reviewed**: N

### Git pass — changes detected in
- src/main/logger.ts — new log level system
- src/renderer/components/SettingsDialog.tsx — Log Level setting added

### Code-first pass — additional issues found
- docs/Nexus.md — referenced `defaultTheme` config key which no longer exists
- docs/AI-Chat-Feature.md — missing coverage of multi-agent streaming mode

### Docs updated
- docs/Nexus.md — added Log Level setting; removed stale defaultTheme reference
- docs/AI-Chat-Feature.md — added multi-agent streaming section

### Docs reviewed — no changes needed
- docs/Compare-Feature.md
- docs/Edit-Mode.md
```

If no docs needed updating, say so clearly rather than making unnecessary edits.
