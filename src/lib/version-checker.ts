/**
 * Version checker service for detecting client/server version mismatches
 */

import { fetchServerVersion } from './api';

// Client version injected at build time
const CLIENT_VERSION = import.meta.env.VITE_APP_VERSION || null;

export interface VersionStatus {
  clientVersion: string | null;
  serverVersion: string | null;
  mismatch: boolean;
  enabled: boolean;
}

/**
 * Check if version checking is enabled (both client and server have versions)
 */
export function isVersionCheckEnabled(): boolean {
  return CLIENT_VERSION !== null;
}

/**
 * Get the client version
 */
export function getClientVersion(): string | null {
  return CLIENT_VERSION;
}

/**
 * Check server version and compare with client
 */
export async function checkVersion(): Promise<VersionStatus> {
  const clientVersion = getClientVersion();

  // If client version not set, version checking is disabled
  if (clientVersion === null) {
    return {
      clientVersion: null,
      serverVersion: null,
      mismatch: false,
      enabled: false,
    };
  }

  try {
    const { version: serverVersion } = await fetchServerVersion();

    // If server version not set, version checking is disabled
    if (serverVersion === null) {
      return {
        clientVersion,
        serverVersion: null,
        mismatch: false,
        enabled: false,
      };
    }

    const mismatch = clientVersion !== serverVersion;

    return {
      clientVersion,
      serverVersion,
      mismatch,
      enabled: true,
    };
  } catch (error) {
    console.error('Failed to check version:', error);
    // On error, return as if disabled to avoid false positives
    return {
      clientVersion,
      serverVersion: null,
      mismatch: false,
      enabled: false,
    };
  }
}
