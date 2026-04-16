import {
  buildAuthSessionPayload,
  parseAuthSessionFromCookieHeader,
  parseAuthSessionFromCookieValue,
  serializeAuthSessionPayload,
} from '@/lib/auth-session';

describe('auth-session helpers', () => {
  it('builds payload with role and membership fields', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1760000000000);

    const payload = buildAuthSessionPayload({
      username: 'alice',
      signature: 'sig-1',
      role: 'admin',
      membershipStatus: 'active',
      membershipExpiresAt: '2026-12-31T00:00:00.000Z',
    });

    expect(payload).toEqual({
      username: 'alice',
      signature: 'sig-1',
      role: 'admin',
      membershipStatus: 'active',
      membershipExpiresAt: '2026-12-31T00:00:00.000Z',
      timestamp: 1760000000000,
    });

    nowSpy.mockRestore();
  });

  it('serializes and parses auth cookie payload', () => {
    const raw = serializeAuthSessionPayload({
      username: 'bob',
      signature: 'sig-2',
      role: 'user',
      membershipStatus: 'expired',
      membershipExpiresAt: '2026-06-01T00:00:00.000Z',
      timestamp: 1760000000123,
    });

    expect(parseAuthSessionFromCookieValue(raw)).toEqual({
      username: 'bob',
      signature: 'sig-2',
      role: 'user',
      membershipStatus: 'expired',
      membershipExpiresAt: '2026-06-01T00:00:00.000Z',
      timestamp: 1760000000123,
    });
  });

  it('parses double-encoded cookie values', () => {
    const onceEncoded = serializeAuthSessionPayload({
      username: 'carol',
      signature: 'sig-3',
      role: 'owner',
      membershipStatus: 'active',
    });
    const twiceEncoded = encodeURIComponent(onceEncoded);

    expect(parseAuthSessionFromCookieValue(twiceEncoded)).toMatchObject({
      username: 'carol',
      signature: 'sig-3',
      role: 'owner',
      membershipStatus: 'active',
    });
  });

  it('parses auth payload from cookie header string', () => {
    const authValue = serializeAuthSessionPayload({
      username: 'david',
      signature: 'sig-4',
      role: 'user',
      membershipStatus: 'active',
    });
    const cookieHeader = `foo=1; auth=${authValue}; bar=2`;

    expect(parseAuthSessionFromCookieHeader(cookieHeader)).toMatchObject({
      username: 'david',
      signature: 'sig-4',
      role: 'user',
      membershipStatus: 'active',
    });
  });

  it('returns null for malformed values', () => {
    expect(parseAuthSessionFromCookieValue('%E0%A4%A')).toBeNull();
    expect(parseAuthSessionFromCookieValue(encodeURIComponent('123'))).toBeNull();
    expect(parseAuthSessionFromCookieHeader('foo=1;bar=2')).toBeNull();
  });

  it('rejects structurally incomplete or tampered payloads', () => {
    const roleOnly = encodeURIComponent(JSON.stringify({ role: 'owner' }));
    const membershipOnly = encodeURIComponent(
      JSON.stringify({ membershipStatus: 'active' })
    );
    const usernameOnly = encodeURIComponent(JSON.stringify({ username: 'eve' }));
    const signatureOnly = encodeURIComponent(
      JSON.stringify({ signature: 'sig-only' })
    );
    const missingSignature = encodeURIComponent(
      JSON.stringify({ username: 'eve', role: 'admin' })
    );

    expect(parseAuthSessionFromCookieValue(roleOnly)).toBeNull();
    expect(parseAuthSessionFromCookieValue(membershipOnly)).toBeNull();
    expect(parseAuthSessionFromCookieValue(usernameOnly)).toBeNull();
    expect(parseAuthSessionFromCookieValue(signatureOnly)).toBeNull();
    expect(parseAuthSessionFromCookieValue(missingSignature)).toBeNull();
  });
});
