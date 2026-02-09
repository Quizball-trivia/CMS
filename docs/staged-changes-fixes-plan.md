# Plan: Fix Staged Changes Issues

## Overview
Fix type errors, runtime issues, and code quality problems in the currently staged CMS changes while maintaining existing functionality.

---

## Issues to Fix

### 1. Type Error in `questions.service.ts` (Critical)

**File:** `src/services/questions.service.ts`
**Problem:** Wrong type annotation - `prompts` is `I18nField[]` but chunks are typed as `string[][]`

**Current (broken):**
```typescript
const chunks: string[][] = [];
for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
  chunks.push(prompts.slice(i, i + BATCH_SIZE));
}
```

**Fix:**
```typescript
const chunks: I18nField[][] = [];
for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
  chunks.push(prompts.slice(i, i + BATCH_SIZE));
}
```

---

### 2. Token Refresh Logic in `api-client.ts` (Design Issue)

**File:** `src/services/api-client.ts`
**Problems:**
- Module-level mutable state (`let isRefreshing`) causes issues with concurrent requests
- `handleResponse` does too much (parsing + auth retry)
- After token refresh, original request is NOT retried - user still sees error

**Fix approach:**
1. Move refresh logic into a request wrapper function
2. Retry the original request after successful token refresh
3. Use a promise queue to handle concurrent 401s (only one refresh at a time)

**Refactored design:**
```typescript
// Promise to track ongoing refresh
let refreshPromise: Promise<boolean> | null = null;

async function withAuthRetry<T>(
  requestFn: () => Promise<Response>,
  handleResponseFn: (res: Response) => Promise<T>
): Promise<T> {
  let response = await requestFn();

  if (response.status === 401 && !response.url.includes('/auth/')) {
    // Wait for any ongoing refresh, or start new one
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;

    if (refreshed) {
      // Retry original request with new token
      response = await requestFn();
    } else {
      clearAuthTokens();
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }
  }

  return handleResponseFn(response);
}
```

---

### 3. `this` Reference in `questions.service.ts` (Potential Runtime Issue)

**File:** `src/services/questions.service.ts`
**Problem:** Using `this.list()` in an object method can break if the method is destructured

**Current:**
```typescript
async getAllIds(params?) {
  // ...
  const result = await this.list({ ...params, page, limit });
}
```

**Fix:** Use explicit reference
```typescript
async getAllIds(params?) {
  // ...
  const result = await questionsService.list({ ...params, page, limit });
}
```

---

### 4. Duplicate `getDifficultyVariant` Function (DRY Violation)

**File:** `src/components/questions/bulk-upload-dialog.tsx`
**Problem:** `getDifficultyVariant` helper is duplicated across components

**Fix:** Extract to shared utility in `src/lib/question-utils.ts` (if not already there) or use existing `getDifficultyTextColor` from `difficulty-signal.tsx`

Check if we can reuse existing difficulty styling utilities before adding new ones.

---

### 5. TYPES.md File

**File:** `TYPES.md` (root)
**Decision:** Keep or remove based on intent
- If this is internal documentation for the team → Keep, but move to `docs/TYPES.md`
- If this was auto-generated context → Remove from commit

---

## Files to Modify

| File | Change |
|------|--------|
| `src/services/questions.service.ts` | Fix `I18nField[][]` type, fix `this` reference |
| `src/services/api-client.ts` | Refactor token refresh to retry original request |
| `src/components/questions/bulk-upload-dialog.tsx` | Use shared difficulty styling utility |
| `TYPES.md` | Move to `docs/` or unstage |

---

## Verification Steps

1. Run TypeScript check:
   ```bash
   npm run typecheck
   ```

2. Run linter:
   ```bash
   npm run lint
   ```

3. Test bulk operations manually:
   - Select multiple questions → Publish → Should work without 401 errors
   - Let session expire → Should redirect to login (not infinite loop)
   - Bulk upload with >100 questions → Should chunk correctly

4. Test token refresh:
   - Make a request with expired token
   - Verify request is retried after refresh (not just logged out)

---

## Implementation Order

1. **Fix type error** in `questions.service.ts` (critical - prevents runtime crash)
2. **Fix `this` reference** in `questions.service.ts` (quick fix)
3. **Refactor api-client.ts** token refresh (most complex)
4. **DRY cleanup** for difficulty styling (optional improvement)
5. **Move TYPES.md** to docs folder (housekeeping)
