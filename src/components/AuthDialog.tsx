'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface AuthDialogProps {
  open: boolean;
  mode: 'login' | 'register';
  canRegister: boolean;
  requireInviteCode: boolean;
  onClose: () => void;
  onModeChange: (mode: 'login' | 'register') => void;
  onSuccess: () => Promise<void> | void;
}

const USERNAME_PLACEHOLDER = '3-32 位，仅支持字母、数字、下划线和中划线';

export function AuthDialog({
  open,
  mode,
  canRegister,
  requireInviteCode,
  onClose,
  onModeChange,
  onSuccess,
}: AuthDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = async () => {
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError('用户名和密码不能为空');
      return;
    }
    if (mode === 'register' && requireInviteCode && !inviteCode.trim()) {
      setError('邀请码不能为空');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/login' : '/api/register';
      const payload =
        mode === 'login'
          ? { username: username.trim(), password }
          : {
            username: username.trim(),
            password,
            inviteCode: inviteCode.trim() || undefined,
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || (mode === 'login' ? '登录失败' : '注册失败'));
      }

      setUsername('');
      setPassword('');
      setInviteCode('');
      await onSuccess();
      // 刷新页面以更新全局认证状态
      window.location.reload();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '操作失败，请稍后重试'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 z-[1000] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4'>
      <div className='w-full max-w-md rounded-3xl border border-white/10 bg-white shadow-2xl dark:bg-zinc-900 dark:border-zinc-800'>
        <div className='flex items-center justify-between px-6 pt-6'>
          <div>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
              {mode === 'login' ? '登录账号' : '注册账号'}
            </h2>
            <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              {mode === 'login'
                ? '登录后即可播放、收藏和同步记录'
                : '注册后即可开始使用完整功能'}
            </p>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800'
            aria-label='关闭'
          >
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='px-6 pt-5 pb-6 space-y-4'>
          <div className='grid gap-3'>
            <input
              type='text'
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete='username'
              placeholder={USERNAME_PLACEHOLDER}
              className='w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:focus:ring-green-900'
            />
            <input
              type='password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder='请输入密码'
              className='w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:focus:ring-green-900'
            />
            {mode === 'register' && requireInviteCode && (
              <input
                type='text'
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder='请输入邀请码'
                className='w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:focus:ring-green-900'
              />
            )}
          </div>

          {error && (
            <div className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'>
              {error}
            </div>
          )}

          <button
            type='button'
            onClick={handleSubmit}
            disabled={loading}
            className='w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60'
          >
            {loading
              ? mode === 'login'
                ? '登录中...'
                : '注册中...'
              : mode === 'login'
                ? '登录'
                : '注册'}
          </button>

          {canRegister && (
            <button
              type='button'
              onClick={() => onModeChange(mode === 'login' ? 'register' : 'login')}
              className='w-full text-sm text-gray-600 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-400'
            >
              {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
