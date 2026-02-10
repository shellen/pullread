// ABOUTME: Text-to-speech provider abstraction for article audio playback
// ABOUTME: Supports OpenAI TTS and ElevenLabs; browser speech synthesis is handled client-side

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { request as httpsRequest } from 'https';

const SETTINGS_PATH = join(homedir(), '.config', 'pullread', 'settings.json');
const CACHE_DIR = join(homedir(), '.config', 'pullread', 'tts-cache');

export interface TTSConfig {
  provider: 'browser' | 'openai' | 'elevenlabs';
  apiKey?: string;
  voice?: string;
  model?: string;
}

export const TTS_VOICES: Record<string, { id: string; label: string }[]> = {
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
      if (settings.tts) return settings.tts;
    }
  } catch {}
  return { provider: 'browser' };
}

export function saveTTSConfig(config: TTSConfig): void {
  let settings: Record<string, unknown> = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch {}
  }
  settings.tts = config;
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
  return text.trim();
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
  const path = join(CACHE_DIR, key + '.mp3');
  return existsSync(path) ? path : null;
}

/** Save audio to cache */
function saveCachedAudio(articleName: string, config: TTSConfig, audio: Buffer): string {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const key = cacheKey(articleName, config.provider, config.voice || '', config.model || '');
  const path = join(CACHE_DIR, key + '.mp3');
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

/** Generate TTS audio for the given text using the configured provider */
export async function generateSpeech(articleName: string, text: string, config: TTSConfig): Promise<Buffer> {
  // Check cache first
  const cached = getCachedAudioPath(articleName, config);
  if (cached) return readFileSync(cached);

  const plainText = stripMarkdown(text);
  if (!plainText) throw new Error('No text to speak');

  let audio: Buffer;

  switch (config.provider) {
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
