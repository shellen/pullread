// ABOUTME: Tests for TTS module utilities
// ABOUTME: Validates markdown stripping for TTS input

jest.mock('./keychain', () => ({ saveToKeychain: jest.fn(), loadFromKeychain: jest.fn() }));

import { stripMarkdown } from './tts';

describe('stripMarkdown', () => {
  it('removes images', () => {
    expect(stripMarkdown('Hello ![alt](http://img.png) world')).toBe('Hello  world');
  });

  it('converts links to text', () => {
    expect(stripMarkdown('[click here](http://example.com)')).toBe('click here');
  });

  it('removes header markers', () => {
    expect(stripMarkdown('## Title')).toBe('Title');
  });

  it('adds period after title before body', () => {
    const result = stripMarkdown('Title\n\nBody text');
    expect(result).toBe('Title.\n\nBody text');
  });
});
