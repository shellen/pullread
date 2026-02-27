// ABOUTME: Text-to-speech provider abstraction for article audio playback
// ABOUTME: Supports OpenAI TTS and ElevenLabs; browser speech synthesis is handled client-side

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { pipeline as streamPipeline } from 'stream/promises';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { request as httpsRequest } from 'https';
import { saveToKeychain, loadFromKeychain } from './keychain';

const SETTINGS_PATH = join(homedir(), '.config', 'pullread', 'settings.json');
const CACHE_DIR = join(homedir(), '.config', 'pullread', 'tts-cache');
const KOKORO_MODEL_DIR = join(homedir(), '.config', 'pullread', 'kokoro-model');

/** Active TTS generation session for progressive chunk-based playback */
interface TtsSession {
  id: string;
  articleName: string;
  config: TTSConfig;
  chunks: string[];
  audio: Map<number, Buffer>;
  createdAt: number;
}

const ttsSessions = new Map<string, TtsSession>();

// Clean up sessions older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, session] of ttsSessions) {
    if (session.createdAt < cutoff) ttsSessions.delete(id);
  }
}, 60 * 1000);

/** Resolve the best Kokoro model directory — bundled (from app Resources) or user cache */
function resolveKokoroModelDir(): string {
  // If running inside the macOS app, SyncService sets this to the bundled model path
  const bundled = process.env.PULLREAD_KOKORO_MODEL_DIR;
  if (bundled && existsSync(bundled)) {
    return bundled;
  }
  // Fall back to user cache directory (downloaded on first use)
  return KOKORO_MODEL_DIR;
}

const HF_MODEL_BASE = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/';

/** Map a Kokoro dtype to its ONNX model filename on HuggingFace */
export function kokoroModelFile(dtype: string): string {
  return dtype === 'q8' ? 'onnx/model_quantized.onnx' : `onnx/model_${dtype}.onnx`;
}

