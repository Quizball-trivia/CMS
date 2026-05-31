import { ApiClientError } from '@/services/api-client';

export interface ErrorFeedback {
  title: string;
  description?: string;
}

type ValidationDetails = {
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getValidationDetails(details: unknown): ValidationDetails | null {
  if (!isRecord(details)) return null;

  const fieldErrors = isRecord(details.fieldErrors)
    ? Object.fromEntries(
        Object.entries(details.fieldErrors).filter(([, value]) => Array.isArray(value))
      ) as Record<string, string[]>
    : undefined;
  const formErrors = Array.isArray(details.formErrors)
    ? details.formErrors.filter((value): value is string => typeof value === 'string')
    : undefined;

  if (!fieldErrors && !formErrors) return null;
  return { fieldErrors, formErrors };
}

function formatFieldName(field: string): string {
  if (field === 'payload') return 'Question payload';
  if (field === 'prompt') return 'Question prompt';
  if (field === 'category_id') return 'Category';
  return field
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function firstValidationMessage(details: ValidationDetails): string | null {
  const firstFormError = details.formErrors?.find(Boolean);
  if (firstFormError) return firstFormError;

  const firstFieldError = Object.entries(details.fieldErrors ?? {})
    .flatMap(([field, errors]) => (errors ?? []).map((error) => `${formatFieldName(field)}: ${error}`))
    .find(Boolean);

  return firstFieldError ?? null;
}

export function getErrorFeedback(error: unknown, fallbackTitle: string): ErrorFeedback {
  if (error instanceof ApiClientError) {
    const validationDetails = getValidationDetails(error.details);
    const validationMessage = validationDetails ? firstValidationMessage(validationDetails) : null;

    if (validationMessage) {
      return {
        title: fallbackTitle,
        description: validationMessage,
      };
    }

    return {
      title: fallbackTitle,
      description: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      title: fallbackTitle,
      description: error.message,
    };
  }

  return { title: fallbackTitle };
}

export function getErrorLogDetails(error: unknown): Record<string, unknown> {
  if (error instanceof ApiClientError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return { error };
}

export function getErrorResolutionGuidance(error: unknown): string[] {
  if (error instanceof ApiClientError) {
    if (error.status === 400 || error.status === 422) {
      return [
        'Review the field mentioned above and remove empty placeholder values.',
        'For advanced question types, make sure every required prompt, display label, and accepted answer is filled.',
        'Try saving again after correcting the highlighted content.',
      ];
    }

    if (error.status === 401 || error.status === 403) {
      return [
        'Refresh the CMS and sign in again if needed.',
        'Confirm this editor account has permission to make this change.',
      ];
    }

    if (error.status === 404) {
      return [
        'Refresh the question list because this item may have been deleted or moved.',
        'Open the question again before retrying the change.',
      ];
    }

    if (error.status === 409) {
      return [
        'Refresh the page to load the latest version of this item.',
        'Check for duplicate or conflicting content before trying again.',
      ];
    }

    if (error.status >= 500) {
      return [
        'Retry once after a short wait.',
        'If it fails again, send the request ID below to engineering with the question you were editing.',
      ];
    }
  }

  return [
    'Check your connection and retry the action.',
    'If the same error repeats, send the technical details below to engineering.',
  ];
}

export function getErrorTechnicalDetails(error: unknown): Array<{ label: string; value: string }> {
  const details = getErrorLogDetails(error);
  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([label, value]) => ({
      label,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
}
