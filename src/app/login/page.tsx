/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { clearGuestMode, setGuestMode } from '@/lib/db.client';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldAskUsername, setShouldAskUsername] = useState(false);
  const [enableRegister, setEnableRegister] = useState(false);
  const [requireInviteCode, setRequireInviteCode] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [inviteCode, setInviteCode] = useState('');

  const { siteName } = useSite();

  // 在客户端挂载后设置配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storageType = (window as any).RUNTIME_CONFIG?.STORAGE_TYPE;
      setShouldAskUsername(storageType && storageType !== 'localstorage');
      setEnableRegister(
        Boolean((window as any).RUNTIME_CONFIG?.ENABLE_REGISTER)
      );
      setRequireInviteCode(
        Boolean(
          (window as any).RUNTIME_CONFIG?.REQUIRE_INVITE_CODE_FOR_REGISTER
        )
      );
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mode === 'register') {
      await handleRegister();
      return;
    }
    setError(null);

    if (!password || (shouldAskUsername && !username)) return;

    try {
      setLoading(true);
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          ...(shouldAskUsername ? { username } : {}),
        }),
      });

      if (res.ok) {
        clearGuestMode();
        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else if (res.status === 401) {
        setError('密码错误');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '服务器错误');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 处理注册逻辑
  const handleRegister = async () => {
    setError(null);
    if (!password || !username) return;
    if (requireInviteCode && !inviteCode.trim()) {
      setError('邀请码不能为空');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          inviteCode: inviteCode.trim() || undefined,
        }),
      });

      if (res.ok) {
        clearGuestMode();
        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '服务器错误');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
      <div className='absolute top-4 right-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-10 dark:border dark:border-zinc-800'>
        <h1 className='text-green-600 tracking-tight text-center text-3xl font-extrabold mb-8 bg-clip-text drop-shadow-sm'>
          {siteName}
        </h1>
        {shouldAskUsername && enableRegister && (
          <div className='mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1 dark:bg-zinc-800'>
            <button
              type='button'
              onClick={() => setMode('login')}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${mode === 'login'
                ? 'bg-white text-gray-900 shadow dark:bg-zinc-700 dark:text-white'
                : 'text-gray-500 dark:text-gray-400'
                }`}
            >
              登录
            </button>
            <button
              type='button'
              onClick={() => setMode('register')}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${mode === 'register'
                ? 'bg-white text-gray-900 shadow dark:bg-zinc-700 dark:text-white'
                : 'text-gray-500 dark:text-gray-400'
                }`}
            >
              注册
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className='space-y-8'>
          {shouldAskUsername && (
            <div>
              <label htmlFor='username' className='sr-only'>
                用户名
              </label>
              <input
                id='username'
                type='text'
                autoComplete='username'
                className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
                placeholder='输入用户名'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}

          <div>
            <label htmlFor='password' className='sr-only'>
              密码
            </label>
            <input
              id='password'
              type='password'
              autoComplete='current-password'
              className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
              placeholder='输入访问密码'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mode === 'register' && shouldAskUsername && requireInviteCode && (
            <div>
              <label htmlFor='inviteCode' className='sr-only'>
                邀请码
              </label>
              <input
                id='inviteCode'
                type='text'
                className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
                placeholder='输入邀请码'
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </div>
          )}

          {error && (
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
          )}

          {/* 登录 / 注册按钮 */}
          {shouldAskUsername && enableRegister ? (
            <div className='flex gap-4'>
              {mode === 'register' ? (
                <button
                  type='button'
                  onClick={handleRegister}
                  disabled={!password || !username || loading}
                  className='flex-1 inline-flex justify-center rounded-lg bg-blue-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
                >
                  {loading ? '注册中...' : '注册'}
                </button>
              ) : (
                <button
                  type='submit'
                  disabled={
                    !password || loading || (shouldAskUsername && !username)
                  }
                  className='flex-1 inline-flex justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:from-green-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
                >
                  {loading ? '登录中...' : '登录'}
                </button>
              )}
                <button
                  type='button'
                  onClick={() => {
                    setGuestMode(true);
                    window.location.href = '/';
                  }}
                  disabled={loading}
                  className='flex-1 inline-flex justify-center rounded-lg bg-gray-200 py-3 text-base font-semibold text-gray-700 shadow-lg transition-all duration-200 hover:bg-gray-300 dark:bg-zinc-700 dark:text-gray-100 dark:hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50'
                >
                跳过
              </button>
            </div>
          ) : (
            <div className='space-y-3'>
              <button
                type='submit'
                disabled={
                  !password || loading || (shouldAskUsername && !username)
                }
                className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:from-green-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {loading ? '登录中...' : '登录'}
              </button>
              {shouldAskUsername && (
                <button
                  type='button'
                  onClick={() => {
                    setGuestMode(true);
                    window.location.href = '/';
                  }}
                  disabled={loading}
                  className='inline-flex w-full justify-center rounded-lg bg-gray-200 py-3 text-base font-semibold text-gray-700 shadow-lg transition-all duration-200 hover:bg-gray-300 dark:bg-zinc-700 dark:text-gray-100 dark:hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50'
                >
                  跳过
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
