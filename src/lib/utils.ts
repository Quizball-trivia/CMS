import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { DEFAULT_LANGUAGE } from '@/lib/constants';
import type { I18nField } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Known language keys to avoid picking up extended properties like 'id'
const LANGUAGE_KEYS = ['en', 'ka'] as const;

/**
 * Get localized text from an i18n field using default language with fallback
 */
export function getLocalizedText(
  field: I18nField | null | undefined,
  fallback = ''
): string {
  if (!field) return fallback;
  // Try default language first, then fall back to any known language key
  if (field[DEFAULT_LANGUAGE]) return field[DEFAULT_LANGUAGE];
  for (const lang of LANGUAGE_KEYS) {
    if (field[lang]) return field[lang];
  }
  return fallback;
}

/**
 * Get localized text from an i18n field for a specific language
 */
export function getLocalizedTextByLang(
  field: I18nField | null | undefined,
  lang: 'en' | 'ka',
  fallback = ''
): string {
  if (!field) return fallback;
  return field[lang] || field.en || fallback;
}
