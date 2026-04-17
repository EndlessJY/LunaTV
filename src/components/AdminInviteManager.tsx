'use client';

import { useEffect, useState } from 'react';

type InviteRecord = {
  code: string;
  status: 'active' | 'used' | 'disabled';
  inviteExpiresAt: string;
  accountDurationDays: number;
  createdAt: string;
  createdBy: string;
  note?: string;
  usedBy?: string;
  usedAt?: string;
};

const inputClassName =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

export function AdminInviteManager() {
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');
  const [accountDurationDays, setAccountDurationDays] = useState(30);
  const [note, setNote] = useState('');
  const [batchCount, setBatchCount] = useState(10);

  const loadInvites = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/invite', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '获取邀请码失败');
      }
      setInvites(data.invites || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '获取邀请码失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvites().catch(() => undefined);
  }, []);

  const submitManualInvite = async () => {
    const response = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: manualCode,
        inviteExpiresAt,
        accountDurationDays,
        note: note || undefined,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || '创建邀请码失败');
    }
    setManualCode('');
    setNote('');
    await loadInvites();
  };

  const submitBatchInvites = async () => {
    const response = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: batchCount,
        inviteExpiresAt,
        accountDurationDays,
        note: note || undefined,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || '批量生成邀请码失败');
    }
    setNote('');
    await loadInvites();
  };

  const disableInvite = async (code: string) => {
    const response = await fetch('/api/admin/invite', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, status: 'disabled' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || '禁用邀请码失败');
    }
    await loadInvites();
  };

  const deleteInvite = async (code: string) => {
    const response = await fetch(`/api/admin/invite?code=${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || '删除邀请码失败');
    }
    await loadInvites();
  };

  return (
    <div className='space-y-6'>
      <div className='grid gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900 md:grid-cols-2'>
        <div className='space-y-3'>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            手动添加邀请码
          </h4>
          <input
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder='邀请码'
            className={inputClassName}
          />
          <input
            type='datetime-local'
            value={inviteExpiresAt}
            onChange={(event) => setInviteExpiresAt(event.target.value)}
            className={inputClassName}
          />
          <input
            type='number'
            min={1}
            value={accountDurationDays}
            onChange={(event) =>
              setAccountDurationDays(Number(event.target.value || 1))
            }
            className={inputClassName}
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder='备注（选填）'
            className={inputClassName}
          />
          <button
            type='button'
            onClick={() => submitManualInvite().catch((submitError) => {
              setError(
                submitError instanceof Error
                  ? submitError.message
                  : '创建邀请码失败'
              );
            })}
            className='rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700'
          >
            添加邀请码
          </button>
        </div>

        <div className='space-y-3'>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            批量生成邀请码
          </h4>
          <input
            type='number'
            min={1}
            max={200}
            value={batchCount}
            onChange={(event) => setBatchCount(Number(event.target.value || 1))}
            className={inputClassName}
          />
          <input
            type='datetime-local'
            value={inviteExpiresAt}
            onChange={(event) => setInviteExpiresAt(event.target.value)}
            className={inputClassName}
          />
          <input
            type='number'
            min={1}
            value={accountDurationDays}
            onChange={(event) =>
              setAccountDurationDays(Number(event.target.value || 1))
            }
            className={inputClassName}
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder='批次备注（选填）'
            className={inputClassName}
          />
          <button
            type='button'
            onClick={() => submitBatchInvites().catch((submitError) => {
              setError(
                submitError instanceof Error
                  ? submitError.message
                  : '批量生成邀请码失败'
              );
            })}
            className='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'
          >
            批量生成
          </button>
        </div>
      </div>

      {error && (
        <div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'>
          {error}
        </div>
      )}

      <div className='rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
            <thead className='bg-gray-50 dark:bg-gray-900'>
              <tr>
                {['邀请码', '状态', '邀请码有效期', '账号时长', '使用情况', '操作'].map((label) => (
                  <th
                    key={label}
                    className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400'
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-950'>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className='px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400'
                  >
                    加载中...
                  </td>
                </tr>
              ) : invites.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className='px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400'
                  >
                    暂无邀请码
                  </td>
                </tr>
              ) : (
                invites.map((invite) => (
                  <tr key={invite.code}>
                    <td className='px-4 py-3 text-sm font-mono text-gray-800 dark:text-gray-100'>
                      {invite.code}
                    </td>
                    <td className='px-4 py-3 text-sm text-gray-700 dark:text-gray-300'>
                      {invite.status}
                    </td>
                    <td className='px-4 py-3 text-sm text-gray-700 dark:text-gray-300'>
                      {invite.inviteExpiresAt}
                    </td>
                    <td className='px-4 py-3 text-sm text-gray-700 dark:text-gray-300'>
                      {invite.accountDurationDays} 天
                    </td>
                    <td className='px-4 py-3 text-sm text-gray-700 dark:text-gray-300'>
                      {invite.usedBy
                        ? `${invite.usedBy} / ${invite.usedAt || ''}`
                        : '未使用'}
                    </td>
                    <td className='px-4 py-3 text-sm'>
                      <div className='flex gap-2'>
                        {invite.status === 'active' && (
                          <button
                            type='button'
                            onClick={() => disableInvite(invite.code).catch((submitError) => {
                              setError(
                                submitError instanceof Error
                                  ? submitError.message
                                  : '禁用邀请码失败'
                              );
                            })}
                            className='rounded-md bg-yellow-500 px-3 py-1 text-white hover:bg-yellow-600'
                          >
                            禁用
                          </button>
                        )}
                        <button
                          type='button'
                          onClick={() => deleteInvite(invite.code).catch((submitError) => {
                            setError(
                              submitError instanceof Error
                                ? submitError.message
                                : '删除邀请码失败'
                            );
                          })}
                          className='rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700'
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
