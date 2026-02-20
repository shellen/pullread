// ABOUTME: Tests for site login cookie storage via macOS Keychain
// ABOUTME: Uses mock security CLI to avoid actual Keychain access in tests

import { saveSiteLoginCookies, getSiteLoginCookies, removeSiteLogin, listSiteLogins } from './cookies';

// Mock execSync to avoid real Keychain access
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

import { execSync } from 'child_process';
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('Site login cookies', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  test('saveSiteLoginCookies writes JSON to Keychain', () => {
    mockExecSync.mockReturnValue(Buffer.from(''));
    const cookies = [
      { name: 'session', value: 'abc123', domain: '.medium.com', path: '/', expires: 0, secure: true, httpOnly: true }
    ];
    saveSiteLoginCookies('medium.com', cookies);
    expect(mockExecSync).toHaveBeenCalledTimes(1);
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('security add-generic-password'),
      expect.any(Object)
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('-s "PullRead"'),
      expect.any(Object)
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('-a "medium.com"'),
      expect.any(Object)
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('abc123'),
      expect.any(Object)
    );
  });

  test('getSiteLoginCookies reads and formats cookie header', () => {
    const cookies = [
      { name: 'session', value: 'abc', domain: '.medium.com', path: '/', expires: 0, secure: true, httpOnly: true },
      { name: 'uid', value: '42', domain: '.medium.com', path: '/', expires: 0, secure: false, httpOnly: false }
    ];
    mockExecSync.mockReturnValue(JSON.stringify(cookies));
    const result = getSiteLoginCookies('medium.com');
    expect(result).toBe('session=abc; uid=42');
  });

  test('getSiteLoginCookies returns null when no entry exists', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(getSiteLoginCookies('unknown.com')).toBeNull();
  });

  test('getSiteLoginCookies filters expired cookies', () => {
    const cookies = [
      { name: 'session', value: 'abc', domain: '.x.com', path: '/', expires: 0, secure: true, httpOnly: true },
      { name: 'old', value: 'expired', domain: '.x.com', path: '/', expires: 1000, secure: false, httpOnly: false }
    ];
    mockExecSync.mockReturnValue(JSON.stringify(cookies));
    const result = getSiteLoginCookies('x.com');
    expect(result).toBe('session=abc');
  });

  test('removeSiteLogin calls security delete', () => {
    mockExecSync.mockReturnValue(Buffer.from(''));
    expect(removeSiteLogin('medium.com')).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('delete-generic-password'),
      expect.any(Object)
    );
  });

  test('removeSiteLogin returns false when entry not found', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(removeSiteLogin('unknown.com')).toBe(false);
  });

  test('getSiteLoginCookies returns null when all cookies are expired', () => {
    const cookies = [
      { name: 'old1', value: 'expired', domain: '.x.com', path: '/', expires: 1000, secure: true, httpOnly: true },
      { name: 'old2', value: 'also-expired', domain: '.x.com', path: '/', expires: 2000, secure: false, httpOnly: false }
    ];
    mockExecSync.mockReturnValue(JSON.stringify(cookies));
    expect(getSiteLoginCookies('x.com')).toBeNull();
  });

  test('saveSiteLoginCookies rejects domains with shell metacharacters', () => {
    expect(() => saveSiteLoginCookies('evil.com$(whoami)', [])).toThrow('Invalid domain');
  });

  test('listSiteLogins parses security dump output', () => {
    mockExecSync.mockReturnValue(
      '    "svce"<blob>="PullRead"\n    "acct"<blob>="medium.com"\n' +
      '    "svce"<blob>="PullRead"\n    "acct"<blob>="x.com"\n'
    );
    expect(listSiteLogins()).toEqual(['medium.com', 'x.com']);
  });

  test('listSiteLogins ignores acct values from non-PullRead entries', () => {
    mockExecSync.mockReturnValue(
      '    "svce"<blob>="OtherApp"\n    "acct"<blob>="should-skip.com"\n' +
      'keychain: "/Users/test/Library/Keychains/login.keychain-db"\n' +
      '    "svce"<blob>="PullRead"\n    "acct"<blob>="keep.com"\n'
    );
    expect(listSiteLogins()).toEqual(['keep.com']);
  });
});
