import { NextRequest } from 'next/server';

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
