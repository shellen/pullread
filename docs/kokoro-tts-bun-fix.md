# Kokoro TTS in Bun Compiled Binaries

This document explains the Kokoro TTS integration challenges in Pull Read's compiled Bun binary and the runtime fix applied to make it work.

## Background

Pull Read uses [kokoro-js](https://github.com/nickmuchi/kokoro-js) for local text-to-speech. kokoro-js depends on:

- **@huggingface/transformers** (ML model loading, tokenization)
- **onnxruntime-node** (native ONNX inference via C++ addon + dynamic library)

Pull Read is distributed as a macOS app with a Bun-compiled CLI binary (`bun build --compile`). This creates a standalone executable with a virtual filesystem (`/$bunfs/root/...`).

## The Problem

The compiled binary fails with:

```
undefined is not an object (evaluating '__webpack_exports__StyleTextToSpeech2Model.from_pretrained')
```

### Root Cause Chain

Three issues compound to break Kokoro in compiled Bun binaries:

1. **Bun's bundler corrupts @huggingface/transformers' webpack internals.** The transformers library ships as a pre-built webpack bundle with internal `__webpack_exports__` module system. When Bun re-bundles this during `bun build --compile`, it breaks the internal module references, making `StyleTextToSpeech2Model` resolve to `undefined`.

2. **onnxruntime-node's native addon can't load from Bun's virtual FS.** The `.node` C++ addon is embedded in `/$bunfs/root/...` but needs to `dlopen()` a companion `libonnxruntime.dylib` from a real filesystem path. This fails with `libonnxruntime.so.1: cannot open shared object file`.

3. **kokoro.web.js's bundled onnxruntime-web fails to self-initialize in Bun.** The web build (`kokoro.web.js`) bundles its own copy of onnxruntime-web, but the WASM backend never registers itself properly in Bun's runtime. The `InferenceSession` object ends up `undefined`, causing `d.create` errors in the minified code.

### Why kokoro.web.js's Bundled ORT Fails

Inside `kokoro.web.js`, onnxruntime-web registers backends via an internal map. The WASM backend's `init()` function needs to:

- Load `ort-wasm-simd-threaded.jsep.wasm` (21MB) via `fetch()` or `import.meta.url`
- Initialize the Emscripten WASM runtime
- Register the WASM execution provider

In Bun, the bundled ORT's initialization pathway breaks silently. The `resolveBackend("wasm")` call catches the init error and returns the error as a string. When `InferenceSession.create()` calls `d.create(...)` on this string result, it produces the confusing `undefined is not an object` error.

## The Fix

The solution uses three components working together:

### 1. External onnxruntime-web (ort.mjs)

Instead of relying on the copy bundled inside `kokoro.web.js`, we load `ort.mjs` from the filesystem as a separate module. This standalone build initializes correctly in Bun.

```typescript
const ort = await import(join(ortWasmDir, 'ort.mjs'));
ort.env.wasm.numThreads = 1;      // Single-threaded (no Web Workers needed)
ort.env.wasm.proxy = false;        // No proxy worker
ort.env.wasm.wasmPaths = ortWasmDir + '/';  // Local WASM files
```

### 2. globalThis Registration

`kokoro.web.js` checks `globalThis[Symbol.for("onnxruntime")]` before falling back to its bundled copy. By registering our working ORT instance there, kokoro.web.js uses it instead:

```typescript
(globalThis as any)[Symbol.for('onnxruntime')] = ort;
```

### 3. Runtime Patches to kokoro.web.js

When kokoro.web.js finds ORT via `globalThis`, it skips device setup (the device list and defaults are only populated in the `else` branches). Two surgical patches to the minified source fix this:

**Patch 1 — Device list setup:** The globalThis code path (`if(u in globalThis)g=globalThis[u]`) doesn't populate the available device list (`l`) or default devices (`c`). We add `l.push("wasm"),c=["wasm"]`.

**Patch 2 — CPU-to-WASM mapping:** The model's config requests the `"cpu"` execution provider, which doesn't exist in onnxruntime-web. We add a fallback: `if(e==="cpu"&&l.includes("wasm"))return["wasm"]`.

Both patches are applied at runtime by reading `kokoro.web.js`, doing string replacements, writing to a temp file, and importing it.

## File Layout in the App Bundle

```
Pull Read.app/Contents/Resources/
  pullread                              # Compiled Bun binary
  kokoro-model/                         # Pre-downloaded ONNX model
    config.json
    tokenizer.json
    onnx/model_quantized.onnx           # 92MB q8 model
    voices/af_heart.bin                 # Voice data files
    voices/...
  kokoro.web.js                         # kokoro-js web build (~2MB)
  ort-wasm/                             # onnxruntime-web files
    ort.mjs                             # ORT JavaScript module
    ort-wasm-simd-threaded.jsep.wasm    # WASM binary (~21MB)
```

## Environment Variables

Set by `SyncService.swift` when launching the CLI binary:

| Variable | Purpose |
|----------|---------|
| `PULLREAD_KOKORO_MODEL_DIR` | Path to bundled Kokoro model directory |
| `PULLREAD_KOKORO_JS_PATH` | Path to `kokoro.web.js` |
| `PULLREAD_ORT_WASM_DIR` | Path to `ort-wasm/` directory containing `ort.mjs` |
| `DYLD_LIBRARY_PATH` | Includes Resources dir for native dylib fallback |

## Loading Strategy in src/tts.ts

```
getKokoroPipeline()
  |
  |-- Strategy 1: import('kokoro-js')
  |     Works in dev mode (unbundled Bun with node_modules)
  |     Uses onnxruntime-node (native, fast)
  |
  |-- Strategy 2 (fallback): Patched kokoro.web.js + external ORT
  |     1. resolveOrtWasmDir() → find ort.mjs + WASM files
  |     2. preRegisterOrt() → load ort.mjs, register on globalThis
  |     3. patchKokoroWebSource() → fix device detection
  |     4. import(patchedPath) → load patched kokoro.web.js
  |     Uses onnxruntime-web (WASM, ~2x slower but works everywhere)
```

## Version Compatibility

This fix was developed and tested against:

- kokoro-js 1.2.1
- @huggingface/transformers 3.8.1
- onnxruntime-web 1.22.0-dev (bundled in kokoro.web.js uses 1.21.0)
- Bun 1.3.9

The runtime patches target specific minified code patterns in `kokoro.web.js`. If kokoro-js updates its bundled transformers.js or ORT version, the patch strings may need updating. The patches are applied defensively (skip if pattern not found) so a version mismatch degrades gracefully rather than crashing.

## Testing

To verify the fix works in a compiled binary:

```bash
# Build a test binary
cat > /tmp/test-kokoro.ts << 'EOF'
const ort = await import("/path/to/node_modules/onnxruntime-web/dist/ort.mjs");
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = "/path/to/node_modules/onnxruntime-web/dist/";
(globalThis as any)[Symbol.for("onnxruntime")] = ort;

import { readFileSync, writeFileSync } from "fs";
let src = readFileSync("/path/to/node_modules/kokoro-js/dist/kokoro.web.js", "utf-8");
src = src.replace(
  'if(u in globalThis)g=globalThis[u];else',
  'if(u in globalThis){g=globalThis[u];l.push("wasm"),c=["wasm"]}else'
);
src = src.replace(
  'if(l.includes(e))return[o[e]??e];throw',
  'if(l.includes(e))return[o[e]??e];if(e==="cpu"&&l.includes("wasm"))return["wasm"];throw'
);
writeFileSync("/tmp/kokoro.patched.js", src);

const { KokoroTTS } = await import("/tmp/kokoro.patched.js");
const pipeline = await KokoroTTS.from_pretrained("file:///path/to/model/", { dtype: "q8" });
console.log("Pipeline loaded:", typeof pipeline.generate);
EOF

bun build /tmp/test-kokoro.ts --compile --outfile /tmp/test-kokoro-binary
/tmp/test-kokoro-binary
```
