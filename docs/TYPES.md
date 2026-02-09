# CMS Types Guide

This app uses auto-generated TypeScript types from the backend's OpenAPI spec for full type safety.

## How Types Flow

```
Backend (Zod Schemas)
       ↓
OpenAPI Spec (http://localhost:8001/openapi.json)
       ↓
npm run api:sync:local
       ↓
src/types/api.generated.ts
       ↓
src/lib/api.ts (type-safe client)
```

## Quick Start

```bash
# Generate/update types from running backend
npm run api:sync:local

# Check types compile correctly
npm run typecheck
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run api:sync:local` | Sync types from localhost:8001 |
| `npm run api:sync:staging` | Sync from `$STAGING_API_URL` |
| `npm run api:sync:prod` | Sync from `$PROD_API_URL` |
| `npm run api:check` | CI: Verify types match (fails if out of sync) |
| `npm run typecheck` | Run TypeScript compiler |

## Using the Type-Safe API Client

### Import the client

```typescript
import { api } from '@/lib/api';
```

### GET requests

```typescript
// Simple GET
const { data, error } = await api.GET('/api/v1/categories');

// With path parameters
const { data, error } = await api.GET('/api/v1/categories/{id}', {
  params: { path: { id: 'category-uuid' } }
});

// With query parameters
const { data, error } = await api.GET('/api/v1/questions', {
  params: {
    query: {
      category_id: 'uuid',
      status: 'published',
      page: '1',
      limit: '20',
    }
  }
});
```

### POST requests

```typescript
const { data, error } = await api.POST('/api/v1/categories', {
  body: {
    slug: 'sports',
    name: { en: 'Sports', ka: 'სპორტი' },
    is_active: true,
  }
});
```

### PUT requests

```typescript
const { data, error } = await api.PUT('/api/v1/categories/{id}', {
  params: { path: { id: 'uuid' } },
  body: { name: { en: 'Updated Name' } }
});
```

### DELETE requests

```typescript
const { data, error } = await api.DELETE('/api/v1/categories/{id}', {
  params: { path: { id: 'uuid' } }
});
```

### PATCH requests

```typescript
const { data, error } = await api.PATCH('/api/v1/questions/{id}/status', {
  params: { path: { id: 'uuid' } },
  body: { status: 'published' }
});
```

## Using Types Directly

### From the generated file

```typescript
import type { components } from '@/types/api.generated';

type Category = components['schemas']['CategoryResponse'];
type Question = components['schemas']['QuestionResponse'];
type I18nField = components['schemas']['I18nField'];
```

### From the API client (re-exported)

```typescript
import type { Category, Question, I18nField } from '@/lib/api';
```

## With React Query

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Query hook
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/categories');
      if (error) throw error;
      return data;
    },
  });
}

// Mutation hook
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      slug: string;
      name: { en: string };
      is_active?: boolean;
    }) => {
      const { data, error } = await api.POST('/api/v1/categories', { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}
```

## Cross-Checking Types

### 1. Sync latest types

```bash
npm run api:sync:local
```

### 2. Run TypeScript check

```bash
npm run typecheck
```

### 3. If errors appear

The errors show exactly what's mismatched:

```
error TS2339: Property 'newField' does not exist on type 'CategoryResponse'
```

This means:
- Backend added `newField` but you haven't synced yet, OR
- You're using a field that doesn't exist in the API

### 4. Fix the mismatch

```bash
# If backend changed, sync again
npm run api:sync:local

# If your code is wrong, fix it based on the error
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Check API types are in sync
  run: |
    npm run api:sync:prod
    npm run typecheck
```

Or use the built-in check:

```yaml
- name: Verify types
  run: npm run api:check
  env:
    PROD_API_URL: ${{ secrets.PROD_API_URL }}
```

## Troubleshooting

### "Cannot find module '@/types/api.generated'"

Types haven't been generated yet:
```bash
npm run api:sync:local
```

### "Property 'X' does not exist on type 'Y'"

Types are out of sync:
```bash
npm run api:sync:local
npm run typecheck
```

### "fetch failed" when syncing

Backend not running:
```bash
cd ../backend-node
npm run dev
# Then retry sync
```

### Types seem stale

Force regenerate:
```bash
rm src/types/api.generated.ts
npm run api:sync:local
```

## File Structure

```
src/
├── lib/
│   └── api.ts              # Type-safe API client + re-exported types
├── types/
│   ├── api.generated.ts    # Auto-generated (DO NOT EDIT)
│   ├── api.ts              # Legacy manual types (migrate away from this)
│   ├── category.ts         # Domain types extending generated ones
│   └── question.ts         # Domain types extending generated ones
```

## Migration Note

The old `apiClient` in `src/services/api-client.ts` still works but isn't type-safe. Prefer using the new `api` client from `@/lib/api.ts` for new code.
