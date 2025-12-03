/**
 * Global store for system status state
 * Keeps the last update timestamp persistent across route changes
 */

import { create } from 'zustand';

interface SystemStatusStore {
  /** Timestamp of last system status update */
  lastUpdate: number;
  /** Set the last update timestamp */
  setLastUpdate: (timestamp: number) => void;
}

export const useSystemStatusStore = create<SystemStatusStore>((set) => ({
  lastUpdate: 0,
  setLastUpdate: (timestamp) => set({ lastUpdate: timestamp }),
}));
