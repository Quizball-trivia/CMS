/** Georgian for every text of the Table Derby workspace, by its English source.
 *  One file per area; a text used in several areas lives in ka-common. */
import { KA_COMMON } from './ka-common';
import { KA_CONTENT } from './ka-content';
import { KA_EDITORS } from './ka-editors';
import { KA_OPS } from './ka-ops';
import { KA_PUBLISH } from './ka-publish';
import { KA_SHELL } from './ka-shell';

export const KA_PARTS = { common: KA_COMMON, shell: KA_SHELL, content: KA_CONTENT, editors: KA_EDITORS, publish: KA_PUBLISH, ops: KA_OPS } as const;

export const KA: Record<string, string> = { ...KA_COMMON, ...KA_SHELL, ...KA_CONTENT, ...KA_EDITORS, ...KA_PUBLISH, ...KA_OPS };
