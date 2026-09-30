'use client';

import { createContext, useContext } from 'react';

/**
 * Lets an upload inside an editor tell the editor it is running, so the
 * editor holds Save and status changes until it ends: the draft never changes
 * under a write.
 */
export const TdUploadingContext = createContext<((uploading: boolean) => void) | null>(null);

export const useTdUploadingReport = () => useContext(TdUploadingContext);
