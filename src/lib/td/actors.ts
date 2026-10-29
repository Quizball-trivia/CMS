import { t } from './i18n';

/** The API names its own actors in English (content workflow.ts SYSTEM, releaseAdmin.ts SYSTEM_NAMES); staff by their names. */
const SYSTEM_ACTORS: Record<string, string> = {
  System: t('System'),
  'Bootstrap (deploy)': t('First deploy'),
  Seed: t('Starter content'),
  'Ops CLI': t('Ops command line'),
};

export const tdActorName = (name: string) => (Object.hasOwn(SYSTEM_ACTORS, name) ? SYSTEM_ACTORS[name]! : name);
