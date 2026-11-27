import { create } from 'zustand';

/** Save status shown in the editor toolbar. */
export const useSaveStatus = create<{ status: 'saved' | 'saving' | 'error'; error?: string }>(() => ({ status: 'saved' }));
