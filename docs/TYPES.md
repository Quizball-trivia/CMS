# CMS API types and services

The backend OpenAPI document generates `src/types/api.generated.ts`. Domain types in `src/types/` reuse those schemas and add editor-specific payload types where needed. Do not edit the generated file by hand.

With the backend running on port 8001:

```bash
npm run generate:api
npm run typecheck
```

Review the generated diff before committing it; a different backend branch can change unrelated routes. This repository does not define `api:sync:local`, `api:sync:staging`, `api:sync:prod`, or `api:check` scripts.

## Existing request paths

Most CMS features use query hooks in `src/hooks/`, domain services in `src/services/`, and the shared `src/services/api-client.ts` transport. That transport coordinates token refresh and handles expired sessions. Extend the corresponding service and hook when adding behavior to those features.

```typescript
import { categoriesService } from '@/services';
import type { Category } from '@/types';

const categories: Category[] = await categoriesService.listAll();
```

`listAll` returns an array, not a pagination envelope. Query-cache updates must preserve the shape returned by the query function.

The Weekend League page currently uses the generated-path `openapi-fetch` client exported by `src/lib/api.ts`. Its authentication middleware adds the stored token; it does not provide the shared transport's refresh coordination. Keep its existing caller working. A future transport consolidation must preserve authentication, error handling, and response shapes for both sets of callers.

## Editor payloads

Question updates replace submitted JSON fields on the backend. Both question editors use `prepareQuestionUpdate` from `src/lib/question-utils.ts` to merge unchanged translations and image metadata before sending an update. An explicitly empty locale removes that translation. An omitted image preserves the stored image; an explicit `image: undefined` removes it from the replacement payload.

Import editor/domain types from `@/types`, and use `components` or `paths` from `@/types/api.generated` when deriving a transport type. Keep any deliberate domain transformation visible rather than bypassing the generated contract with a generic cast.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs those checks on pull requests. Tests exercise real editor saves and category query-cache behavior; they do not contact a deployed CMS or database.
