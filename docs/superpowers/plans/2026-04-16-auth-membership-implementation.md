# Auth And Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add guest access, modal login/register flows, invite-code registration, account expiration enforcement, grace-period deletion, and owner-managed invite administration to LunaTV.

**Architecture:** Extend the existing config-driven auth model instead of replacing it. Keep final authorization on the server by introducing membership status helpers used by login/register, protected write APIs, and admin management endpoints, while the client adds a reusable auth modal and guest marker for current-page interception.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Jest, existing Redis/Kvrocks/Upstash storage abstraction

---

## File Map

- Modify: `src/lib/admin.types.ts`
  - Extend admin config types with invite-code settings, expiration fields, and grace-period settings.
- Modify: `src/lib/types.ts`
  - Extend storage interfaces for invite codes and membership-related user metadata.
- Modify: `src/lib/db.ts`
  - Expose membership and invite CRUD helpers through `DbManager`.
- Modify: `src/lib/redis-base.db.ts`
  - Persist invite codes and member metadata in Redis-family storage.
- Modify: `src/lib/config.ts`
  - Initialize and normalize new config fields.
- Create: `src/lib/member.ts`
  - Centralize guest/auth/member expiration checks and time calculations.
- Create: `src/lib/invite.ts`
  - Centralize invite creation, validation, and consumption helpers.
- Create: `src/lib/auth-session.ts`
  - Read/write auth cookie payloads, including membership status returned to the client.
- Modify: `src/lib/auth.ts`
  - Reuse session parsing helpers and expose richer auth info.
- Modify: `src/app/api/login/route.ts`
  - Return expired status and richer cookie payload.
- Modify: `src/app/api/register/route.ts`
  - Enforce register switches and optional invite validation.
- Modify: `src/app/api/admin/user/route.ts`
  - Support new switches and owner-only membership actions.
- Create: `src/app/api/admin/invite/route.ts`
  - Owner-only CRUD/generation API for invite codes.
- Create: `src/app/api/auth/status/route.ts`
  - Lightweight endpoint for client modal/status checks.
- Modify: `src/middleware.ts`
  - Permit guest browsing for selected routes while preserving admin protection.
- Modify: `src/app/login/page.tsx`
  - Add skip button and updated register UX.
- Create: `src/components/AuthDialog.tsx`
  - Shared login/register modal for in-page interception.
- Create: `src/components/AuthGateProvider.tsx`
  - Client provider to manage guest marker, auth modal, and expired prompts.
- Modify: `src/app/layout.tsx`
  - Inject runtime config for new switches and mount the provider.
- Modify: `src/app/play/page.tsx`
  - Gate play/start/switch actions through the provider.
- Modify: `src/app/page.tsx`
  - Gate favorites clear/write flows through the provider.
- Modify: `src/lib/db.client.ts`
  - Expose guest marker helpers and make write APIs surface auth/expired failures consistently.
- Modify: `src/app/admin/page.tsx`
  - Add grace-period switch fields and invite management UI.
- Create: `src/__tests__/member.test.ts`
  - Cover expiration, grace period, and renewal calculations.
- Create: `src/__tests__/invite.test.ts`
  - Cover invite validation and consumption rules.
- Create: `src/__tests__/auth-session.test.ts`
  - Cover guest/auth cookie payload parsing.

### Task 1: Extend Shared Types And Config Defaults

**Files:**
- Modify: `src/lib/admin.types.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/config.ts`
- Test: `src/__tests__/member.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { calculateGraceDeleteAt, isMembershipExpired } from '@/lib/member';

describe('membership config defaults', () => {
  it('treats owner as never expired and uses grace days for users', () => {
    expect(
      isMembershipExpired({
        role: 'owner',
        expiresAt: '2026-01-01T00:00:00.000Z',
        now: '2026-06-01T00:00:00.000Z',
      })
    ).toBe(false);

    expect(
      calculateGraceDeleteAt('2026-06-01T00:00:00.000Z', 10)
    ).toBe('2026-06-11T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts`
Expected: FAIL with `Cannot find module '@/lib/member'` or missing exported helpers.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/admin.types.ts
UserConfig: {
  AllowRegister: boolean;
  RequireInviteCodeForRegister?: boolean;
  ExpiredGracePeriodDays?: number;
  Users: {
    username: string;
    role: 'user' | 'admin' | 'owner';
    banned?: boolean;
    expiresAt?: string;
  }[];
}

// src/lib/types.ts
export interface InviteCodeRecord {
  code: string;
  status: 'active' | 'used' | 'disabled';
  inviteExpiresAt: string;
  accountDurationDays: number;
  createdAt: string;
  createdBy: string;
  note?: string;
  usedBy?: string;
  usedAt?: string;
}

