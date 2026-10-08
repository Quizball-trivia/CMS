import { createContext } from 'react';

/** Opens the image a form names (by its media key) in an editor over the form, for its approval. */
export const TdOpenImageContext = createContext<((key: string) => void) | null>(null);
