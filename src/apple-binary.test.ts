// ABOUTME: Tests for Apple Intelligence compiled binary caching
// ABOUTME: Verifies ensureAppleBinary cache hit/miss/recompile/failure behavior

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockExecFileSync = jest.fn();

jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return {
    ...real,
    existsSync: (...args: any[]) => {
      const path = args[0];
      if (typeof path === 'string' && path.includes('.config/pullread/.apple-')) {
        return mockExistsSync(...args);
      }
      return real.existsSync(...args);
    },
    readFileSync: (...args: any[]) => {
      const path = args[0];
      if (typeof path === 'string' && path.includes('.config/pullread/.apple-')) {
        return mockReadFileSync(...args);
      }
      return real.readFileSync(...args);
    },
    writeFileSync: (...args: any[]) => {
      const path = args[0];
      if (typeof path === 'string' && path.includes('.config/pullread/.apple-')) {
        return mockWriteFileSync(...args);
      }
      return real.writeFileSync(...args);
    },
    unlinkSync: jest.fn(),
  };
});

jest.mock('child_process', () => {
  const real = jest.requireActual('child_process');
  return {
    ...real,
    execFileSync: (...args: any[]) => {
      if (args[0] === 'swiftc') return mockExecFileSync(...args);
      return real.execFileSync(...args);
    },
  };
});

jest.mock('./keychain', () => ({
  saveToKeychain: jest.fn(),
  loadFromKeychain: jest.fn(),
}));

import { ensureAppleBinary } from './summarizer';
import { homedir } from 'os';
import { join } from 'path';

const configDir = join(homedir(), '.config', 'pullread');

describe('ensureAppleBinary', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  const scriptContent = 'import Foundation\n@main struct Run {}';
  const binaryName = '.apple-test';
  const swiftPath = join(configDir, '.apple-test.swift');
  const binaryPath = join(configDir, '.apple-test');

  test('returns cached binary path when source matches', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(scriptContent);

    const result = ensureAppleBinary(scriptContent, binaryName);

    expect(result).toBe(binaryPath);
    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  test('compiles when no binary exists', () => {
    mockExistsSync.mockReturnValue(false);

    const result = ensureAppleBinary(scriptContent, binaryName);

    expect(mockWriteFileSync).toHaveBeenCalledWith(swiftPath, scriptContent);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'swiftc',
      expect.arrayContaining([swiftPath, '-o', binaryPath]),
      expect.any(Object)
    );
    expect(result).toBe(binaryPath);
  });

  test('recompiles when source has changed', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('old script content');

    const result = ensureAppleBinary(scriptContent, binaryName);

    expect(mockWriteFileSync).toHaveBeenCalledWith(swiftPath, scriptContent);
    expect(mockExecFileSync).toHaveBeenCalled();
    expect(result).toBe(binaryPath);
  });

  test('returns null when swiftc fails', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementation(() => { throw new Error('compilation failed'); });

    const result = ensureAppleBinary(scriptContent, binaryName);

    expect(result).toBeNull();
  });

  test('checks both binary and swift source exist for cache hit', () => {
    // Binary exists but .swift source doesn't
    mockExistsSync.mockImplementation((path: string) => {
      if (path === binaryPath) return true;
      if (path === swiftPath) return false;
      return false;
    });

    const result = ensureAppleBinary(scriptContent, binaryName);

    // Should compile since source file is missing
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalled();
    expect(result).toBe(binaryPath);
  });
});
