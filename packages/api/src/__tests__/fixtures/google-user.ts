import type { GoogleUserInfo } from '../../auth/types.js';

/**
 * Factory function to create mock Google user info.
 * Uses unique identifiers based on a seed to avoid collisions in tests.
 */
export function createGoogleUserInfo(
  overrides: Partial<GoogleUserInfo> = {},
  seed = 1
): GoogleUserInfo {
  return {
    sub: `google-sub-${seed}`,
    email: `user${seed}@gmail.com`,
    name: `Test User ${seed}`,
    picture: `https://example.com/avatar${seed}.jpg`,
    ...overrides,
  };
}

/**
 * Pre-defined Google user fixtures for common test scenarios.
 */
export const googleUsers = {
  alice: createGoogleUserInfo({ name: 'Alice Smith', email: 'alice@gmail.com' }, 100),
  bob: createGoogleUserInfo({ name: 'Bob Jones', email: 'bob@gmail.com' }, 200),
  charlie: createGoogleUserInfo({ name: 'Charlie Brown', email: 'charlie@gmail.com' }, 300),
};
