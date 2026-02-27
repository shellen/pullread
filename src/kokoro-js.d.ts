// ABOUTME: Type declaration for kokoro-js which has no bundled types
// ABOUTME: Lets TypeScript compile without errors when importing the module
declare module 'kokoro-js' {
  export class KokoroTTS {
    static from_pretrained(model: string, options?: Record<string, unknown>): Promise<KokoroTTS>;
    generate(text: string, options?: Record<string, unknown>): Promise<any>;
  }
}