/** Download a single file from HuggingFace Hub to a local path, following redirects */
async function downloadHfFile(remotePath: string, localPath: string): Promise<void> {
  const dir = dirname(localPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const res = await fetch(HF_MODEL_BASE + remotePath, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to download ${remotePath}: HTTP ${res.status}`);
  if (!res.body) throw new Error(`No response body for ${remotePath}`);

  const fileStream = createWriteStream(localPath);
  // @ts-ignore — ReadableStream from fetch is compatible with Readable in Bun
  await streamPipeline(res.body as any, fileStream);
}

/** Download Kokoro model files to a local cache directory if not already present */
async function ensureKokoroModelCached(modelDir: string, dtype: string): Promise<void> {
  const modelFile = kokoroModelFile(dtype);
  const requiredFiles = ['config.json', 'tokenizer.json', 'tokenizer_config.json', modelFile];
  const missing = requiredFiles.filter(f => !existsSync(join(modelDir, f)));
  if (missing.length === 0) return;

  console.log(`[TTS] Downloading Kokoro model files (${missing.length} files)...`);
  for (const file of missing) {
    console.log(`[TTS]   downloading ${file}...`);
    await downloadHfFile(file, join(modelDir, file));
  }
  console.log('[TTS] Kokoro model download complete');
}

export interface TTSConfig {
  provider: 'browser' | 'kokoro' | 'openai' | 'elevenlabs';
  apiKey?: string;
  voice?: string;
  model?: string;
}

export const TTS_VOICES: Record<string, { id: string; label: string }[]> = {
  kokoro: [
    { id: 'af_heart', label: 'Heart \u2014 warm, expressive' },
    { id: 'af_bella', label: 'Bella \u2014 clear, lively' },
    { id: 'af_nicole', label: 'Nicole \u2014 low, breathy' },
    { id: 'af_sarah', label: 'Sarah \u2014 friendly, natural' },
    { id: 'af_sky', label: 'Sky \u2014 light, airy' },
    { id: 'am_adam', label: 'Adam \u2014 deep, steady' },
    { id: 'am_michael', label: 'Michael \u2014 warm, smooth' },
    { id: 'bf_emma', label: 'Emma \u2014 clear, polished' },
    { id: 'bf_isabella', label: 'Isabella \u2014 refined, elegant' },
    { id: 'bm_george', label: 'George \u2014 authoritative, rich' },
    { id: 'bm_lewis', label: 'Lewis \u2014 measured, calm' },
  ],
  openai: [
    { id: 'alloy', label: 'Alloy' },
    { id: 'ash', label: 'Ash' },
    { id: 'coral', label: 'Coral' },
    { id: 'echo', label: 'Echo' },
    { id: 'fable', label: 'Fable' },
    { id: 'nova', label: 'Nova' },
    { id: 'onyx', label: 'Onyx' },
    { id: 'sage', label: 'Sage' },
    { id: 'shimmer', label: 'Shimmer' },
  ],
  elevenlabs: [
    { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah' },
    { id: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura' },
    { id: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie' },
    { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George' },
    { id: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam' },
    { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily' },
    { id: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel' },
  ],
};

export const TTS_MODELS: Record<string, { id: string; label: string }[]> = {
  kokoro: [
    { id: 'kokoro-v1-q8', label: 'Kokoro v1 (q8, 92MB)' },
    { id: 'kokoro-v1-q4', label: 'Kokoro v1 (q4, 305MB)' },
  ],
  openai: [
    { id: 'tts-1', label: 'TTS-1 (fast)' },
    { id: 'tts-1-hd', label: 'TTS-1 HD (quality)' },
    { id: 'gpt-4o-mini-tts', label: 'GPT-4o Mini TTS' },
  ],
  elevenlabs: [
    { id: 'eleven_multilingual_v2', label: 'Multilingual v2' },
    { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5 (fast)' },
    { id: 'eleven_flash_v2_5', label: 'Flash v2.5 (fastest)' },
  ],
};

export function loadTTSConfig(): TTSConfig {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      if (settings.tts) {
        const config = settings.tts as TTSConfig;
        // Migrate removed Kokoro provider to browser
        if (config.provider === 'kokoro') {
          config.provider = 'browser';
        }
        // Read API key from Keychain if not in settings
        if (!config.apiKey && (config.provider === 'openai' || config.provider === 'elevenlabs')) {
          config.apiKey = loadFromKeychain('tts-api-key') || '';
        }
        return config;
      }
    }
  } catch {}
  return { provider: 'browser' };
}

export function saveTTSConfig(config: TTSConfig): void {
  // Store API key in Keychain, strip from settings.json
  if (config.apiKey) {
    saveToKeychain('tts-api-key', config.apiKey);
  }
  const { apiKey, ...configWithoutKey } = config;
  let settings: Record<string, unknown> = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch {}
  }
  settings.tts = configWithoutKey;
  const dir = join(homedir(), '.config', 'pullread');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

/** Strip markdown to plain text for TTS */
export function stripMarkdown(md: string): string {
  let text = md;
  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '');
  // Convert links to just text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Remove headers markers
  text = text.replace(/^#{1,6}\s+/gm, '');
  // Remove bold/italic markers
  text = text.replace(/(\*{1,3}|_{1,3})([^*_]+)\1/g, '$2');
  // Remove strikethrough
  text = text.replace(/~~([^~]+)~~/g, '$1');
  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  // Remove inline code
  text = text.replace(/`([^`]+)`/g, '$1');
  // Remove blockquote markers
  text = text.replace(/^>\s*/gm, '');
  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');
  // Remove list markers
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  // Collapse multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  // Trim
  text = text.trim();
  // Add a sentence-ending period after the title (first line) so TTS engines
  // pause briefly before reading the body
  const firstBreak = text.indexOf('\n\n');
  if (firstBreak > 0) {
    const title = text.slice(0, firstBreak).trimEnd();
    const lastChar = title[title.length - 1];
    if (lastChar !== '.' && lastChar !== '!' && lastChar !== '?') {
      text = title + '.\n\n' + text.slice(firstBreak + 2);
    }
  }
  return text;
}

/** Generate a cache key for an article */
function cacheKey(articleName: string, provider: string, voice: string, model: string): string {
  const hash = createHash('sha256')
    .update(articleName + '|' + provider + '|' + voice + '|' + model)
    .digest('hex')
    .slice(0, 16);
  return hash;
}

/** Check if cached audio exists */
export function getCachedAudioPath(articleName: string, config: TTSConfig): string | null {
  if (!existsSync(CACHE_DIR)) return null;
  const key = cacheKey(articleName, config.provider, config.voice || '', config.model || '');
  const ext = config.provider === 'kokoro' ? '.wav' : '.mp3';
  const path = join(CACHE_DIR, key + ext);
  return existsSync(path) ? path : null;
}

/** Save audio to cache */
function saveCachedAudio(articleName: string, config: TTSConfig, audio: Buffer): string {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const key = cacheKey(articleName, config.provider, config.voice || '', config.model || '');
  const ext = config.provider === 'kokoro' ? '.wav' : '.mp3';
  const path = join(CACHE_DIR, key + ext);
  writeFileSync(path, audio);
  return path;
}

/** Split text into chunks suitable for TTS APIs */
function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Try to split at sentence boundary
    let splitIdx = -1;
    const searchEnd = Math.min(remaining.length, maxChars);

    // Look for sentence end (.!?) near the limit
    for (let i = searchEnd - 1; i > maxChars * 0.5; i--) {
      if ('.!?\n'.includes(remaining[i]) && (i + 1 >= remaining.length || remaining[i + 1] === ' ' || remaining[i + 1] === '\n')) {
        splitIdx = i + 1;
        break;
      }
    }

    if (splitIdx === -1) {
      // Fall back to space
      for (let i = searchEnd - 1; i > maxChars * 0.5; i--) {
        if (remaining[i] === ' ') {
          splitIdx = i + 1;
          break;
        }
      }
    }

    if (splitIdx === -1) splitIdx = maxChars;

    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  return chunks;
}

/** Make HTTPS POST request and return response body as Buffer */
function httpsPost(url: string, headers: Record<string, string>, body: string | Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = httpsRequest({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`TTS API error ${res.statusCode}: ${buf.toString('utf-8').slice(0, 200)}`));
        } else {
          resolve(buf);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Check if Kokoro model is downloaded and ready */
export function getKokoroStatus(): { installed: boolean; modelPath: string; bundled: boolean } {
  const modelDir = resolveKokoroModelDir();
  const installed = existsSync(modelDir) && readdirSync(modelDir).length > 0;
  const bundled = !!process.env.PULLREAD_KOKORO_MODEL_DIR && existsSync(process.env.PULLREAD_KOKORO_MODEL_DIR);
  return { installed, modelPath: modelDir, bundled };
}

/**
 * Pre-download the Kokoro model in the background.
 * Returns a promise that resolves when the model is ready.
 */
export async function preloadKokoro(model: string = 'kokoro-v1-q8'): Promise<{ ready: boolean; error?: string }> {
  try {
    await getKokoroPipeline(model);
    return { ready: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ready: false, error: msg };
  }
}

/** Lazy-loaded Kokoro pipeline singleton */
let kokoroPipeline: any = null;
let kokoroLoading = false;

/**
 * Find the kokoro.web.js self-contained bundle on the filesystem.
 * This is used as a fallback when the normal `import('kokoro-js')` fails
 * (e.g. in Bun compiled binaries where module resolution is broken).
 */
function resolveKokoroWebBuild(): string | null {
  // 1. Explicit env var (set by Tauri sidecar launcher)
  const explicit = process.env.PULLREAD_KOKORO_JS_PATH;
  if (explicit && existsSync(explicit)) return explicit;

  // 2. Adjacent to the bundled model directory (app Resources/)
  const modelDir = process.env.PULLREAD_KOKORO_MODEL_DIR;
  if (modelDir) {
    const adjacent = join(dirname(modelDir), 'kokoro.web.js');
    if (existsSync(adjacent)) return adjacent;
  }

  // 3. In node_modules (dev / non-bundled installs)
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'node_modules', 'kokoro-js', 'dist', 'kokoro.web.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * Find the onnxruntime-web directory containing ort.mjs and WASM files.
 * Required for the web build fallback — the bundled ORT inside kokoro.web.js
 * fails to self-initialize in Bun, so we load ort.mjs separately and
 * register it on globalThis for kokoro.web.js to discover.
 */
function resolveOrtWasmDir(): string | null {
  // 1. Explicit env var (set by Tauri sidecar launcher)
  const explicit = process.env.PULLREAD_ORT_WASM_DIR;
  if (explicit && existsSync(join(explicit, 'ort.mjs'))) return explicit;

  // 2. Adjacent to kokoro.web.js in app Resources/
  const modelDir = process.env.PULLREAD_KOKORO_MODEL_DIR;
  if (modelDir) {
    const adjacent = join(dirname(modelDir), 'ort-wasm');
    if (existsSync(join(adjacent, 'ort.mjs'))) return adjacent;
  }

  // 3. In node_modules (dev / non-bundled installs)
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'node_modules', 'onnxruntime-web', 'dist');
    if (existsSync(join(candidate, 'ort.mjs'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * Patch kokoro.web.js source to work with externally-registered ORT.
 *
 * kokoro.web.js bundles its own onnxruntime-web internally, but that bundled
 * copy fails to initialize in Bun (the WASM backend never registers properly).
 * When we pre-register a working ORT on globalThis[Symbol.for("onnxruntime")],
 * kokoro.web.js finds it but skips device setup. These patches fix that:
 *
 * 1. Populate the WASM device list when using the globalThis ORT path
 * 2. Map "cpu" device requests to "wasm" (the model config defaults to "cpu")
 */
function patchKokoroWebSource(src: string): string {
  // Patch 1: Add device setup for globalThis ORT path
  const p1_find = 'if(u in globalThis)g=globalThis[u];else';
  const p1_replace = 'if(u in globalThis){g=globalThis[u];l.push("wasm"),c=["wasm"]}else';
  if (src.includes(p1_find)) {
    src = src.replace(p1_find, p1_replace);
  }

  // Patch 2: Map "cpu" device to "wasm" in the device resolver
  const p2_find = 'if(l.includes(e))return[o[e]??e];throw';
  const p2_replace = 'if(l.includes(e))return[o[e]??e];if(e==="cpu"&&l.includes("wasm"))return["wasm"];throw';
  if (src.includes(p2_find)) {
    src = src.replace(p2_find, p2_replace);
  }

  return src;
}

/**
 * Pre-register onnxruntime-web on globalThis so kokoro.web.js can find it.
 * Also configures WASM for single-threaded, no-proxy mode (Bun compatible).
 */
async function preRegisterOrt(ortWasmDir: string): Promise<void> {
  const ortSymbol = Symbol.for('onnxruntime');
  if (ortSymbol in globalThis) return; // Already registered

  const ortPath = join(ortWasmDir, 'ort.mjs');
  const ort = await import(ortPath);

  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = ortWasmDir + '/';

  (globalThis as any)[ortSymbol] = ort;
}

async function getKokoroPipeline(model: string): Promise<any> {
  if (kokoroPipeline) return kokoroPipeline;
  if (kokoroLoading) {
    // Wait for concurrent load to finish
    while (kokoroLoading) await new Promise(r => setTimeout(r, 100));
    if (kokoroPipeline) return kokoroPipeline;
  }

  kokoroLoading = true;
  try {
    let KokoroTTS: any;
    let usingWebBuild = false;

    // Strategy 1: normal import — works in dev mode (ts-node / unbundled bun)
    // where node_modules is available on the filesystem.
    try {
      const mod = await import('kokoro-js');
      KokoroTTS = mod.KokoroTTS;
    } catch {
      // Strategy 2: load the patched kokoro.web.js with external ORT.
      //
      // In Bun compiled binaries, `import('kokoro-js')` fails because:
      //   (a) Bun's bundler corrupts @huggingface/transformers' webpack internals
      //   (b) onnxruntime-node's native .node addon can't dlopen from Bun's virtual FS
      //
      // The fix uses three pieces:
      //   1. onnxruntime-web (ort.mjs) — loaded separately and registered on
      //      globalThis[Symbol.for("onnxruntime")] so kokoro.web.js discovers it
      //   2. kokoro.web.js — runtime-patched to set up WASM device list and
      //      map "cpu" device requests to "wasm"
      //   3. ort-wasm-simd-threaded.jsep.wasm — the WASM binary for ONNX inference
      const webBuildPath = resolveKokoroWebBuild();
      if (!webBuildPath) {
        throw new Error(
          'Kokoro voice engine not found — neither the kokoro-js package nor ' +
          'the bundled kokoro.web.js could be located.'
        );
      }

      const ortWasmDir = resolveOrtWasmDir();
      if (!ortWasmDir) {
        throw new Error(
          'Kokoro WASM runtime not found — the onnxruntime-web dist directory ' +
          'could not be located. Ensure ort.mjs and ort-wasm-simd-threaded.jsep.wasm ' +
          'are bundled in the app Resources/ort-wasm/ directory.'
        );
      }

      // Pre-register ORT on globalThis before loading kokoro.web.js
      await preRegisterOrt(ortWasmDir);

      // Patch kokoro.web.js and load from a temp file
      const { readFileSync: readFS, writeFileSync: writeFS } = await import('fs');
      const src = readFS(webBuildPath, 'utf-8');
      const patched = patchKokoroWebSource(src);
      const tmpDir = join((await import('os')).tmpdir(), 'pullread-kokoro');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
      const patchedPath = join(tmpDir, 'kokoro.web.patched.js');
      writeFS(patchedPath, patched);

      const mod = await import(patchedPath);
      KokoroTTS = mod.KokoroTTS;
      usingWebBuild = true;
    }

    const dtype = model === 'kokoro-v1-q4' ? 'q4' : 'q8';
    const modelDir = resolveKokoroModelDir();
    if (!existsSync(modelDir)) mkdirSync(modelDir, { recursive: true });

    // If the model is bundled inside the app, use that path directly.
    const bundled = process.env.PULLREAD_KOKORO_MODEL_DIR && existsSync(process.env.PULLREAD_KOKORO_MODEL_DIR);

    let modelSource: string;
    if (bundled) {
      modelSource = usingWebBuild ? 'file://' + modelDir : modelDir;
    } else if (usingWebBuild) {
      // Web build uses fetch() for file I/O — @huggingface/transformers'
      // remote download is broken in Bun binaries (fetch('/models/...') fails,
      // and the Hub redirect chain also breaks). Download files ourselves first.
      await ensureKokoroModelCached(modelDir, dtype);
      modelSource = 'file://' + modelDir;
    } else {
      modelSource = 'onnx-community/Kokoro-82M-v1.0-ONNX';
    }

    kokoroPipeline = await KokoroTTS.from_pretrained(
      modelSource,
      { dtype, cache_dir: usingWebBuild ? undefined : modelDir }
    );
    return kokoroPipeline;
  } finally {
    kokoroLoading = false;
  }
}

/** Generate speech using Kokoro (local) */
async function kokoroTTS(text: string, config: TTSConfig): Promise<Buffer> {
  const pipeline = await getKokoroPipeline(config.model || 'kokoro-v1-q8');
  const voice = config.voice || 'af_heart';

  // Kokoro-82M has a ~510 phoneme-token context window. At ~4-5 tokens per
  // word that's roughly 100-125 words (~500 chars). Exceeding it silently
  // truncates the audio output.
  const chunks = chunkText(text, 500);
  const pcmChunks: Float32Array[] = [];
  let sampleRate = 24000;

  for (const chunk of chunks) {
    const audio = await pipeline.generate(chunk, { voice });

    if (audio.data) {
      pcmChunks.push(audio.data);
      if (audio.sampling_rate) sampleRate = audio.sampling_rate;
    } else if (typeof audio.toBlob === 'function') {
      const blob = await audio.toBlob();
      const arrayBuf = await blob.arrayBuffer();
      pcmChunks.push(extractPcmFromWav(Buffer.from(arrayBuf)));
    } else {
      throw new Error('Unexpected Kokoro audio output format');
    }
  }

  // Concatenate all raw PCM samples into a single array, then encode once.
  // (Concatenating WAV files directly produces a corrupt file — only the
  // first chunk plays because each WAV has its own header and data length.)
  const totalLength = pcmChunks.reduce((sum, c) => sum + c.length, 0);
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const pcm of pcmChunks) {
    combined.set(pcm, offset);
    offset += pcm.length;
  }

  return encodeWav(combined, sampleRate);
}

/** Extract raw PCM int16 samples from a WAV buffer by scanning for the data chunk */
function extractPcmFromWav(wavBuf: Buffer): Float32Array {
  // Scan RIFF chunks starting after the 12-byte RIFF header (RIFF + size + WAVE)
  for (let pos = 12; pos < wavBuf.length - 8; ) {
    const chunkId = wavBuf.toString('ascii', pos, pos + 4);
    const chunkSize = wavBuf.readUInt32LE(pos + 4);
    if (chunkId === 'data') {
      const dataStart = pos + 8;
      const sampleCount = Math.min(chunkSize, wavBuf.length - dataStart) / 2;
      const pcm = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        pcm[i] = wavBuf.readInt16LE(dataStart + i * 2) / 32767;
      }
      return pcm;
    }
    pos += 8 + chunkSize;
    if (chunkSize % 2 !== 0) pos++; // WAV chunks are word-aligned
  }
  throw new Error('Invalid WAV: no data chunk found');
}

/** Encode raw PCM float32 data as a WAV buffer */
function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const buf = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  // fmt chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 30);
  buf.writeUInt16LE(bitsPerSample, 32);
  // data chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  // Convert float32 to int16
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), headerSize + i * 2);
  }

  return buf;
}

/** Generate a single chunk of speech using Kokoro (returns WAV) */
async function kokoroSingleChunk(text: string, config: TTSConfig): Promise<Buffer> {
  const pipeline = await getKokoroPipeline(config.model || 'kokoro-v1-q8');
  const voice = config.voice || 'af_heart';
  const audio = await pipeline.generate(text, { voice });

  if (audio.data) {
    const pcm = audio.data;
    const sampleRate = audio.sampling_rate || 24000;
    return encodeWav(pcm, sampleRate);
  } else if (typeof audio.toBlob === 'function') {
    // Return Kokoro's native WAV directly — re-encoding is lossy and
    // produces WAVs that some decoders (WKWebView) reject
    const blob = await audio.toBlob();
    const arrayBuf = await blob.arrayBuffer();
    return Buffer.from(arrayBuf);
  } else {
    throw new Error('Unexpected Kokoro audio output format');
  }
}

/** Generate a single chunk of speech using OpenAI (returns MP3) */
async function openaiSingleChunk(text: string, config: TTSConfig): Promise<Buffer> {
  const body = JSON.stringify({
    model: config.model || 'tts-1',
    voice: config.voice || 'alloy',
    input: text,
    response_format: 'mp3',
  });

  return httpsPost('https://api.openai.com/v1/audio/speech', {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }, body);
}

/** Generate a single chunk of speech using ElevenLabs (returns MP3) */
async function elevenlabsSingleChunk(text: string, config: TTSConfig): Promise<Buffer> {
  const voiceId = config.voice || 'EXAVITQu4vr4xnSDxMaL';
  const body = JSON.stringify({
    text,
    model_id: config.model || 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  });

  return httpsPost(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    'xi-api-key': config.apiKey || '',
    'Content-Type': 'application/json',
    'Accept': 'audio/mpeg',
  }, body);
}

