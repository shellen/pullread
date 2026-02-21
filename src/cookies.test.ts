// ABOUTME: Tests for site login cookie storage via macOS Keychain
// ABOUTME: Uses mock security CLI to avoid actual Keychain access in tests

import { saveSiteLoginCookies, getSiteLoginCookies, removeSiteLogin, listSiteLogins } from './cookies';

// Mock both execSync and execFileSync to avoid real Keychain access
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  execFileSync: jest.fn()
}));

import { execSync, execFileSync } from 'child_process';
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;

describe('Site login cookies', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
    mockExecFileSync.mockReset();
  });

  test('saveSiteLoginCookies writes JSON to Keychain via execFileSync', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const cookies = [
      { name: 'session', value: 'abc123', domain: '.medium.com', path: '/', expires: 0, secure: true, httpOnly: true }
    ];
    saveSiteLoginCookies('medium.com', cookies);
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'security',
      expect.arrayContaining(['add-generic-password', '-s', 'PullRead', '-a', 'medium.com', '-U']),
      expect.any(Object)
    );
    // Verify the JSON payload is in the args
    const args = mockExecFileSync.mock.calls[0][1] as string[];
    const wIndex = args.indexOf('-w');
    expect(wIndex).toBeGreaterThan(-1);
    expect(args[wIndex + 1]).toContain('abc123');
  });

  test('getSiteLoginCookies reads and formats cookie header', () => {
    const cookies = [
      { name: 'session', value: 'abc', domain: '.medium.com', path: '/', expires: 0, secure: true, httpOnly: true },
      { name: 'uid', value: '42', domain: '.medium.com', path: '/', expires: 0, secure: false, httpOnly: false }
    ];
    mockExecFileSync.mockReturnValue(JSON.stringify(cookies));
    const result = getSiteLoginCookies('medium.com');
    expect(result).toBe('session=abc; uid=42');
  });

  test('getSiteLoginCookies returns null when no entry exists', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
    expect(getSiteLoginCookies('unknown.com')).toBeNull();
  });

  test('getSiteLoginCookies filters expired cookies', () => {
    const cookies = [
      { name: 'session', value: 'abc', domain: '.x.com', path: '/', expires: 0, secure: true, httpOnly: true },
      { name: 'old', value: 'expired', domain: '.x.com', path: '/', expires: 1000, secure: false, httpOnly: false }
    ];
    mockExecFileSync.mockReturnValue(JSON.stringify(cookies));
    const result = getSiteLoginCookies('x.com');
    expect(result).toBe('session=abc');
  });

  test('getSiteLoginCookies finds cookies stored under base domain when queried with www prefix', () => {
    // First call with www.medium.com fails, second with medium.com succeeds
    const cookies = [
      { name: 'session', value: 'abc', domain: '.medium.com', path: '/', expires: 0, secure: true, httpOnly: true }
    ];
    mockExecFileSync
      .mockImplementationOnce(() => { throw new Error('not found'); })  // www.medium.com
      .mockReturnValueOnce(JSON.stringify(cookies));                    // medium.com
    const result = getSiteLoginCookies('www.medium.com');
    expect(result).toBe('session=abc');
  });

  test('removeSiteLogin calls security delete', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    expect(removeSiteLogin('medium.com')).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'security',
      expect.arrayContaining(['delete-generic-password', '-s', 'PullRead', '-a', 'medium.com']),
      expect.any(Object)
    );
  });

  test('removeSiteLogin returns false when entry not found', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
    expect(removeSiteLogin('unknown.com')).toBe(false);
  });

  test('getSiteLoginCookies returns null when all cookies are expired', () => {
    const cookies = [
      { name: 'old1', value: 'expired', domain: '.x.com', path: '/', expires: 1000, secure: true, httpOnly: true },
      { name: 'old2', value: 'also-expired', domain: '.x.com', path: '/', expires: 2000, secure: false, httpOnly: false }
    ];
    mockExecFileSync.mockReturnValue(JSON.stringify(cookies));
    expect(getSiteLoginCookies('x.com')).toBeNull();
  });

  test('saveSiteLoginCookies rejects domains with shell metacharacters', () => {
    expect(() => saveSiteLoginCookies('evil.com$(whoami)', [])).toThrow('Invalid domain');
  });

  test('listSiteLogins parses security dump output (acct before svce)', () => {
    // Real keychain dump has acct before svce within each entry
    mockExecSync.mockReturnValue(
      'keychain: "/Users/test/Library/Keychains/login.keychain-db"\nclass: "genp"\n' +
      '    "acct"<blob>="medium.com"\n    "svce"<blob>="PullRead"\n' +
      'keychain: "/Users/test/Library/Keychains/login.keychain-db"\nclass: "genp"\n' +
      '    "acct"<blob>="x.com"\n    "svce"<blob>="PullRead"\n'
    );
    expect(listSiteLogins()).toEqual(['medium.com', 'x.com']);
  });

  test('listSiteLogins ignores acct values from non-PullRead entries', () => {
    mockExecSync.mockReturnValue(
      'keychain: "/Users/test/Library/Keychains/login.keychain-db"\nclass: "genp"\n' +
      '    "acct"<blob>="should-skip.com"\n    "svce"<blob>="OtherApp"\n' +
      'keychain: "/Users/test/Library/Keychains/login.keychain-db"\nclass: "genp"\n' +
      '    "acct"<blob>="keep.com"\n    "svce"<blob>="PullRead"\n'
    );
    expect(listSiteLogins()).toEqual(['keep.com']);
  });
});
