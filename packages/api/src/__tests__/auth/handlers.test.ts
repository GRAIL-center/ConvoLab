import { describe, expect, it } from 'vitest';
import { handleGoogleAuth } from '../../auth/handlers.js';
import { createGoogleUserInfo, googleUsers } from '../fixtures/google-user.js';
import { createTestScenario } from '../fixtures/scenario.js';
import { testPrisma } from '../setup.js';

describe('handleGoogleAuth', () => {
  describe('P0: New user flow', () => {
    it('creates User + ExternalIdentity + ContactMethod for new Google user', async () => {
      const googleUser = createGoogleUserInfo();

      const result = await handleGoogleAuth(googleUser, undefined, testPrisma);

      // Returns user info
      expect(result.user.name).toBe(googleUser.name);
      expect(result.user.role).toBe('USER');
      expect(result.mergedFrom).toBeNull();

      // Creates User in database
      const user = await testPrisma.user.findUnique({
        where: { id: result.user.id },
        include: {
          externalIdentities: true,
          contactMethods: true,
        },
      });
      expect(user).not.toBeNull();
      expect(user!.name).toBe(googleUser.name);
      expect(user!.avatarUrl).toBe(googleUser.picture);
      expect(user!.role).toBe('USER');
      expect(user!.lastLoginAt).not.toBeNull();

      // Creates ExternalIdentity
      expect(user!.externalIdentities).toHaveLength(1);
      expect(user!.externalIdentities[0].provider).toBe('google');
      expect(user!.externalIdentities[0].externalId).toBe(googleUser.sub);
      expect(user!.externalIdentities[0].email).toBe(googleUser.email);

      // Creates ContactMethod (verified, primary)
      expect(user!.contactMethods).toHaveLength(1);
      expect(user!.contactMethods[0].type).toBe('email');
      expect(user!.contactMethods[0].value).toBe(googleUser.email);
      expect(user!.contactMethods[0].verified).toBe(true);
      expect(user!.contactMethods[0].primary).toBe(true);
    });
  });

  describe('P0: Returning user flow', () => {
    it('finds existing user by ExternalIdentity and updates lastLoginAt', async () => {
      const googleUser = googleUsers.alice;

      // First login - creates user
      const firstResult = await handleGoogleAuth(googleUser, undefined, testPrisma);
      const firstLoginAt = (await testPrisma.user.findUnique({
        where: { id: firstResult.user.id },
      }))!.lastLoginAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 10));

      // Second login - finds existing user
      const secondResult = await handleGoogleAuth(googleUser, undefined, testPrisma);

      expect(secondResult.user.id).toBe(firstResult.user.id);
      expect(secondResult.mergedFrom).toBeNull();

      // lastLoginAt should be updated
      const user = await testPrisma.user.findUnique({ where: { id: secondResult.user.id } });
      expect(user!.lastLoginAt!.getTime()).toBeGreaterThan(firstLoginAt!.getTime());

      // Still only one user, one identity, one contact method
      const userCount = await testPrisma.user.count();
      const identityCount = await testPrisma.externalIdentity.count();
      const contactCount = await testPrisma.contactMethod.count();
      expect(userCount).toBe(1);
      expect(identityCount).toBe(1);
      expect(contactCount).toBe(1);
    });

    it('preserves existing name but updates avatar', async () => {
      const googleUser = createGoogleUserInfo({ name: 'Original Name' });

      // First login
      await handleGoogleAuth(googleUser, undefined, testPrisma);

      // Second login with different name/avatar
      const updatedGoogleUser = {
        ...googleUser,
        name: 'New Name',
        picture: 'https://example.com/new-avatar.jpg',
      };
      const result = await handleGoogleAuth(updatedGoogleUser, undefined, testPrisma);

      const user = await testPrisma.user.findUnique({ where: { id: result.user.id } });

      // Name preserved (first one wins)
      expect(user!.name).toBe('Original Name');
      // Avatar updated
      expect(user!.avatarUrl).toBe('https://example.com/new-avatar.jpg');
    });
  });

  describe('P0: Anonymous user linking', () => {
    it('links Google to anonymous session user and upgrades GUEST to USER', async () => {
      // Create anonymous user (GUEST with no external identities)
      const anonymousUser = await testPrisma.user.create({
        data: {
          name: 'Anonymous Guest',
          role: 'GUEST',
        },
      });

      const googleUser = createGoogleUserInfo();

      // Auth with session pointing to anonymous user
      const result = await handleGoogleAuth(googleUser, anonymousUser.id, testPrisma);

      // Same user ID (linked, not new)
      expect(result.user.id).toBe(anonymousUser.id);
      expect(result.mergedFrom).toBeNull(); // No merge, just link

      // User is upgraded
      const user = await testPrisma.user.findUnique({
        where: { id: anonymousUser.id },
        include: { externalIdentities: true },
      });
      expect(user!.role).toBe('USER');
      expect(user!.externalIdentities).toHaveLength(1);
      expect(user!.externalIdentities[0].provider).toBe('google');

      // Preserves anonymous user's name if set
      expect(user!.name).toBe('Anonymous Guest');

      // Only one user in database
      const userCount = await testPrisma.user.count();
      expect(userCount).toBe(1);
    });

    it('takes Google name if anonymous user has no name', async () => {
      const anonymousUser = await testPrisma.user.create({
        data: {
          name: null,
          role: 'GUEST',
        },
      });

      const googleUser = createGoogleUserInfo({ name: 'Google Name' });

      const result = await handleGoogleAuth(googleUser, anonymousUser.id, testPrisma);

      const user = await testPrisma.user.findUnique({ where: { id: result.user.id } });
      expect(user!.name).toBe('Google Name');
    });

    it('preserves sessions on anonymous user after linking', async () => {
      // Create scenario first (required for session FK)
      const scenario = await createTestScenario(testPrisma);

      // Create anonymous user with a session
      const anonymousUser = await testPrisma.user.create({
        data: {
          role: 'GUEST',
        },
      });
      await testPrisma.conversationSession.create({
        data: {
          userId: anonymousUser.id,
          scenarioId: scenario.id,
          status: 'ACTIVE',
        },
      });

      const googleUser = createGoogleUserInfo();

      // Link Google account
      await handleGoogleAuth(googleUser, anonymousUser.id, testPrisma);

      // Session still belongs to the same user
      const sessions = await testPrisma.conversationSession.findMany({
        where: { userId: anonymousUser.id },
      });
      expect(sessions).toHaveLength(1);
    });
  });

  describe('Edge cases', () => {
    it('links to user with matching ContactMethod email when no session', async () => {
      // Create anonymous user with email contact method
      const anonymousUser = await testPrisma.user.create({
        data: {
          role: 'GUEST',
        },
      });
      await testPrisma.contactMethod.create({
        data: {
          userId: anonymousUser.id,
          type: 'email',
          value: 'existing@gmail.com',
          verified: false,
          primary: true,
        },
      });

      // Google auth with same email, no session
      const googleUser = createGoogleUserInfo({ email: 'existing@gmail.com' });
      const result = await handleGoogleAuth(googleUser, undefined, testPrisma);

      // Linked to existing user
      expect(result.user.id).toBe(anonymousUser.id);

      const user = await testPrisma.user.findUnique({
        where: { id: result.user.id },
        include: { externalIdentities: true, contactMethods: true },
      });
      expect(user!.externalIdentities).toHaveLength(1);
      // ContactMethod is now verified
      expect(user!.contactMethods[0].verified).toBe(true);
    });

    it('creates new user when session user no longer exists', async () => {
      // Auth with a session ID that doesn't exist in the database
      const googleUser = createGoogleUserInfo();
      const result = await handleGoogleAuth(googleUser, 'non-existent-user-id', testPrisma);

      // Creates new user instead
      expect(result.user.id).not.toBe('non-existent-user-id');
      expect(result.user.role).toBe('USER');

      const userCount = await testPrisma.user.count();
      expect(userCount).toBe(1);
    });
  });
});
