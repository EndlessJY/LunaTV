import { randomBytes } from 'crypto';

import { InviteCodeRecord } from './types';

type InviteValidateResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not_found' | 'used' | 'expired' | 'invalid_date';
    };

function parseValidDate(input: string): Date | null {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function randomInviteCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const output: string[] = [];
  const maxUnbiasedByte =
    Math.floor(256 / alphabet.length) * alphabet.length - 1;

  while (output.length < length) {
    const entropy = randomBytes(length);
    for (let index = 0; index < entropy.length; index += 1) {
      const byte = entropy[index];
      if (byte > maxUnbiasedByte) {
        continue;
      }
      output.push(alphabet[byte % alphabet.length]);
      if (output.length === length) {
        break;
      }
    }
  }

  return output.join('');
}

export function validateInviteRecord(
  record: InviteCodeRecord | null | undefined,
  now: string
): InviteValidateResult {
  if (!record) {
    return { ok: false, reason: 'not_found' };
  }
  if (record.status === 'used') {
    return { ok: false, reason: 'used' };
  }
  const nowDate = parseValidDate(now);
  const inviteExpiresAtDate = parseValidDate(record.inviteExpiresAt);
  if (!nowDate || !inviteExpiresAtDate) {
    return { ok: false, reason: 'invalid_date' };
  }
  if (nowDate > inviteExpiresAtDate) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}

export function consumeInviteRecord(
  record: InviteCodeRecord,
  usedBy: string,
  usedAt: string
): InviteCodeRecord {
  return {
    ...record,
    status: 'used',
    usedBy,
    usedAt,
  };
}

export function generateInviteCodes(input: {
  count: number;
  inviteExpiresAt: string;
  accountExpiresAt: string;
  createdBy: string;
  note?: string;
  now?: string;
}): InviteCodeRecord[] {
  const targetCount = Math.max(0, Math.floor(input.count));
  const createdAt = input.now || new Date().toISOString();
  const generatedCodes = new Set<string>();
  const records: InviteCodeRecord[] = [];

  while (records.length < targetCount) {
    const code = randomInviteCode();
    if (generatedCodes.has(code)) {
      continue;
    }
    generatedCodes.add(code);
    records.push({
      code,
      status: 'active',
      inviteExpiresAt: input.inviteExpiresAt,
      accountExpiresAt: input.accountExpiresAt,
      createdAt,
      createdBy: input.createdBy,
      note: input.note,
    });
  }

  return records;
}
