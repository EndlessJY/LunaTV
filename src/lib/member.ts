const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type MembershipRole = 'user' | 'admin' | 'owner';
export type MembershipStatus = 'active' | 'expired' | 'guest';

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDays(days: number): number {
  if (!Number.isFinite(days)) {
    return 0;
  }
  return Math.max(0, Math.floor(days));
}

export function calculateGraceDeleteAt(
  expiresAt: string,
  gracePeriodDays: number
): string {
  const expiresDate = parseDate(expiresAt);
  if (!expiresDate) {
    return expiresAt;
  }
  return new Date(
    expiresDate.getTime() + normalizeDays(gracePeriodDays) * MILLISECONDS_PER_DAY
  ).toISOString();
}

export function isMembershipExpired(input: {
  role: MembershipRole;
  expiresAt?: string;
  now: string;
}): boolean {
  if (input.role === 'owner' || !input.expiresAt) {
    return false;
  }
  const now = parseDate(input.now);
  const expiresAt = parseDate(input.expiresAt);
  if (!now || !expiresAt) {
    return false;
  }
  return now > expiresAt;
}

export function getMembershipState(input: {
  role: MembershipRole;
  expiresAt?: string;
  gracePeriodDays: number;
  now: string;
}): {
  status: 'active' | 'expired';
  shouldDelete: boolean;
  graceDeleteAt?: string;
} {
  if (!isMembershipExpired(input)) {
    return { status: 'active', shouldDelete: false };
  }

  const graceDeleteAt = calculateGraceDeleteAt(
    input.expiresAt!,
    input.gracePeriodDays
  );
  const now = parseDate(input.now);
  const graceDate = parseDate(graceDeleteAt);

  return {
    status: 'expired',
    shouldDelete: !!(now && graceDate && now > graceDate),
    graceDeleteAt,
  };
}

export function renewMembership(input: {
  currentExpiresAt?: string;
  durationDays?: number;
  accountExpiresAt?: string; // 直接指定到期时间（UTC ISO），优先使用
  now: string;
}): string {
  if (input.accountExpiresAt) {
    const parsed = parseDate(input.accountExpiresAt);
    if (parsed) return input.accountExpiresAt;
  }
  const now = parseDate(input.now) || new Date();
  const currentExpiresAt = parseDate(input.currentExpiresAt);
  const baseTime =
    currentExpiresAt && currentExpiresAt > now ? currentExpiresAt : now;

  return new Date(
    baseTime.getTime() + normalizeDays(input.durationDays ?? 0) * MILLISECONDS_PER_DAY
  ).toISOString();
}

export function canPerformProtectedAction(input: {
  isGuest: boolean;
  membershipStatus: MembershipStatus;
}): { allowed: true } | { allowed: false; reason: 'guest' | 'expired' } {
  if (input.isGuest || input.membershipStatus === 'guest') {
    return { allowed: false, reason: 'guest' };
  }
  if (input.membershipStatus === 'expired') {
    return { allowed: false, reason: 'expired' };
  }
  return { allowed: true };
}

export function shouldPurgeExpiredUser(input: {
  role: MembershipRole;
  expiresAt?: string;
  gracePeriodDays: number;
  now: string;
}): boolean {
  return getMembershipState(input).shouldDelete;
}

export function getAdminCapabilities(input: { role: 'owner' | 'admin' }) {
  return {
    canManageInvites: input.role === 'owner',
    canManageMembershipSettings: input.role === 'owner',
  };
}
