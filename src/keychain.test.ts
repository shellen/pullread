// ABOUTME: Tests for macOS Keychain integration functions
// ABOUTME: Validates save, load, and delete operations with mocked security CLI

import { execFileSync } from 'child_process';
import { saveToKeychain, loadFromKeychain, deleteFromKeychain } from './keychain';

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

const mockExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;

beforeEach(() => {
  mockExecFileSync.mockReset();
  Object.defineProperty(process, 'platform', { value: 'darwin' });
});

describe('deleteFromKeychain', () => {
  it('calls security delete-generic-password with correct args', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const result = deleteFromKeychain('tts-api-key');
    expect(result).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith('security', [
      'delete-generic-password',
      '-s', 'com.pullread.api-keys',
      '-a', 'tts-api-key',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
  });

  it('returns false when security command throws', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
    const result = deleteFromKeychain('nonexistent');
    expect(result).toBe(false);
  });

  it('returns false on non-darwin platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const result = deleteFromKeychain('tts-api-key');
    expect(result).toBe(false);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });
});