// src/lib/config.ts
UserConfig: {
  AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
  RequireInviteCodeForRegister: false,
  ExpiredGracePeriodDays: 10,
  Users: [],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin.types.ts src/lib/types.ts src/lib/config.ts src/__tests__/member.test.ts
git commit -m "feat: add membership config types"
```

### Task 2: Add Membership And Invite Helpers

**Files:**
- Create: `src/lib/member.ts`
- Create: `src/lib/invite.ts`
- Test: `src/__tests__/member.test.ts`
- Test: `src/__tests__/invite.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { getMembershipState, renewMembership } from '@/lib/member';
import { validateInviteRecord } from '@/lib/invite';

it('marks a user inside grace period as expired but not purgeable', () => {
  expect(
    getMembershipState({
      role: 'user',
      expiresAt: '2026-06-01T00:00:00.000Z',
      gracePeriodDays: 10,
      now: '2026-06-05T00:00:00.000Z',
    })
  ).toMatchObject({ status: 'expired', shouldDelete: false });
});

it('extends from old expiry when membership is still active', () => {
  expect(
    renewMembership({
      currentExpiresAt: '2026-06-20T00:00:00.000Z',
      durationDays: 30,
      now: '2026-06-10T00:00:00.000Z',
    })
  ).toBe('2026-07-20T00:00:00.000Z');
});

it('rejects used invite codes', () => {
  expect(
    validateInviteRecord({
      code: 'ABC',
      status: 'used',
      inviteExpiresAt: '2026-06-30T00:00:00.000Z',
      accountDurationDays: 30,
      createdAt: '2026-06-01T00:00:00.000Z',
      createdBy: 'owner',
    }, '2026-06-10T00:00:00.000Z')
  ).toMatchObject({ ok: false, reason: 'used' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts src/__tests__/invite.test.ts`
Expected: FAIL with missing functions or incorrect results.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/member.ts
export function calculateGraceDeleteAt(expiresAt: string, gracePeriodDays: number) {
  const date = new Date(expiresAt);
  date.setUTCDate(date.getUTCDate() + gracePeriodDays);
  return date.toISOString();
}

export function getMembershipState(input: {
  role: 'user' | 'admin' | 'owner';
  expiresAt?: string;
  gracePeriodDays: number;
  now: string;
}) {
  if (input.role === 'owner' || !input.expiresAt) return { status: 'active', shouldDelete: false };
  if (new Date(input.now) <= new Date(input.expiresAt)) return { status: 'active', shouldDelete: false };
  const graceDeleteAt = calculateGraceDeleteAt(input.expiresAt, input.gracePeriodDays);
  return {
    status: 'expired',
    shouldDelete: new Date(input.now) > new Date(graceDeleteAt),
    graceDeleteAt,
  };
}

export function renewMembership(input: {
  currentExpiresAt?: string;
  durationDays: number;
  now: string;
}) {
  const base = input.currentExpiresAt && new Date(input.currentExpiresAt) > new Date(input.now)
    ? new Date(input.currentExpiresAt)
    : new Date(input.now);
  base.setUTCDate(base.getUTCDate() + input.durationDays);
  return base.toISOString();
}

// src/lib/invite.ts
export function validateInviteRecord(record, now: string) {
  if (record.status === 'used') return { ok: false, reason: 'used' };
  if (record.status === 'disabled') return { ok: false, reason: 'disabled' };
  if (new Date(now) > new Date(record.inviteExpiresAt)) return { ok: false, reason: 'expired' };
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts src/__tests__/invite.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/member.ts src/lib/invite.ts src/__tests__/member.test.ts src/__tests__/invite.test.ts
git commit -m "feat: add membership helper utilities"
```

### Task 3: Persist Invite Codes And Membership Metadata

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/lib/redis-base.db.ts`
- Test: `src/__tests__/invite.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { consumeInviteRecord } from '@/lib/invite';

it('marks invite code as used after registration', () => {
  const consumed = consumeInviteRecord(
    {
      code: 'ABC',
      status: 'active',
      inviteExpiresAt: '2026-06-30T00:00:00.000Z',
      accountDurationDays: 30,
      createdAt: '2026-06-01T00:00:00.000Z',
      createdBy: 'owner',
    },
    'alice',
    '2026-06-02T00:00:00.000Z'
  );

  expect(consumed).toMatchObject({
    status: 'used',
    usedBy: 'alice',
    usedAt: '2026-06-02T00:00:00.000Z',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand src/__tests__/invite.test.ts`
Expected: FAIL with missing `consumeInviteRecord`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/types.ts
export interface IStorage {
  getInviteCode(code: string): Promise<InviteCodeRecord | null>;
  getAllInviteCodes(): Promise<InviteCodeRecord[]>;
  setInviteCode(record: InviteCodeRecord): Promise<void>;
  deleteInviteCode(code: string): Promise<void>;
}

// src/lib/db.ts
async getInviteCode(code: string) {
  return this.storage.getInviteCode(code);
}

async saveInviteCode(record: InviteCodeRecord) {
  await this.storage.setInviteCode(record);
}

// src/lib/redis-base.db.ts
private inviteKey(code: string) {
  return `invite:${code}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand src/__tests__/invite.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/db.ts src/lib/redis-base.db.ts src/__tests__/invite.test.ts
git commit -m "feat: persist invite code records"
```

### Task 4: Enforce Membership In Login And Register APIs

**Files:**
- Create: `src/lib/auth-session.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/app/api/login/route.ts`
- Modify: `src/app/api/register/route.ts`
- Modify: `src/lib/config.ts`
- Test: `src/__tests__/auth-session.test.ts`
- Test: `src/__tests__/invite.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { buildAuthPayload } from '@/lib/auth-session';

it('includes expired status in auth payload for expired users', async () => {
  const payload = await buildAuthPayload({
    username: 'alice',
    role: 'user',
    membershipStatus: 'expired',
  });

  expect(payload).toContain('expired');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --runInBand src/__tests__/auth-session.test.ts src/__tests__/invite.test.ts`
Expected: FAIL with missing session helpers and registration invite checks.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/auth-session.ts
export async function buildAuthPayload(input: {
  username?: string;
  role: 'owner' | 'admin' | 'user';
  membershipStatus?: 'active' | 'expired';
}) {
  return encodeURIComponent(JSON.stringify(input));
}

// src/app/api/register/route.ts
if (config.UserConfig.RequireInviteCodeForRegister) {
  const inviteRecord = await db.getInviteCode(inviteCode);
  const inviteCheck = validateInviteRecord(inviteRecord, new Date().toISOString());
  if (!inviteCheck.ok) {
    return NextResponse.json({ error: '邀请码无效' }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --runInBand src/__tests__/auth-session.test.ts src/__tests__/invite.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-session.ts src/lib/auth.ts src/app/api/login/route.ts src/app/api/register/route.ts src/lib/config.ts src/__tests__/auth-session.test.ts src/__tests__/invite.test.ts
git commit -m "feat: enforce invite registration and membership login state"
```

### Task 5: Add Owner Invite Management API And User Config Controls

**Files:**
- Create: `src/app/api/admin/invite/route.ts`
- Modify: `src/app/api/admin/user/route.ts`
- Modify: `src/lib/invite.ts`
- Test: `src/__tests__/invite.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { generateInviteCodes } from '@/lib/invite';

it('generates the requested number of invite codes', () => {
  const codes = generateInviteCodes({
    count: 3,
    inviteExpiresAt: '2026-06-30T00:00:00.000Z',
    accountDurationDays: 30,
    createdBy: 'owner',
  });

  expect(codes).toHaveLength(3);
  expect(new Set(codes.map((item) => item.code)).size).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand src/__tests__/invite.test.ts`
Expected: FAIL with missing invite generator.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/invite.ts
export function generateInviteCodes(input: {
  count: number;
  inviteExpiresAt: string;
  accountDurationDays: number;
  createdBy: string;
  note?: string;
}) {
  return Array.from({ length: input.count }, () => ({
    code: Math.random().toString(36).slice(2, 10).toUpperCase(),
    status: 'active',
    inviteExpiresAt: input.inviteExpiresAt,
    accountDurationDays: input.accountDurationDays,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    note: input.note,
  }));
}

// src/app/api/admin/user/route.ts
const ACTIONS = [..., 'setRequireInviteCodeForRegister', 'setExpiredGracePeriodDays'] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand src/__tests__/invite.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/invite.ts src/app/api/admin/invite/route.ts src/app/api/admin/user/route.ts src/__tests__/invite.test.ts
git commit -m "feat: add owner invite management api"
```

### Task 6: Add Client Auth Gate And Guest Marker

**Files:**
- Create: `src/components/AuthDialog.tsx`
- Create: `src/components/AuthGateProvider.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/lib/db.client.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { getGuestMode, setGuestMode } from '@/lib/db.client';

it('persists guest mode marker in localStorage', () => {
  setGuestMode(true);
  expect(getGuestMode()).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand src/__tests__/auth-session.test.ts`
Expected: FAIL with missing guest marker helpers.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/db.client.ts
const GUEST_MODE_KEY = 'moontv_guest_mode';
export function setGuestMode(enabled: boolean) {
  localStorage.setItem(GUEST_MODE_KEY, enabled ? 'true' : 'false');
}
export function getGuestMode() {
  return localStorage.getItem(GUEST_MODE_KEY) === 'true';
}

// src/app/login/page.tsx
<button type='button' onClick={() => {
  setGuestMode(true);
  router.replace('/');
}}>
  跳过
</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand src/__tests__/auth-session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/AuthDialog.tsx src/components/AuthGateProvider.tsx src/app/layout.tsx src/app/login/page.tsx src/lib/db.client.ts src/__tests__/auth-session.test.ts
git commit -m "feat: add client auth gate modal flow"
```

### Task 7: Gate Play And Write Actions In The UI

**Files:**
- Modify: `src/app/play/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/ContinueWatching.tsx`
- Modify: `src/components/VideoCard.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it('blocks playback start for guests by opening auth dialog', () => {
  const result = canStartPlayback({
    isGuest: true,
    membershipStatus: 'guest',
  });

  expect(result).toEqual({ allowed: false, reason: 'guest' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts`
Expected: FAIL with missing gate helper.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/member.ts
export function canPerformProtectedAction(input: {
  isGuest: boolean;
  membershipStatus: 'active' | 'expired' | 'guest';
}) {
  if (input.isGuest || input.membershipStatus === 'guest') {
    return { allowed: false, reason: 'guest' as const };
  }
  if (input.membershipStatus === 'expired') {
    return { allowed: false, reason: 'expired' as const };
  }
  return { allowed: true as const };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/play/page.tsx src/app/page.tsx src/components/ContinueWatching.tsx src/components/VideoCard.tsx src/lib/member.ts src/__tests__/member.test.ts
git commit -m "feat: gate playback and write actions"
```

### Task 8: Add Admin UI For Invite Management And Membership Switches

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/lib/admin.types.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('shows invite-code settings only for owner', () => {
  expect(
    getAdminCapabilities({ role: 'owner' })
  ).toMatchObject({ canManageInvites: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts`
Expected: FAIL with missing capability helper.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/member.ts
export function getAdminCapabilities(input: { role: 'owner' | 'admin' }) {
  return {
    canManageInvites: input.role === 'owner',
    canManageMembershipSettings: input.role === 'owner',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/page.tsx src/lib/member.ts src/__tests__/member.test.ts
git commit -m "feat: add admin invite management ui"
```

### Task 9: Enforce Expiration On Write APIs And Purge Expired Users

**Files:**
- Modify: `src/app/api/favorites/route.ts`
- Modify: `src/app/api/playrecords/route.ts`
- Modify: `src/app/api/searchhistory/route.ts`
- Modify: `src/app/api/skipconfigs/route.ts`
- Create: `src/app/api/cron/cleanup-expired-users/route.ts`
- Modify: `src/lib/member.ts`
- Modify: `src/lib/db.ts`
- Test: `src/__tests__/member.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { shouldPurgeExpiredUser } from '@/lib/member';

it('purges when user is past grace period', () => {
  expect(
    shouldPurgeExpiredUser({
      role: 'user',
      expiresAt: '2026-06-01T00:00:00.000Z',
      gracePeriodDays: 5,
      now: '2026-06-10T00:00:00.000Z',
    })
  ).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts`
Expected: FAIL with missing purge helper.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/member.ts
export function shouldPurgeExpiredUser(input: {
  role: 'user' | 'admin' | 'owner';
  expiresAt?: string;
  gracePeriodDays: number;
  now: string;
}) {
  return getMembershipState(input).shouldDelete;
}

// protected API routes
const membership = await assertMemberCanWrite(request);
if (!membership.ok) {
  return NextResponse.json({ error: membership.reason }, { status: membership.status });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/favorites/route.ts src/app/api/playrecords/route.ts src/app/api/searchhistory/route.ts src/app/api/skipconfigs/route.ts src/app/api/cron/cleanup-expired-users/route.ts src/lib/member.ts src/lib/db.ts src/__tests__/member.test.ts
git commit -m "feat: enforce expiration on write apis"
```

### Task 10: Full Verification And Cleanup

**Files:**
- Modify: any touched files from prior tasks if verification finds issues

- [ ] **Step 1: Run targeted tests**

Run: `pnpm test -- --runInBand src/__tests__/member.test.ts src/__tests__/invite.test.ts src/__tests__/auth-session.test.ts`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS with no TypeScript errors

- [ ] **Step 3: Run lint on changed files or full source**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 4: Manually verify critical flows**

```text
1. Login page shows 跳过 and can enter home as guest
2. Guest can browse search/detail/play page shell
3. Guest pressing play opens auth modal
4. Register respects AllowRegister and RequireInviteCodeForRegister
5. Owner admin page can create/disable/delete invite codes
6. Expired user sees grace-period prompt instead of writing
7. Past-grace user is deleted and blocked
```

- [ ] **Step 5: Commit final fixes**

```bash
git add .
git commit -m "feat: ship guest auth and membership lifecycle"
```

