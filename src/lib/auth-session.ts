export type AuthSessionRole = 'owner' | 'admin' | 'user';
export type AuthSessionMembershipStatus = 'active' | 'expired' | 'none';

export interface AuthSessionPayload {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
  role?: AuthSessionRole;
  membershipStatus?: AuthSessionMembershipStatus;
  membershipExpiresAt?: string;
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeAuthSessionPayload(
  input: Record<string, unknown>
): AuthSessionPayload {
  const payload: AuthSessionPayload = {};

  if (typeof input.password === 'string') payload.password = input.password;
  if (typeof input.username === 'string') payload.username = input.username;
  if (typeof input.signature === 'string') payload.signature = input.signature;
  if (typeof input.role === 'string') {
    const role = input.role as AuthSessionRole;
    if (role === 'owner' || role === 'admin' || role === 'user') {
      payload.role = role;
    }
  }
  if (typeof input.membershipStatus === 'string') {
    const status = input.membershipStatus as AuthSessionMembershipStatus;
    if (status === 'active' || status === 'expired' || status === 'none') {
      payload.membershipStatus = status;
    }
  }
  if (typeof input.membershipExpiresAt === 'string') {
    payload.membershipExpiresAt = input.membershipExpiresAt;
  }
  if (typeof input.timestamp === 'number' && Number.isFinite(input.timestamp)) {
    payload.timestamp = input.timestamp;
  }

  return payload;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStructurallyValidAuthSession(payload: AuthSessionPayload): boolean {
  const hasPasswordAuth = isNonEmptyString(payload.password);
  const hasSignedUserAuth =
    isNonEmptyString(payload.username) && isNonEmptyString(payload.signature);
  return hasPasswordAuth || hasSignedUserAuth;
}

export function buildAuthSessionPayload(
  input: AuthSessionPayload
): AuthSessionPayload {
  const normalized = normalizeAuthSessionPayload(
    input as Record<string, unknown>
  );

  if (
    normalized.timestamp === undefined &&
    (normalized.username || normalized.signature || normalized.password)
  ) {
    normalized.timestamp = Date.now();
  }

  return normalized;
}

export function serializeAuthSessionPayload(input: AuthSessionPayload): string {
  const payload = buildAuthSessionPayload(input);
  return encodeURIComponent(JSON.stringify(payload));
}

export function parseAuthSessionFromCookieValue(
  cookieValue?: string | null
): AuthSessionPayload | null {
  if (!cookieValue) {
    return null;
  }

  const onceDecoded = safeDecodeURIComponent(cookieValue);
  if (!onceDecoded) {
    return null;
  }

  const parseCandidates = [onceDecoded];
  if (onceDecoded.includes('%')) {
    const twiceDecoded = safeDecodeURIComponent(onceDecoded);
    if (twiceDecoded) {
      parseCandidates.unshift(twiceDecoded);
    }
  }

  for (const raw of parseCandidates) {
    const parsed = tryParseJsonObject(raw);
    if (!parsed) {
      continue;
    }
    const normalized = normalizeAuthSessionPayload(parsed);
    if (isStructurallyValidAuthSession(normalized)) {
      return normalized;
    }
  }

  return null;
}

function getCookieValue(cookieHeader: string, cookieName: string): string | null {
  const cookieMap = cookieHeader.split(';').reduce((acc, part) => {
    const trimmed = part.trim();
    const firstEqualIndex = trimmed.indexOf('=');
    if (firstEqualIndex > 0) {
      const key = trimmed.substring(0, firstEqualIndex);
      const value = trimmed.substring(firstEqualIndex + 1);
      if (key) {
        acc[key] = value;
      }
    }
    return acc;
  }, {} as Record<string, string>);

  return cookieMap[cookieName] || null;
}

export function parseAuthSessionFromCookieHeader(
  cookieHeader?: string | null
): AuthSessionPayload | null {
  if (!cookieHeader) {
    return null;
  }
  const authCookieValue = getCookieValue(cookieHeader, 'auth');
  return parseAuthSessionFromCookieValue(authCookieValue);
}
