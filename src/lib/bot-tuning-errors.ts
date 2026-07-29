import { ApiClientError } from '@/services';

interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
}

/**
 * Turn a backend error into text worth showing the operator.
 *
 * The rail violations are the whole point of this screen, and they arrive in
 * `details.fieldErrors` — the top-level message is only ever the generic
 * "Invalid request body". Surfacing just that would hide the one sentence that
 * explains WHY the change was refused, so unpack the field errors here.
 */
export function botTuningErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) {
    return error instanceof Error ? error.message : fallback;
  }

  const details = error.details as ValidationDetails | null | undefined;
  const messages: string[] = [];

  if (details?.fieldErrors) {
    for (const fieldMessages of Object.values(details.fieldErrors)) {
      messages.push(...fieldMessages);
    }
  }
  if (details?.formErrors?.length) {
    messages.push(...details.formErrors);
  }

  // De-duplicate: zod often reports the same violation from several refinements.
  const unique = [...new Set(messages)];
  if (unique.length > 0) return unique.join(' ');

  return error.message || fallback;
}
