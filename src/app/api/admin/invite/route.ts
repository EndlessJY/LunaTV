import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateInviteCodes } from '@/lib/invite';
import { InviteCodeRecord } from '@/lib/types';

export const runtime = 'nodejs';

const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | undefined) || 'localstorage';

const MAX_BATCH_GENERATE_COUNT = 200;
const MAX_ACCOUNT_DURATION_DAYS = 36500;
const MAX_NOTE_LENGTH = 500;

function responseNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const code = input.trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(code)) {
    return null;
  }
  return code;
}

function normalizeInviteExpiresAt(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function normalizeDurationDays(input: unknown): number | null {
  if (
    typeof input !== 'number' ||
    !Number.isInteger(input) ||
    input < 1 ||
    input > MAX_ACCOUNT_DURATION_DAYS
  ) {
    return null;
  }
  return input;
}

function normalizeAccountExpiresAt(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function normalizeBatchCount(input: unknown): number | null {
  if (
    typeof input !== 'number' ||
    !Number.isInteger(input) ||
    input < 1 ||
    input > MAX_BATCH_GENERATE_COUNT
  ) {
    return null;
  }
  return input;
}

function normalizeNote(input: unknown): string | undefined | null {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (typeof input !== 'string') {
    return null;
  }
  const note = input.trim();
  if (!note) {
    return undefined;
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return null;
  }
  return note;
}

async function requireOwner(request: NextRequest) {
  if (STORAGE_TYPE === 'localstorage') {
    return {
      ok: false as const,
      response: responseNoStore(
        { error: '不支持本地存储进行管理员配置' },
        400
      ),
    };
  }

    const authInfo = await getVerifiedAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return {
      ok: false as const,
      response: responseNoStore({ error: 'Unauthorized' }, 401),
    };
  }

  if (authInfo.username !== process.env.USERNAME) {
    return {
      ok: false as const,
      response: responseNoStore({ error: '仅站长可操作邀请码' }, 401),
    };
  }

  return {
    ok: true as const,
    username: authInfo.username,
  };
}

function sortInviteRecords(records: InviteCodeRecord[]) {
  return [...records].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    const safeLeft = Number.isNaN(leftTime) ? 0 : leftTime;
    const safeRight = Number.isNaN(rightTime) ? 0 : rightTime;
    if (safeRight !== safeLeft) {
      return safeRight - safeLeft;
    }
    return left.code.localeCompare(right.code);
  });
}

// 兼容历史 disabled 状态：读取时统一映射为 active
function normalizeStatus(
  record: InviteCodeRecord
): InviteCodeRecord {
  if ((record.status as string) === 'disabled') {
    return { ...record, status: 'active' as const };
  }
  return record;
}

