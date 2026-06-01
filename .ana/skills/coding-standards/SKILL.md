---
name: coding-standards
description: "Invoke when implementing features, writing code, or reviewing code quality. Contains project-specific naming conventions, error handling patterns, import style, and deviations from standard practices."
---

# Coding Standards

## Detected
- Language: TypeScript (261 source files)
- Functions: camelCase (85%, 827 sampled)
- Classes: PascalCase (50%)
- Files: PascalCase (61%, 263 sampled)
- Imports: mixed (67%)
- Indentation: spaces, 2 wide
- Error handling: exceptions (generic)
- UI: Tailwind CSS

### Library Rules
- All local imports use `.js` extensions (`import { foo } from "./bar.js"`). TypeScript compiles without them but ESM resolution crashes at runtime.
- Use `import type` for type-only imports, separate from value imports. Prevents runtime imports of pure types.

## Rules
- All imports use `.js` extensions and `node:` prefix for built-ins. `import * as fs from 'node:fs/promises'`, `import { scanProject } from './scan-engine.js'`. Omitting `.js` compiles fine but crashes at runtime — tsup emits ESM.
- Use `import type` for type-only imports, separate from value imports. Never mix types and values in the same import statement.
- Prefer named exports. No default exports — this is a CLI, no framework requires them.
- Avoid `any` — use `unknown` and narrow with type guards. `any` is acceptable only for untyped third-party boundaries. Define an interface for complex types — don't escape the type system.
- Use `| null` for fields that were checked and found empty. Reserve `?:` (optional) for fields that may not have been checked. EngineResult uses `| null` for all nullable stack fields — follow the same convention.
- Prefer early returns over nested conditionals. `if (!condition) return null;` then the main logic flat — not `if (condition) { ...long block... }`.
- Error handling has two layers. Commands surface errors to the user: `chalk.red` message + `process.exit(1)`. Engine functions catch internally and return defaults — a detector failure degrades the scan gracefully, it never crashes it.
- Engine files (`src/engine/`) have zero CLI dependencies — no chalk, no commander, no ora. Engine takes data as input and returns results. All user-facing output belongs in `src/commands/`.
- Explicit return types on all exported functions. Internal helpers can use inference.
- Avoid disabling lint rules inline. When necessary, add a comment explaining why the disable is required.
- Exported functions require `@param` and `@returns` JSDoc tags. The eslint rules enforce this — pre-commit will reject missing tags.
- In JSX text content, use `&apos;` for apostrophes. The `react/no-unescaped-entities` lint rule rejects raw `'` characters in JSX — contractions like "don't" must be written as `don&apos;t`.

## Gotchas
- **Missing `.js` on imports:** Every relative import MUST end in `.js` (e.g., `import { foo } from './bar.js'`). TypeScript compiles fine without it, but the built CLI crashes at runtime with `ERR_MODULE_NOT_FOUND`. Standard TypeScript training doesn't include this — it's an ESM-specific requirement.
- **"Fixing" empty catch blocks in engine:** 57+ catch blocks in engine are intentionally empty — they implement graceful degradation (detector fails, scan continues with partial results). Don't add `console.error` or re-throws to engine catch blocks. The error handling belongs in the command layer.
- **Adding chalk or ora to engine files:** Engine is pure — zero CLI dependencies. A fresh agent adding error formatting or progress output to an engine file breaks the architectural boundary. Engine functions are also called from tests without a TTY. Put all chalk/ora usage in `src/commands/`.

## Examples
*Not yet captured. Add short snippets showing the RIGHT way.*
