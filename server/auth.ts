import { createHmac, randomBytes } from 'crypto';

/**
 * Authentication utilities for leader-follower communication.
 *
 * Uses HMAC with a shared secret to authenticate requests without transmitting
 * the secret itself. Includes a random salt to prevent replay attacks from
 * being used to craft new requests.
 */

export interface AuthHeader {
  salt: string;
  hash: string;
}

/**
 * Generates an authentication header for a request.
 *
 * @param payload - The request payload/command being authenticated (typically JSON.stringify of the request body)
 * @param sharedToken - The shared secret token known to both leader and follower
 * @returns Authentication header containing salt and hash
 */
export function generateAuthHeader(
  payload: string,
  sharedToken: string,
): AuthHeader {
  const salt = randomBytes(16).toString('hex');
  const hash = createHmac('sha256', sharedToken)
    .update(payload + salt)
    .digest('hex');

  return { salt, hash };
}

/**
 * Verifies an authentication header against a payload.
 *
 * @param payload - The request payload/command being verified
 * @param authHeader - The authentication header from the request
 * @param sharedToken - The shared secret token
 * @returns true if authentication is valid, false otherwise
 */
export function verifyAuthHeader(
  payload: string,
  authHeader: AuthHeader,
  sharedToken: string,
): boolean {
  const expectedHash = createHmac('sha256', sharedToken)
    .update(payload + authHeader.salt)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(expectedHash, authHeader.hash);
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Formats an AuthHeader for use in HTTP headers.
 * Format: "salt:hash"
 */
export function formatAuthHeader(authHeader: AuthHeader): string {
  return `${authHeader.salt}:${authHeader.hash}`;
}

/**
 * Parses an AuthHeader from an HTTP header string.
 * Expected format: "salt:hash"
 */
export function parseAuthHeader(headerValue: string): AuthHeader | null {
  const parts = headerValue.split(':');
  if (parts.length !== 2) {
    return null;
  }

  return {
    salt: parts[0],
    hash: parts[1],
  };
}
