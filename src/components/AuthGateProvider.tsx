'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AuthGateReason,
  clearGuestMode,
  getGuestMode,
} from '@/lib/db.client';

import { AuthDialog } from './AuthDialog';

type MembershipStatus = 'active' | 'expired' | 'removed' | null;

interface AuthStatusState {
  authenticated: boolean;
  username: string | null;
  role: 'owner' | 'admin' | 'user' | null;
  membershipStatus: MembershipStatus;
  membershipExpiresAt: string | null;
}

interface AuthGateContextValue {
  ready: boolean;
  authStatus: AuthStatusState;
  ensureAuthorized: (
    intent?: 'play' | 'write' | 'favorite'
  ) => Promise<boolean>;
  openLoginDialog: () => void;
  refreshAuthStatus: () => Promise<AuthStatusState>;
}

const defaultAuthStatus: AuthStatusState = {
  authenticated: false,
  username: null,
  role: null,
  membershipStatus: null,
  membershipExpiresAt: null,
};

const AuthGateContext = createContext<AuthGateContextValue | null>(null);

async function fetchAuthStatus(): Promise<AuthStatusState> {
  const response = await fetch('/api/auth/status', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    return defaultAuthStatus;
  }

  const data = (await response.json()) as Partial<AuthStatusState> & {
    authenticated?: boolean;
  };

  return {
    authenticated: Boolean(data.authenticated),
    username: data.username || null,
    role: data.role || null,
    membershipStatus: data.membershipStatus || null,
    membershipExpiresAt: data.membershipExpiresAt || null,
  };
}

function ExpiredDialog({
  open,
  membershipExpiresAt,
  onClose,
}: {
  open: boolean;
  membershipExpiresAt: string | null;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className='fixed inset-0 z-[1000] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4'>
      <div className='w-full max-w-md rounded-3xl border border-white/10 bg-white shadow-2xl px-6 py-6 dark:bg-zinc-900 dark:border-zinc-800'>
        <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
          账号已过期
        </h2>
        <p className='mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300'>
          当前账号已过期，播放、收藏和记录同步功能已暂停。
          {membershipExpiresAt && (
            <>
              {' '}
              到期时间：
              <span className='font-medium'>{membershipExpiresAt}</span>
            </>
          )}
        </p>
        <p className='mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400'>
          请续费或联系管理员获取新的邀请码。
        </p>
        <button
          type='button'
          onClick={onClose}
          className='mt-6 w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700'
        >
          我知道了
        </button>
      </div>
    </div>
  );
}

export function AuthGateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authStatus, setAuthStatus] = useState<AuthStatusState>(defaultAuthStatus);
  const [ready, setReady] = useState(false);
  const [dialogMode, setDialogMode] = useState<'login' | 'register'>('login');
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [expiredDialogOpen, setExpiredDialogOpen] = useState(false);
  const [canRegister, setCanRegister] = useState(false);
  const [requireInviteCode, setRequireInviteCode] = useState(false);

  const refreshAuthStatus = useCallback(async () => {
    const nextStatus = await fetchAuthStatus();
    setAuthStatus(nextStatus);
    return nextStatus;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCanRegister(Boolean((window as any).RUNTIME_CONFIG?.ENABLE_REGISTER));
    setRequireInviteCode(
      Boolean((window as any).RUNTIME_CONFIG?.REQUIRE_INVITE_CODE_FOR_REGISTER)
    );
    refreshAuthStatus()
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [refreshAuthStatus]);

  useEffect(() => {
    const handleGateRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ reason: AuthGateReason }>).detail;
      if (detail?.reason === 'expired' || detail?.reason === 'removed') {
        setExpiredDialogOpen(true);
        return;
      }
      setDialogMode('login');
      setAuthDialogOpen(true);
    };

    window.addEventListener(
      'authGateRequested',
      handleGateRequest as EventListener
    );
    return () =>
      window.removeEventListener(
        'authGateRequested',
        handleGateRequest as EventListener
      );
  }, []);

  const openLoginDialog = useCallback(() => {
    setDialogMode('login');
    setAuthDialogOpen(true);
  }, []);

  const ensureAuthorized = useCallback(
    async (_intent: 'play' | 'write' | 'favorite' = 'write') => {
      const status = await refreshAuthStatus();
      if (status.authenticated && status.membershipStatus !== 'expired') {
        return true;
      }

      if (status.membershipStatus === 'expired' || status.membershipStatus === 'removed') {
        setExpiredDialogOpen(true);
        return false;
      }

      if (getGuestMode() || !status.authenticated) {
        setDialogMode('login');
        setAuthDialogOpen(true);
      }

      return false;
    },
    [refreshAuthStatus]
  );

  const contextValue = useMemo<AuthGateContextValue>(
    () => ({
      authStatus,
      ready,
      ensureAuthorized,
      openLoginDialog,
      refreshAuthStatus,
    }),
    [authStatus, ready, ensureAuthorized, openLoginDialog, refreshAuthStatus]
  );

  return (
    <AuthGateContext.Provider value={contextValue}>
      {children}
      <AuthDialog
        open={authDialogOpen}
        mode={dialogMode}
        canRegister={canRegister}
        requireInviteCode={requireInviteCode}
        onClose={() => setAuthDialogOpen(false)}
        onModeChange={setDialogMode}
        onSuccess={async () => {
          clearGuestMode();
          await refreshAuthStatus();
        }}
      />
      <ExpiredDialog
        open={expiredDialogOpen}
        membershipExpiresAt={authStatus.membershipExpiresAt}
        onClose={() => setExpiredDialogOpen(false)}
      />
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  const context = useContext(AuthGateContext);
  if (!context) {
    throw new Error('useAuthGate must be used within AuthGateProvider');
  }
  return context;
}