/** Chunk size per provider */
function chunkSizeForProvider(provider: string): number {
  switch (provider) {
    case 'kokoro': return 500;
    case 'openai': return 4096;
    case 'elevenlabs': return 5000;
    default: return 500;
  }
}

/** Create a TTS session for progressive chunk-based playback */
export function createTtsSession(
  articleName: string,
  text: string,
  config: TTSConfig
): { id: string; totalChunks: number } {
  const plainText = stripMarkdown(text);
  if (!plainText) throw new Error('No text to speak');

  const maxChars = chunkSizeForProvider(config.provider);
  const chunks = chunkText(plainText, maxChars);
  const id = createHash('sha256')
    .update(articleName + '|' + Date.now() + '|' + Math.random())
    .digest('hex')
    .slice(0, 16);

  ttsSessions.set(id, {
    id,
    articleName,
    config,
    chunks,
    audio: new Map(),
    createdAt: Date.now(),
  });

  return { id, totalChunks: chunks.length };
}

/**
 * Generate audio for a single chunk within a session.
 * Caches the result in the session and auto-finalizes when all chunks are done.
 */
export async function generateSessionChunk(sessionId: string, chunkIndex: number): Promise<Buffer> {
  const session = ttsSessions.get(sessionId);
  if (!session) throw new Error('TTS session not found');
  if (chunkIndex < 0 || chunkIndex >= session.chunks.length) {
    throw new Error(`Chunk index ${chunkIndex} out of range (0-${session.chunks.length - 1})`);
  }

  // Return cached chunk if already generated
  const cached = session.audio.get(chunkIndex);
  if (cached) return cached;

  const text = session.chunks[chunkIndex];
  let audio: Buffer;

  switch (session.config.provider) {
    case 'kokoro':
      try {
        audio = await kokoroSingleChunk(text, session.config);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('dlopen') || msg.includes('code signature') || msg.includes('not valid for use')) {
          throw new Error('Kokoro voice engine could not load. This may be a code signing issue — try reinstalling Pull Read from the latest release. (Detail: ' + (msg.length > 200 ? msg.slice(0, 200) + '…' : msg) + ')');
        }
        if (msg.includes('kokoro-js') || msg.includes('Cannot find module') || msg.includes('Cannot find package')) {
          throw new Error('Kokoro voice engine is not available in this build — try reinstalling Pull Read from the latest release.');
        }
        throw new Error('Kokoro voice failed: ' + (msg.length > 120 ? msg.slice(0, 120) + '…' : msg));
      }
      break;
    case 'openai':
      if (!session.config.apiKey) throw new Error('OpenAI API key required for TTS');
      audio = await openaiSingleChunk(text, session.config);
      break;
    case 'elevenlabs':
      if (!session.config.apiKey) throw new Error('ElevenLabs API key required for TTS');
      audio = await elevenlabsSingleChunk(text, session.config);
      break;
    default:
      throw new Error('Unsupported provider for chunked TTS');
  }

  session.audio.set(chunkIndex, audio);

  // Auto-finalize: when all chunks are generated, combine and cache to disk
  if (session.audio.size === session.chunks.length) {
    finalizeSession(session);
  }

  return audio;
}

