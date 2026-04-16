import {
  calculateGraceDeleteAt,
  canPerformProtectedAction,
  getAdminCapabilities,
  getMembershipState,
  isMembershipExpired,
  renewMembership,
  shouldPurgeExpiredUser,
} from '@/lib/member';

describe('member helpers', () => {
  it('calculates grace delete time from expiry date', () => {
    expect(
      calculateGraceDeleteAt('2026-06-01T00:00:00.000Z', 10)
    ).toBe('2026-06-11T00:00:00.000Z');
  });

  it('treats owner and permanent accounts as non-expired', () => {
    expect(
      isMembershipExpired({
        role: 'owner',
        expiresAt: '2026-01-01T00:00:00.000Z',
        now: '2026-06-01T00:00:00.000Z',
      })
    ).toBe(false);

    expect(
      isMembershipExpired({
        role: 'user',
        now: '2026-06-01T00:00:00.000Z',
      })
    ).toBe(false);
  });

  it('marks user as expired and checks purge window', () => {
    expect(
      getMembershipState({
        role: 'user',
        expiresAt: '2026-06-01T00:00:00.000Z',
        gracePeriodDays: 10,
        now: '2026-06-05T00:00:00.000Z',
      })
    ).toMatchObject({
      status: 'expired',
      shouldDelete: false,
      graceDeleteAt: '2026-06-11T00:00:00.000Z',
    });

    expect(
      getMembershipState({
        role: 'user',
        expiresAt: '2026-06-01T00:00:00.000Z',
        gracePeriodDays: 10,
        now: '2026-06-12T00:00:00.000Z',
      })
    ).toMatchObject({
      status: 'expired',
      shouldDelete: true,
    });
  });

  it('renews from current expiry when still active otherwise from now', () => {
    expect(
      renewMembership({
        currentExpiresAt: '2026-06-20T00:00:00.000Z',
        durationDays: 30,
        now: '2026-06-10T00:00:00.000Z',
      })
    ).toBe('2026-07-20T00:00:00.000Z');

    expect(
      renewMembership({
        currentExpiresAt: '2026-06-01T00:00:00.000Z',
        durationDays: 30,
        now: '2026-06-10T00:00:00.000Z',
      })
    ).toBe('2026-07-10T00:00:00.000Z');
  });

  it('gates protected actions for guests and expired memberships', () => {
    expect(
      canPerformProtectedAction({
        isGuest: true,
        membershipStatus: 'active',
      })
    ).toEqual({ allowed: false, reason: 'guest' });

    expect(
      canPerformProtectedAction({
        isGuest: false,
        membershipStatus: 'expired',
      })
    ).toEqual({ allowed: false, reason: 'expired' });

    expect(
      canPerformProtectedAction({
        isGuest: false,
        membershipStatus: 'active',
      })
    ).toEqual({ allowed: true });
  });

  it('derives purge and admin capability decisions', () => {
    expect(
      shouldPurgeExpiredUser({
        role: 'user',
        expiresAt: '2026-06-01T00:00:00.000Z',
        gracePeriodDays: 5,
        now: '2026-06-10T00:00:00.000Z',
      })
    ).toBe(true);

    expect(getAdminCapabilities({ role: 'owner' })).toEqual({
      canManageInvites: true,
      canManageMembershipSettings: true,
    });
    expect(getAdminCapabilities({ role: 'admin' })).toEqual({
      canManageInvites: false,
      canManageMembershipSettings: false,
    });
  });
});
