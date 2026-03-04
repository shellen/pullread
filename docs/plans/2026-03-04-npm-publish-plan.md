# Plan: Make PullRead CLI publishable to npm

## Goal
Users can `npm install -g pullread` (or `npx pullread`) to get the CLI on any platform with Node.js 18+. The Tauri app continues using the Bun-compiled sidecar binary as before.

---

## Step 1: Replace `bun:sqlite` with `better-sqlite3` in cookies.ts

**File:** `src/cookies.ts` line 9

The only Bun-specific production import. Change:
```ts
import { Database } from 'bun:sqlite';
```
to a dynamic import so it only loads when cookies are actually needed:
```ts
// At the top of getCookiesForDomain(), not at module level
const { default: Database } = await import('better-sqlite3');
```

Also convert the static import in `src/extractor.ts` (line 7) to a dynamic import inside `fetchAndExtract()` so the module isn't eagerly loaded:
```ts
// Only when options.useBrowserCookies is true
if (options.useBrowserCookies) {
  const { getCookiesForDomain } = await import('./cookies');
  ...
}
```

Add `better-sqlite3` to dependencies in package.json. It's a drop-in replacement — same synchronous API (`new Database()`, `.query().all()`, `.close()`).

**Why dynamic:** Node.js users without `better-sqlite3`'s native build tools won't hit an install error unless they actually enable browser cookies. The cookie feature is macOS-only anyway.

Make `better-sqlite3` an **optional dependency** (`optionalDependencies`) so npm install doesn't fail on systems that can't compile native modules.

---

## Step 2: Migrate 2 test files from `bun:test` to Jest

**Files:**
- `src/models.test.ts` line 4
- `src/shell-open.test.ts` line 4

Change `import { test, expect, describe } from 'bun:test'` to standard Jest globals (no import needed — Jest provides them). The other 14 test files already use Jest.

---

## Step 3: Add npm package fields to package.json

```jsonc
{
  "name": "pullread",           // already set
  "version": "0.4.2",          // already set
  "main": "dist/index.js",     // change from "src/index.ts"
  "bin": {
    "pullread": "dist/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=18.0.0"
  }
}
```

Add a `#!/usr/bin/env node` shebang to `src/index.ts` so the compiled JS is executable via npm bin.

---

## Step 4: Add a TypeScript build step for npm

Add scripts to package.json:
```json
{
  "build:npm": "tsc",
  "prepublishOnly": "npm run embed-viewer && npm run build:npm"
}
```

The existing `tsconfig.json` already targets ES2022/CommonJS with `outDir: ./dist` and `declaration: true`. Keep the existing `build` script for the Bun binary (used by Tauri).

Verify `dist/` is in `.gitignore` (it should be — we don't commit compiled JS).

---

## Step 5: Add `dist/index.js` shebang via build script

TypeScript doesn't emit shebangs. Add a small post-build step:
```json
"build:npm": "tsc && node -e \"const f='dist/index.js';const c=require('fs').readFileSync(f,'utf8');require('fs').writeFileSync(f,'#!/usr/bin/env node\\n'+c)\""
```

Or add a one-line `scripts/add-shebang.js`.

---

## Step 6: Test locally

```bash
npm run build:npm
npm pack --dry-run          # verify files list
npm link                    # install globally from local
pullread                    # verify help output
pullread sync               # verify basic functionality
pullread summarize --batch  # verify AI features work
```

---

## Step 7: Publish

```bash
npm publish
```

---

## What stays the same

- **Tauri sidecar build:** `npm run build` still compiles to a standalone Bun binary via `bun build --compile`. No changes to the macOS app build pipeline.
- **Viewer:** Already uses Node.js `http.createServer()`, not `Bun.serve()`.
- **All other src/ files:** Pure TypeScript with Node.js-compatible imports.
- **DYLD_LIBRARY_PATH:** Not needed — confirmed the CLI has no native runtime dependencies for AI features (all HTTP API calls).

## Files changed

| File | Change |
|------|--------|
| `src/cookies.ts` | Replace `bun:sqlite` with dynamic `better-sqlite3` import |
| `src/extractor.ts` | Dynamic import of cookies module |
| `src/models.test.ts` | Remove `bun:test` import |
| `src/shell-open.test.ts` | Remove `bun:test` import |
| `package.json` | Add bin, files, engines, main, build:npm, optionalDependencies |
| `src/index.ts` | Add shebang comment (or handle in build step) |
