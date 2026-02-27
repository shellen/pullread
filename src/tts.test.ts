// ABOUTME: Tests for TTS module utilities
// ABOUTME: Validates model filename mapping and markdown stripping

jest.mock('./keychain', () => ({ saveToKeychain: jest.fn(), loadFromKeychain: jest.fn() }));

import { kokoroModelFile, stripMarkdown } from './tts';

describe('kokoroModelFile', () => {
  it('maps q8 dtype to model_quantized.onnx', () => {
    expect(kokoroModelFile('q8')).toBe('onnx/model_quantized.onnx');
  });

  it('maps q4 dtype to model_q4.onnx', () => {
    expect(kokoroModelFile('q4')).toBe('onnx/model_q4.onnx');
  });

  it('maps other dtypes using the dtype name', () => {
    expect(kokoroModelFile('fp32')).toBe('onnx/model_fp32.onnx');
  });
});
