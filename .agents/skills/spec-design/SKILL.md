---
name: spec-design
description: Guides interactive module design via Q&A before writing. Use when the user wants to design a module, class, or feature together, or when they say "/spec-design".
---

# Spec Design

Guides a collaborative, question-first design process. **Do not write design docs until ambiguities are clarified.**

## Process

### Phase 1: Clarify First (Required)

**Always start with clarifying questions.** Do not propose a design or write a doc until the user answers.

Read relevant code (e.g. `docs/overview.md`, related `src/` modules, config) to ground your questions. Then ask questions in categories below.

### Phase 2: Question Categories

Ask 1–2 questions per category as needed. Adapt to context; not all apply.

| Category | Examples |
|----------|----------|
| **Path / terminology** | "You said directory—do you mean file? `resolveX()` returns a file path." |
| **Data flow** | "Where does X come from—caller, config, or generated internally?" |
| **Responsibilities** | "Is this a factory, a repository, or both? What does it own vs delegate?" |
| **Semantics** | "Does 'resume' mean load history into context, or just set a flag?" |
| **Concurrency** | "Same ID—allow multiple instances? Do we need caching?" |
| **Error handling** | "File missing on resume—throw or return Result? Overwrite on create?" |
| **Injection** | "Config via constructor injection or direct import?" |

**If something contradicts existing code or docs, ask immediately.**

### Phase 3: Iterate

- Answer user answers; refine or add questions if needed
- Proceed to writing only when the design is clear enough to implement

### Phase 4: Produce

- Write design doc to `docs/designs/{module-name}.md`
- **Naming**: Use kebab-case from class/module name (e.g. `SessionManager` → `session-manager.md`)
- **Language**: English only
- **Style**: Concise. No filler. Bullets and short sentences.

## Output Format

Design doc structure (adjust as needed):

```markdown
# {ModuleName} Design

One-line summary.

## Dependencies
- Imports, paths, config

## API
- Method signatures and behavior

## Error Handling
- When to throw, no graceful fallback

## Concurrency / Constraints
- Single-writer, no cache, etc.
```

## Anti-Patterns

- **Rushing to write**: Asking questions and writing in the same turn
- **Assuming**: Filling gaps without asking (e.g. "目录" vs "文件")
- **Over-specifying**: Adding details the user did not confirm
- **Chinese in design doc**: Keep design docs in English
