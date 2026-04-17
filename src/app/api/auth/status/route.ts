import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie, getVerifiedAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { getMembershipState } from '@/lib/member';

export const runtime = 'nodejs';

function responseNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function clearAuthCookie(request: NextRequest, response: NextResponse) {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isSecure =
    request.nextUrl.protocol === 'https:' || forwardedProto === 'https';

  response.cookies.set('auth', '', {
    path: '/',
    expires: new Date(0),
    sameSite: 'lax',
    httpOnly: false,
    secure: isSecure,
  });
}

export async function GET(request: NextRequest) {
  try {
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    if (storageType === 'localstorage') {
      const authInfo = getAuthInfoFromCookie(request);
      const authenticated =
        Boolean(authInfo?.password) && authInfo?.password === process.env.PASSWORD;
      return responseNoStore({
        authenticated,
        role: authenticated ? 'user' : null,
        membershipStatus: authenticated ? 'active' : null,
        membershipExpiresAt: null,
        username: authenticated ? process.env.USERNAME || null : null,
      });
    }

    const authInfo = await getVerifiedAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return responseNoStore({
        authenticated: false,
        role: null,
        membershipStatus: null,
        membershipExpiresAt: null,
        username: null,
      });
    }

    if (authInfo.username === process.env.USERNAME) {
      return responseNoStore({
        authenticated: true,
        role: 'owner',
        membershipStatus: 'active',
        membershipExpiresAt: null,
        username: authInfo.username,
      });
    }

    const config = await getConfig();
    const user = config.UserConfig.Users.find(
      (entry) => entry.username === authInfo.username
    );

    if (!user || user.banned) {
      return responseNoStore({
        authenticated: false,
        role: null,
        membershipStatus: null,
        membershipExpiresAt: null,
        username: null,
      });
    }

    const membershipState = getMembershipState({
      role: user.role,
      expiresAt: user.expiresAt,
      gracePeriodDays: config.UserConfig.ExpiredGracePeriodDays || 10,
      now: new Date().toISOString(),
    });

    if (membershipState.shouldDelete) {
      const nextUsers = config.UserConfig.Users.filter(
        (entry) => entry.username !== user.username
      );
      const previousUsers = config.UserConfig.Users;
      config.UserConfig.Users = nextUsers;
      await db.saveAdminConfig(config);

      try {
        await db.deleteUser(user.username);
      } catch (error) {
        config.UserConfig.Users = previousUsers;
        await db.saveAdminConfig(config);
        throw error;
      }

      const response = responseNoStore({
        authenticated: false,
        role: null,
        membershipStatus: 'removed',
        membershipExpiresAt: null,
        username: null,
      });
      clearAuthCookie(request, response);

      return response;
    }

    return responseNoStore({
      authenticated: true,
      role: user.role,
      membershipStatus: membershipState.status,
      membershipExpiresAt: user.expiresAt || null,
      username: user.username,
    });
  } catch (error) {
    return responseNoStore(
      {
        error: '获取认证状态失败',
      },
      500
    );
  }
}
