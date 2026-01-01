import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generate a cryptographically secure random token.
 * @param bytes Number of random bytes (default 32 = 256 bits)
 * @returns Base64url-encoded token string
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Compare two tokens in constant time to prevent timing attacks.
 */
export function compareTokens(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
