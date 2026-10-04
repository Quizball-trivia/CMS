/** Georgian for every text of the Table Derby workspace, by its English source.
 *  One file per area; a text used in several areas lives in ka-common. */
import { KA_CATEGORIES } from './ka-categories';
import { KA_COMMON } from './ka-common';
import { KA_CONTENT } from './ka-content';
import { KA_DASHBOARD } from './ka-dashboard';
import { KA_DAILIES } from './ka-dailies';
import { KA_EDITORS } from './ka-editors';
import { KA_OPS } from './ka-ops';
import { KA_PUBLISH } from './ka-publish';
import { KA_QUESTIONS } from './ka-questions';
import { KA_SHELL } from './ka-shell';
import { KA_UPLOAD } from './ka-upload';

export const KA_PARTS = {
  common: KA_COMMON,
  shell: KA_SHELL,
  content: KA_CONTENT,
  dailies: KA_DAILIES,
  editors: KA_EDITORS,
  publish: KA_PUBLISH,
  ops: KA_OPS,
  questions: KA_QUESTIONS,
  dashboard: KA_DASHBOARD,
  categories: KA_CATEGORIES,
  upload: KA_UPLOAD,
} as const;

export const KA: Record<string, string> = {
  ...KA_COMMON,
  ...KA_SHELL,
  ...KA_CONTENT,
  ...KA_DAILIES,
  ...KA_EDITORS,
  ...KA_PUBLISH,
  ...KA_OPS,
  ...KA_QUESTIONS,
  ...KA_DASHBOARD,
  ...KA_CATEGORIES,
  ...KA_UPLOAD,
};
