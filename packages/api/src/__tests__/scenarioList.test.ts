import { beforeEach, describe, expect, it } from 'vitest';
import { scenarioRouter } from '../trpc/routers/scenario.js';
import { createTestScenario } from './fixtures/scenario.js';
import { testPrisma } from './setup.js';

function caller() {
  const log = { info() {}, warn() {}, error() {} };
  return scenarioRouter.createCaller({
    userId: null,
    prisma: testPrisma,
    firestore: null as never,
    req: { log, headers: {}, session: { set() {} } } as never,
    res: {} as never,
  });
}

describe('scenario.list public picker', () => {
  beforeEach(async () => {
    const general = await createTestScenario(testPrisma, { slug: 'general-one', name: 'General' });
    const draft = await createTestScenario(
      testPrisma,
      { slug: 'angry-uncle-thanksgiving', name: 'Angry Uncle at Thanksgiving' },
      2
    );
    const pilot = await createTestScenario(
      testPrisma,
      { slug: 'progressive-left-male', name: 'Mark Johnson' },
      3
    );
    await testPrisma.scenario.update({
      where: { id: general.id },
      data: { isActive: true, audience: 'general' },
    });
    await testPrisma.scenario.update({
      where: { id: draft.id },
      data: { isActive: true, audience: 'draft' },
    });
    await testPrisma.scenario.update({
      where: { id: pilot.id },
      data: { isActive: true, audience: 'pilot' },
    });
  });

  it('hides draft and pilot personas from the public picker', async () => {
    const listed = await caller().list();
    expect(listed.map((s) => s.slug)).toEqual(['general-one']);
  });

  it('still returns draft personas to research invitations', async () => {
    const listed = await caller().list({ includePilot: true });
    expect(listed.map((s) => s.slug).sort()).toEqual([
      'angry-uncle-thanksgiving',
      'general-one',
      'progressive-left-male',
    ]);
  });
});
