/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { serializeAuthSessionPayload } from '@/lib/auth-session';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { InviteCodeRecord } from '@/lib/types';
import {
  consumeInviteRecord,
  validateInviteRecord,
} from '@/lib/invite';
import { renewMembership } from '@/lib/member';

export const runtime = 'nodejs';

// 读取存储类型环境变量，默认 localstorage
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | undefined) || 'localstorage';

const AUTH_COOKIE_DAYS = 7;
const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{3,32}$/u;

// 生成签名
async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  // 导入密钥
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // 生成签名
  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  // 转换为十六进制字符串
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 生成认证Cookie（带签名）
async function generateAuthCookie(username: string): Promise<string> {
  // 使用process.env.PASSWORD作为签名密钥，而不是用户密码
  const signingKey = process.env.PASSWORD || '';
  const signature = await generateSignature(username, signingKey);
  return serializeAuthSessionPayload({
    role: 'user',
    username,
    signature,
    membershipStatus: 'active',
  });
}

function setAuthCookie(
  request: NextRequest,
  response: NextResponse,
  cookieValue: string
) {
  const expires = new Date();
  expires.setDate(expires.getDate() + AUTH_COOKIE_DAYS);
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isSecure =
    request.nextUrl.protocol === 'https:' || forwardedProto === 'https';

  response.cookies.set('auth', cookieValue, {
    path: '/',
    expires,
    sameSite: 'lax',
    httpOnly: false,
    secure: isSecure,
  });
}

function normalizeUsername(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const normalized = input.trim();
  if (!USERNAME_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export async function POST(req: NextRequest) {
  try {
    // localstorage 模式下不支持注册
    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json(
        { error: '当前模式不支持注册' },
        { status: 400 }
      );
    }

    const config = await getConfig();
    // 校验是否开放注册
    if (!config.UserConfig.AllowRegister) {
      return NextResponse.json({ error: '当前未开放注册' }, { status: 400 });
    }

    const { username, password, inviteCode } = await req.json();
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername) {
      return NextResponse.json(
        { error: '用户名需为 3-32 位，仅支持字母、数字、下划线和中划线' },
        { status: 400 }
      );
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }

    // 检查是否和管理员重复
    if (normalizedUsername === process.env.USERNAME) {
      return NextResponse.json({ error: '用户已存在' }, { status: 400 });
    }

    try {
      // 检查用户是否已存在
      const exist = await db.checkUserExist(normalizedUsername);
      if (exist) {
        return NextResponse.json({ error: '用户已存在' }, { status: 400 });
      }

      const now = new Date().toISOString();
      let expiresAt: string | undefined;
      let originalInviteRecord: InviteCodeRecord | null = null;
      let inviteLockCode: string | null = null;
      let inviteLockToken: string | null = null;
      let inviteConsumed = false;
      let userRegistered = false;

      if (config.UserConfig.RequireInviteCodeForRegister) {
        if (!inviteCode || typeof inviteCode !== 'string') {
          return NextResponse.json({ error: '邀请码不能为空' }, { status: 400 });
        }

        inviteLockCode = inviteCode.trim();
        inviteLockToken = `${normalizedUsername}:${crypto.randomUUID()}`;
        const lockAcquired = await db.acquireInviteCodeLock(
          inviteLockCode,
          inviteLockToken
        );
        if (!lockAcquired) {
          return NextResponse.json(
            { error: '邀请码正在使用，请稍后重试' },
            { status: 409 }
          );
        }
      }

      try {
        if (inviteLockCode) {
          const inviteRecord = await db.getInviteCode(inviteLockCode);
          const inviteValidation = validateInviteRecord(inviteRecord, now);
          if (!inviteValidation.ok) {
            const inviteErrors = {
              not_found: '邀请码不存在',
              used: '邀请码已被使用',
              expired: '邀请码已过期',
              invalid_date: '邀请码数据无效',
            } as const;

            return NextResponse.json(
              { error: inviteErrors[inviteValidation.reason] || '邀请码无效' },
              { status: 400 }
            );
          }

          originalInviteRecord = inviteRecord!;
          expiresAt = renewMembership({
            accountExpiresAt: originalInviteRecord.accountExpiresAt,
            durationDays: originalInviteRecord.accountDurationDays,
            now,
          });
        }

        await db.registerUser(normalizedUsername, password);
        userRegistered = true;

        if (originalInviteRecord) {
          await db.saveInviteCode(
            consumeInviteRecord(originalInviteRecord, normalizedUsername, now)
          );
          inviteConsumed = true;
        }

        // 添加到配置中并保存
        config.UserConfig.Users.push({
          username: normalizedUsername,
          role: 'user',
          expiresAt,
        });
        await db.saveAdminConfig(config);

        // 注册成功，设置认证cookie
        const response = NextResponse.json({
          ok: true,
          membershipStatus: 'active',
          membershipExpiresAt: expiresAt || null,
        });
        const cookieValue = await generateAuthCookie(normalizedUsername);
        setAuthCookie(req, response, cookieValue);

        return response;
      } catch (error) {
        config.UserConfig.Users = config.UserConfig.Users.filter(
          (entry) => entry.username !== normalizedUsername
        );

        if (userRegistered) {
          try {
            await db.deleteUser(normalizedUsername);
          } catch (rollbackError) {
            console.error('注册失败后回滚用户失败:', rollbackError);
          }
        }

        if (inviteConsumed && originalInviteRecord) {
          try {
            await db.saveInviteCode(originalInviteRecord);
          } catch (rollbackError) {
            console.error('注册失败后回滚邀请码失败:', rollbackError);
          }
        }

        throw error;
      } finally {
        if (inviteLockCode && inviteLockToken) {
          try {
            await db.releaseInviteCodeLock(inviteLockCode, inviteLockToken);
          } catch {
            // ignore lock release failure after register flow completes
          }
        }
      }
    } catch (err) {
      console.error('数据库注册失败', err);
      return NextResponse.json({ error: '数据库错误' }, { status: 500 });
    }
  } catch (error) {
    console.error('注册接口异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