/** Combine all chunk audio into a single file and save to disk cache */
function finalizeSession(session: TtsSession): void {
  const buffers: Buffer[] = [];
  for (let i = 0; i < session.chunks.length; i++) {
    const buf = session.audio.get(i);
    if (buf) buffers.push(buf);
  }

  let combined: Buffer;
  if (session.config.provider === 'kokoro') {
    // Extract PCM from each WAV chunk, concatenate, re-encode as single WAV
    const pcmChunks: Float32Array[] = [];
    for (const wavBuf of buffers) {
      pcmChunks.push(extractPcmFromWav(wavBuf));
    }
    const totalLength = pcmChunks.reduce((sum, c) => sum + c.length, 0);
    const allPcm = new Float32Array(totalLength);
    let offset = 0;
    for (const pcm of pcmChunks) {
      allPcm.set(pcm, offset);
      offset += pcm.length;
    }
    combined = encodeWav(allPcm, 24000);
  } else {
    // MP3 frames are self-contained — simple concatenation works
    combined = Buffer.concat(buffers);
  }

  saveCachedAudio(session.articleName, session.config, combined);
  ttsSessions.delete(session.id);
}

/** Generate speech using OpenAI TTS */
async function openaiTTS(text: string, config: TTSConfig): Promise<Buffer> {
  const chunks = chunkText(text, 4096);
  const audioBuffers: Buffer[] = [];

  for (const chunk of chunks) {
    const body = JSON.stringify({
      model: config.model || 'tts-1',
      voice: config.voice || 'alloy',
      input: chunk,
      response_format: 'mp3',
    });

    const buf = await httpsPost('https://api.openai.com/v1/audio/speech', {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    }, body);

    audioBuffers.push(buf);
  }

  return Buffer.concat(audioBuffers);
}

