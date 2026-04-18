'use client';

import { Copy, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const useAlertModal = () => {
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning';
    title: string;
    message?: string;
    timer?: number;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
  });

  const showAlert = (config: Omit<typeof alertModal, 'isOpen'>) => {
    setAlertModal({ ...config, isOpen: true });
  };

  const hideAlert = () => {
    setAlertModal((prev) => ({ ...prev, isOpen: false }));
  };

  return { alertModal, showAlert, hideAlert };
};

type InviteRecord = {
  code: string;
  status: 'active' | 'used';
  inviteExpiresAt: string;
  accountDurationDays?: number; // 旧字段，兼容
  accountExpiresAt?: string;  // 账号到期时间（UTC ISO）
  createdAt: string;
  createdBy: string;
  note?: string;
  usedBy?: string;
  usedAt?: string;
};

// 北京时间格式化：YYYY-MM-DD HH:mm:ss
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => n.toString().padStart(2, '0');
  return (
    `${beijing.getUTCFullYear()}-${p(beijing.getUTCMonth() + 1)}-${p(beijing.getUTCDate())}` +
    ` ${p(beijing.getUTCHours())}:${p(beijing.getUTCMinutes())}:${p(beijing.getUTCSeconds())}`
  );
}

// 剩余天数
function getRemainingDays(isoString: string): number {
  const date = new Date(isoString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// 获取默认的账号到期时间（北京时间，当前 + 30 天零点）
function getDefaultAccountExpiresAt(): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString();
}

const inputClassName =
  'flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500';

const labelClassName = 'text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

export function AdminInviteManager() {
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteExpiresDays, setInviteExpiresDays] = useState(30);
  const [accountExpiresAt, setAccountExpiresAt] = useState(getDefaultAccountExpiresAt());
  const [note, setNote] = useState('');
  const [batchCount, setBatchCount] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { alertModal, showAlert, hideAlert } = useAlertModal();

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    showAlert({ type, title: type === 'success' ? '成功' : '错误', message, timer: 2000 });
  };

  const loadInvites = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/invite', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || '获取邀请码失败', 'error');
        return;
      }
      setInvites(data.invites || []);
    } catch (loadError) {
      showToast(
        loadError instanceof Error ? loadError.message : '获取邀请码失败',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvites().catch(() => undefined);
  }, []);

  const createInviteExpiresAt = () => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + inviteExpiresDays);
    return date.toISOString();
  };

  const submitBatchInvites = async () => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: batchCount,
          inviteExpiresAt: createInviteExpiresAt(),
          accountExpiresAt,
          note: note || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast(data.error || '批量生成邀请码失败', 'error');
        return;
      }
      showToast(`成功生成 ${batchCount} 个邀请码`);
      setNote('');
      await loadInvites();
    } finally {
      setSubmitting(false);
    }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const response = await fetch('/api/admin/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: Array.from(selected) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast(data.error || '批量删除邀请码失败', 'error');
        return;
      }
      showToast(`成功删除 ${selected.size} 个邀请码`);
      setSelected(new Set());
      await loadInvites();
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => showToast('邀请码已复制')).catch(() => undefined);
  };

  return (
    <div className='space-y-5'>
      {/* 生成区域 */}
      <div className='rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-5 dark:border-gray-700 dark:from-gray-900 dark:to-gray-900/80'>
        <div className='mb-4 flex items-center gap-2'>
          <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-green-500'>
            <Plus className='h-4 w-4 text-white' />
          </div>
          <h3 className='text-sm font-semibold text-gray-900 dark:text-gray-100'>
            生成邀请码
          </h3>
        </div>

        <div className='flex flex-wrap items-end gap-3'>
          <div className='flex flex-col'>
            <label className={labelClassName}>生成数量</label>
            <input
              type='number'
              min={1}
              max={200}
              value={batchCount}
              onChange={(e) => setBatchCount(Number(e.target.value || 1))}
              className={`${inputClassName} w-24`}
            />
          </div>
          <div className='flex flex-col'>
            <label className={labelClassName}>有效期（天）</label>
            <input
              type='number'
              min={1}
              value={inviteExpiresDays}
              onChange={(e) => setInviteExpiresDays(Number(e.target.value || 1))}
              className={`${inputClassName} w-24`}
            />
          </div>
          <div className='flex flex-col'>
            <label className={labelClassName}>账号到期时间</label>
            <input
              type='datetime-local'
              value={(() => {
                const date = new Date(accountExpiresAt);
                const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
                const p = (n: number) => n.toString().padStart(2, '0');
                return `${beijing.getUTCFullYear()}-${p(beijing.getUTCMonth() + 1)}-${p(beijing.getUTCDate())}T${p(beijing.getUTCHours())}:${p(beijing.getUTCMinutes())}`;
              })()}
              onChange={(e) => {
                const date = new Date(e.target.value);
                setAccountExpiresAt(date.toISOString());
              }}
              className={`${inputClassName} w-52`}
            />
          </div>
          <div className='flex flex-1 flex-col'>
            <label className={labelClassName}>备注（可选）</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder='如：内测用户'
              className={inputClassName}
            />
          </div>
          <button
            type='button'
            onClick={submitBatchInvites}
            disabled={submitting}
            className='flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-60'
          >
            {submitting ? (
              <RefreshCw className='h-4 w-4 animate-spin' />
            ) : (
              <Plus className='h-4 w-4' />
            )}
            生成
          </button>
        </div>
      </div>

      {/* Toast */}
      {alertModal.isOpen && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-xl transition-all ${
            alertModal.type === 'success'
              ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
              : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
          }`}
          onClick={hideAlert}
        >
          <span
            className={`text-sm font-semibold ${
              alertModal.type === 'success'
                ? 'text-green-700 dark:text-green-300'
                : 'text-red-700 dark:text-red-300'
            }`}
          >
            {alertModal.message}
          </span>
        </div>
      )}

      {/* 列表区域 */}
      <div className='rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden'>
        {/* 表头工具栏 */}
        <div className='flex items-center justify-between bg-gray-50 px-4 py-3 dark:bg-gray-900/50 gap-3'>
          <span className='text-sm font-medium text-gray-600 dark:text-gray-300'>
            {loading ? '加载中...' : `共 ${invites.length} 个邀请码`}
          </span>
          {selected.size > 0 && (
            <div className='flex items-center gap-2 flex-shrink-0'>
              <span className='text-xs text-gray-500 dark:text-gray-400'>
                已选择 {selected.size} 项
              </span>
              <button
                type='button'
                onClick={deleteSelected}
                disabled={deleting}
                className='flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-60 whitespace-nowrap'
              >
                <Trash2 className='h-3.5 w-3.5' />
                {deleting ? '删除中...' : `删除${selected.size > 1 ? '所选' : ''}`}
              </button>
            </div>
          )}
        </div>

        {/* 表格列表 */}
        <div className='overflow-x-auto'>
          {loading ? (
            <div className='flex flex-col items-center justify-center py-12 text-gray-400'>
              <RefreshCw className='mb-2 h-5 w-5 animate-spin text-gray-300 dark:text-gray-600' />
              <span className='text-sm'>加载中...</span>
            </div>
          ) : invites.length === 0 ? (
            <div className='py-12 text-center text-sm text-gray-400'>
              暂无邀请码
            </div>
          ) : (
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-200 dark:border-gray-700'>
                  <th className='whitespace-nowrap px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400'>
                    <label className='flex items-center gap-2 cursor-pointer'>
                      <input
                        type='checkbox'
                        checked={selected.size === invites.length && invites.length > 0}
                        onChange={() => {
                          if (selected.size === invites.length) {
                            setSelected(new Set());
                          } else {
                            setSelected(new Set(invites.map(i => i.code)));
                          }
                        }}
                        className='h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500'
                      />
                    </label>
                  </th>
                  <th className='whitespace-nowrap px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400'>邀请码</th>
                  <th className='whitespace-nowrap px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400'>状态</th>
                  <th className='whitespace-nowrap px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400'>有效期</th>
                  <th className='whitespace-nowrap px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400'>使用情况</th>
                  <th className='whitespace-nowrap px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400'>操作</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => {
                  const isUsed = invite.status === 'used';
                  const remainingDays = getRemainingDays(invite.inviteExpiresAt);
                  const isSelected = selected.has(invite.code);
                  const isExpired = isUsed || remainingDays <= 0;

                  return (
                    <tr
                      key={invite.code}
                      className={`border-b border-gray-100 dark:border-gray-800 transition-colors ${
                        isSelected
                          ? 'bg-green-50 dark:bg-green-950/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-900/50'
                      }`}
                    >
                      <td className='px-4 py-3'>
                        <input
                          type='checkbox'
                          checked={isSelected}
                          onChange={() => toggleSelect(invite.code)}
                          className='h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500'
                        />
                      </td>
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-2'>
                          <span className='font-mono font-semibold text-gray-800 dark:text-gray-100'>
                            {invite.code}
                          </span>
                          <button
                            type='button'
                            onClick={() => copyCode(invite.code)}
                            title='复制邀请码'
                            className='rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300'
                          >
                            <Copy className='h-3.5 w-3.5' />
                          </button>
                        </div>
                      </td>
                      <td className='px-4 py-3'>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isUsed
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          }`}
                        >
                          {isUsed ? '已注册' : '未使用'}
                        </span>
                      </td>
                      <td className='px-4 py-3 whitespace-nowrap'>
                        <span className={isExpired ? 'text-gray-400' : 'font-medium text-orange-500 dark:text-orange-400'}>
                          {isExpired ? '已过期' : `${remainingDays} 天`}
                        </span>
                      </td>
                      <td className='px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400'>
                        {invite.usedBy ? (
                          <span className='text-blue-600 dark:text-blue-400'>
                            {invite.usedBy}/{invite.usedAt ? formatDateTime(invite.usedAt) : '—'}
                          </span>
                        ) : (
                          <span className='text-gray-400'>—</span>
                        )}
                      </td>
                      <td className='px-4 py-3 text-right'>
                        <button
                          type='button'
                          onClick={async () => {
                            try {
                              const response = await fetch(
                                `/api/admin/invite?code=${encodeURIComponent(invite.code)}`,
                                { method: 'DELETE' }
                              );
                              const data = await response.json().catch(() => ({}));
                              if (!response.ok) {
                                showToast(data.error || '删除失败', 'error');
                                return;
                              }
                              showToast('邀请码已删除');
                              await loadInvites();
                            } catch {
                              showToast('删除失败', 'error');
                            }
                          }}
                          className='rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