export async function GET(request: NextRequest) {
  try {
    const owner = await requireOwner(request);
    if (!owner.ok) {
      return owner.response;
    }

    const records = await db.getAllInviteCodes();
    const normalized = records.map(normalizeStatus);
    return responseNoStore({
      ok: true,
      invites: sortInviteRecords(normalized),
    });
  } catch (error) {
    return responseNoStore(
      {
        error: '获取邀请码列表失败',
      },
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = await requireOwner(request);
    if (!owner.ok) {
      return owner.response;
    }

    const body = (await request.json()) as Record<string, unknown>;

    const note = normalizeNote(body.note);
    if (note === null) {
      return responseNoStore({ error: '备注格式错误或长度超限' }, 400);
    }

    const inviteExpiresAt = normalizeInviteExpiresAt(body.inviteExpiresAt);
    if (!inviteExpiresAt) {
      return responseNoStore({ error: '邀请码有效期格式错误' }, 400);
    }

    // 优先使用 accountExpiresAt（精确时间），兼容旧字段 accountDurationDays
    const accountExpiresAt = normalizeAccountExpiresAt(body.accountExpiresAt);
    const accountDurationDays = normalizeDurationDays(body.accountDurationDays);

    if (!accountExpiresAt && !accountDurationDays) {
      return responseNoStore(
        { error: '请提供账号到期时间' },
        400
      );
    }

    const finalAccountExpiresAt =
      accountExpiresAt ||
      (() => {
        // 旧字段兼容：从 accountDurationDays 反推 accountExpiresAt
        const now = new Date();
        now.setUTCDate(now.getUTCDate() + (accountDurationDays ?? 0));
        return now.toISOString();
      })();

    if (body.count !== undefined) {
      const count = normalizeBatchCount(body.count);
      if (!count) {
        return responseNoStore(
          {
            error: `批量生成数量需为 1-${MAX_BATCH_GENERATE_COUNT} 的整数`,
          },
          400
        );
      }

      const now = new Date().toISOString();
      const generated: InviteCodeRecord[] = [];
      const lockedRecords: Array<{ record: InviteCodeRecord; token: string }> = [];
      let attempts = 0;
      const maxAttempts = count * 20;

      try {
        while (generated.length < count && attempts < maxAttempts) {
          const batch = generateInviteCodes({
            count: 1,
            inviteExpiresAt,
            accountExpiresAt: finalAccountExpiresAt,
            createdBy: owner.username,
            note,
            now,
          });

          const record = batch[0];
          if (!record) {
            attempts += 1;
            continue;
          }

          const token = `${owner.username}:${crypto.randomUUID()}`;
          const locked = await db.acquireInviteCodeLock(record.code, token);
          if (!locked) {
            attempts += 1;
            continue;
          }

          const exists = await db.getInviteCode(record.code);
          if (exists) {
            try {
              await db.releaseInviteCodeLock(record.code, token);
            } catch {
              // ignore lock release failure for discarded generated code
            }
            attempts += 1;
            continue;
          }

          generated.push(record);
          lockedRecords.push({ record, token });
          attempts += 1;
        }

        if (generated.length !== count) {
          return responseNoStore({ error: '批量生成失败，请重试' }, 500);
        }

        const savedCodes: string[] = [];
        try {
          for (const { record } of lockedRecords) {
            await db.saveInviteCode(record);
            savedCodes.push(record.code);
          }
        } catch (error) {
          await Promise.all(
            savedCodes.map(async (code) => {
              try {
                await db.deleteInviteCode(code);
              } catch {
                // ignore rollback failure after partial batch persistence
              }
            })
          );
          throw error;
        }

        return responseNoStore(
          {
            ok: true,
            invites: generated,
          },
          201
        );
      } finally {
        await Promise.all(
          lockedRecords.map(async ({ record, token }) => {
            try {
              await db.releaseInviteCodeLock(record.code, token);
            } catch {
              // ignore lock release failure after batch create flow
            }
          })
        );
      }
    }

    const code = normalizeInviteCode(body.code);
    if (!code) {
      return responseNoStore({ error: '邀请码格式错误' }, 400);
    }

    const record: InviteCodeRecord = {
      code,
      status: 'active',
      inviteExpiresAt,
      accountExpiresAt: finalAccountExpiresAt,
      createdAt: new Date().toISOString(),
      createdBy: owner.username,
      note,
    };

    const token = `${owner.username}:${crypto.randomUUID()}`;
    const locked = await db.acquireInviteCodeLock(code, token);
    if (!locked) {
      return responseNoStore({ error: '邀请码正在处理中，请稍后重试' }, 409);
    }

    try {
      if (await db.getInviteCode(code)) {
        return responseNoStore({ error: '邀请码已存在' }, 409);
      }

      await db.saveInviteCode(record);
    } finally {
      try {
        await db.releaseInviteCodeLock(code, token);
      } catch {
        // ignore lock release failure after invite creation is already persisted
      }
    }

    return responseNoStore(
      {
        ok: true,
        invite: record,
      },
      201
    );
  } catch (error) {
    return responseNoStore(
      {
        error: '邀请码管理操作失败',
      },
      500
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const owner = await requireOwner(request);
    if (!owner.ok) {
      return owner.response;
    }

    let codes: string[] = [];

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (body?.codes && Array.isArray(body.codes)) {
      codes = (body.codes as unknown[])
        .map((c) => normalizeInviteCode(c))
        .filter((c): c is string => c !== null);
    } else {
      const rawCode = request.nextUrl.searchParams.get('code');
      if (rawCode) {
        const code = normalizeInviteCode(rawCode);
        if (code) codes = [code];
      }
    }

    if (codes.length === 0) {
      return responseNoStore({ error: '请提供要删除的邀请码' }, 400);
    }

    const results: { code: string; ok: boolean; error?: string }[] = [];

    for (const code of codes) {
      const token = `delete:${crypto.randomUUID()}`;
      const locked = await db.acquireInviteCodeLock(code, token);
      if (!locked) {
        results.push({ code, ok: false, error: '邀请码正在处理中，请稍后重试' });
        continue;
      }

      try {
        const exists = await db.getInviteCode(code);
        if (!exists) {
          results.push({ code, ok: false, error: '邀请码不存在' });
          continue;
        }

        await db.deleteInviteCode(code);
        results.push({ code, ok: true });
      } finally {
        try {
          await db.releaseInviteCodeLock(code, token);
        } catch {
          // ignore lock release failure
        }
      }
    }

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      return responseNoStore(
        { ok: false, error: '部分邀请码删除失败', results },
        207
      );
    }

    return responseNoStore({ ok: true, results });
  } catch (error) {
    return responseNoStore(
      {
        error: '删除邀请码失败',
      },
      500
    );
  }
}