/** Generate speech using ElevenLabs */
async function elevenlabsTTS(text: string, config: TTSConfig): Promise<Buffer> {
  const chunks = chunkText(text, 5000);
  const audioBuffers: Buffer[] = [];
  const voiceId = config.voice || 'EXAVITQu4vr4xnSDxMaL'; // Default: Sarah

  for (const chunk of chunks) {
    const body = JSON.stringify({
      text: chunk,
      model_id: config.model || 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    });

    const buf = await httpsPost(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      'xi-api-key': config.apiKey || '',
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    }, body);

    audioBuffers.push(buf);
  }

  return Buffer.concat(audioBuffers);
}

/** Get the audio content type for a provider */
export function getAudioContentType(provider: string): string {
  return provider === 'kokoro' ? 'audio/wav' : 'audio/mpeg';
}

/** Generate TTS audio for the given text using the configured provider */
export async function generateSpeech(articleName: string, text: string, config: TTSConfig): Promise<Buffer> {
  // Check cache first
  const cached = getCachedAudioPath(articleName, config);
  if (cached) return readFileSync(cached);

  const plainText = stripMarkdown(text);
  if (!plainText) throw new Error('No text to speak');

  let audio: Buffer;

  switch (config.provider) {
    case 'kokoro':
      try {
        audio = await kokoroTTS(plainText, config);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Translate native library / code signing errors into user-friendly messages
        if (msg.includes('dlopen') || msg.includes('code signature') || msg.includes('not valid for use')) {
          throw new Error('Kokoro voice engine could not load. This may be a code signing issue — try reinstalling Pull Read from the latest release. (Detail: ' + (msg.length > 200 ? msg.slice(0, 200) + '…' : msg) + ')');
        }
        if (msg.includes('kokoro-js') || msg.includes('Cannot find module') || msg.includes('Cannot find package')) {
          throw new Error('Kokoro voice engine is not available in this build — try reinstalling Pull Read from the latest release.');
        }
        throw new Error('Kokoro voice failed: ' + (msg.length > 120 ? msg.slice(0, 120) + '…' : msg));
      }
      break;
    case 'openai':
      if (!config.apiKey) throw new Error('OpenAI API key required for TTS');
      audio = await openaiTTS(plainText, config);
      break;
    case 'elevenlabs':
      if (!config.apiKey) throw new Error('ElevenLabs API key required for TTS');
      audio = await elevenlabsTTS(plainText, config);
      break;
    default:
      throw new Error('Browser TTS is handled client-side');
  }

  // Cache the result
  saveCachedAudio(articleName, config, audio);
  return audio;
}
