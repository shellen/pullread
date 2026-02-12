// ABOUTME: Copies Kokoro TTS runtime files from node_modules to Tauri resources
// ABOUTME: Stages kokoro.web.js, ort.mjs, and WASM files for app bundling

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const rootDir = join(dirname(process.argv[1]), '..');
const outDir = join(rootDir, 'src-tauri', 'resources');

const kokoroSrc = join(rootDir, 'node_modules', 'kokoro-js', 'dist', 'kokoro.web.js');
const ortDir = join(rootDir, 'node_modules', 'onnxruntime-web', 'dist');

const files: Array<{ src: string; dest: string }> = [
  { src: kokoroSrc, dest: join(outDir, 'kokoro.web.js') },
  { src: join(ortDir, 'ort.mjs'), dest: join(outDir, 'ort-wasm', 'ort.mjs') },
  { src: join(ortDir, 'ort-wasm-simd-threaded.jsep.wasm'), dest: join(outDir, 'ort-wasm', 'ort-wasm-simd-threaded.jsep.wasm') },
  { src: join(ortDir, 'ort-wasm-simd-threaded.wasm'), dest: join(outDir, 'ort-wasm', 'ort-wasm-simd-threaded.wasm') },
];

let copied = 0;
for (const { src, dest } of files) {
  if (!existsSync(src)) {
    console.error(`Missing: ${src}`);
    console.error('Run "bun install" first to get kokoro-js and onnxruntime-web.');
    process.exit(1);
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  copied++;
}

console.log(`Staged ${copied} Kokoro TTS files into src-tauri/resources/`);
