import {
  consumeInviteRecord,
  generateInviteCodes,
  validateInviteRecord,
} from '@/lib/invite';
import { InviteCodeRecord } from '@/lib/types';

const activeRecord: InviteCodeRecord = {
  code: 'ABC12345',
  status: 'active',
  inviteExpiresAt: '2026-06-30T00:00:00.000Z',
  accountDurationDays: 30,
  accountExpiresAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBy: 'owner',
};

describe('invite helpers', () => {
  it('validates invite status and expiry', () => {
    expect(
      validateInviteRecord(undefined, '2026-06-10T00:00:00.000Z')
    ).toEqual({ ok: false, reason: 'not_found' });

    expect(
      validateInviteRecord(
        {
          ...activeRecord,
          status: 'used',
        },
        '2026-06-10T00:00:00.000Z'
      )
    ).toEqual({ ok: false, reason: 'used' });

    expect(
      validateInviteRecord(
        {
          ...activeRecord,
          inviteExpiresAt: '2026-06-05T00:00:00.000Z',
        },
        '2026-06-10T00:00:00.000Z'
      )
    ).toEqual({ ok: false, reason: 'expired' });

    expect(
      validateInviteRecord(activeRecord, '2026-06-10T00:00:00.000Z')
    ).toEqual({ ok: true });
  });

  it('rejects malformed now/invite expiry dates', () => {
    expect(validateInviteRecord(activeRecord, 'not-a-date')).toEqual({
      ok: false,
      reason: 'invalid_date',
    });

    expect(
      validateInviteRecord(
        {
          ...activeRecord,
          inviteExpiresAt: 'bad-expiry',
        },
        '2026-06-10T00:00:00.000Z'
      )
    ).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
  });

  it('consumes invite and writes usage metadata', () => {
    expect(
      consumeInviteRecord(activeRecord, 'alice', '2026-06-02T00:00:00.000Z')
    ).toMatchObject({
      code: 'ABC12345',
      status: 'used',
      usedBy: 'alice',
      usedAt: '2026-06-02T00:00:00.000Z',
    });
  });

  it('generates requested invite records', () => {
    const generated = generateInviteCodes({
      count: 3,
      inviteExpiresAt: '2026-06-30T00:00:00.000Z',
      accountExpiresAt: '2026-07-01T00:00:00.000Z',
      createdBy: 'owner',
      note: 'batch-A',
      now: '2026-06-01T00:00:00.000Z',
    });

    expect(generated).toHaveLength(3);
    expect(new Set(generated.map((item) => item.code)).size).toBe(3);
    expect(generated.every((item) => /^[A-Z2-9]{8}$/.test(item.code))).toBe(
      true
    );
    expect(generated.every((item) => item.status === 'active')).toBe(true);
    expect(generated.every((item) => item.createdBy === 'owner')).toBe(true);
    expect(
      generated.every((item) => item.createdAt === '2026-06-01T00:00:00.000Z')
    ).toBe(true);
  });
});
