import type { NextRequest } from 'next/server';

import {
  AuthSessionPayload,
  parseAuthSessionFromCookieHeader,
  parseAuthSessionFromCookieValue,
} from './auth-session';

export type AuthInfo = Pick<
  AuthSessionPayload,
  | 'password'
  | 'username'
  | 'signature'
  | 'timestamp'
  | 'role'
  | 'membershipStatus'
  | 'membershipExpiresAt'
>;

// 从cookie获取认证信息 (服务端使用)
export function getAuthInfoFromCookie(request: NextRequest): AuthInfo | null {
  const authCookie = request.cookies.get('auth');

  if (!authCookie) {
    return null;
  }

  return parseAuthSessionFromCookieValue(authCookie.value);
}

// 从cookie获取认证信息 (客户端使用)
export function getAuthInfoFromBrowserCookie(): AuthInfo | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return parseAuthSessionFromCookieHeader(document.cookie);
}
