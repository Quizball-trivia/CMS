export type Workspace = 'quizball' | 'table-derby';

export function resolveWorkspace(raw: string | undefined): Workspace {
  const value = raw?.trim();
  if (!value || value === 'quizball') return 'quizball';
  if (value === 'table-derby') return 'table-derby';
  // A typo must fail the build, not silently ship the Quizball CMS on a Table Derby domain.
  throw new Error(`NEXT_PUBLIC_CMS_WORKSPACE must be "quizball" or "table-derby", got "${value}"`);
}

// NEXT_PUBLIC_* is inlined at build time, so a deployment is one workspace for its whole life.
export const WORKSPACE: Workspace = resolveWorkspace(process.env.NEXT_PUBLIC_CMS_WORKSPACE);

export const IS_TABLE_DERBY = WORKSPACE === 'table-derby';
