import { NextRequest } from 'next/server';

import { getConfig } from './config';
import { db } from './db';
import { getMembershipState } from './member';

import {
  AuthSessionPayload,
  parseAuthSessionFromCookieHeader,
  parseAuthSessionFromCookieValue,
} from './auth-session';

type AuthInfo = Pick<
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

async function verifySignature(
  data: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBuffer = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      messageData
    );
  } catch {
    return false;
  }
}

export async function getVerifiedAuthInfoFromCookie(
  request: NextRequest
): Promise<AuthInfo | null> {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo) {
    return null;
  }

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return authInfo.password === process.env.PASSWORD ? authInfo : null;
  }

  if (!authInfo.username || !authInfo.signature) {
    return null;
  }

  const verified = await verifySignature(
    authInfo.username,
    authInfo.signature,
    process.env.PASSWORD || ''
  );

  return verified ? authInfo : null;
}

export async function getAuthorizedMember(
  request: NextRequest,
  options?: {
    requireActive?: boolean;
  }
): Promise<
  | {
      ok: true;
      username: string;
      role: 'owner' | 'admin' | 'user';
      membershipStatus: 'active' | 'expired';
      membershipExpiresAt?: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  if (storageType === 'localstorage') {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.password || authInfo.password !== process.env.PASSWORD) {
      return { ok: false, status: 401, error: 'Unauthorized' };
    }

    return {
      ok: true,
      username: process.env.USERNAME || 'localstorage-user',
      role: 'user',
      membershipStatus: 'active',
    };
  }

  const authInfo = await getVerifiedAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  if (authInfo.username === process.env.USERNAME) {
    return {
      ok: true,
      username: authInfo.username,
      role: 'owner',
      membershipStatus: 'active',
    };
  }

  const config = await getConfig();
  const user = config.UserConfig.Users.find(
    (entry) => entry.username === authInfo.username
  );

  if (!user) {
    return { ok: false, status: 401, error: '用户不存在' };
  }

  const membershipState = getMembershipState({
    role: user.role,
    expiresAt: user.expiresAt,
    gracePeriodDays: config.UserConfig.ExpiredGracePeriodDays ?? 10,
    now: new Date().toISOString(),
  });

  if (membershipState.shouldDelete) {
    const previousUsers = config.UserConfig.Users;
    config.UserConfig.Users = config.UserConfig.Users.filter(
      (entry) => entry.username !== user.username
    );
    await db.saveAdminConfig(config);
    try {
      await db.deleteUser(user.username);
    } catch (error) {
      config.UserConfig.Users = previousUsers;
      await db.saveAdminConfig(config);
      throw error;
    }
    return { ok: false, status: 401, error: '账号已过期且已被清理' };
  }

  // 过期但还在宽限期内 → 立即禁用账号
  if (membershipState.status === 'expired' && !user.banned) {
    user.banned = true;
    user.banReason = 'expired';
    await db.saveAdminConfig(config);
  }

  if (membershipState.status === 'active' && user.banReason === 'expired') {
    user.banned = false;
    delete user.banReason;
    await db.saveAdminConfig(config);
  }

  if (membershipState.status === 'active' && user.banned) {
    return { ok: false, status: 401, error: '用户已被封禁' };
  }

  if (options?.requireActive && membershipState.status !== 'active') {
    return { ok: false, status: 401, error: '账号已过期' };
  }

  return {
    ok: true,
    username: user.username,
    role: user.role,
    membershipStatus: membershipState.status,
    membershipExpiresAt: user.expiresAt,
  };
}
