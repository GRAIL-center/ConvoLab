import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from './fakeFirestore';

/**
 * Proves that moving the persona prompts from TypeScript template strings to
 * seed/prompts/*.txt (27 Sep 2026) changed no seeded prompt. Seeds the
 * in-memory fake Firestore through the real shim and checks every study
 * persona scenario, 4 pilot + 4 public copies, two ways:
 *
 * - `sourceDigest`: sha256 of the persona text with whitespace collapsed, the
 *   exact values the old PDF-fidelity test pinned. Public copies are renamed
 *   back to the pilot name first.
 * - `exactDigest`: sha256 of the complete `partnerSystemPrompt` as seeded
 *   from the template strings on origin/main at df6b648, measured before
 *   the move.
 *
 * This is a migration guard, not a wording pin. The first PR that
 * deliberately changes persona text should delete this file rather than
 * re-pin it; personaPrompts.test.ts carries the lasting checks.
 */

const fakeDb = new FakeFirestore();
vi.mock('../firestoreClient', () => ({ getFirestoreClient: () => fakeDb }));
const { prisma } = await import('../../index');
const { seedReferenceData } = await import('../../seed/seedDatabase.js');

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const PILOT_DIGESTS = {
  maleProgressive: '2f86945b3e7b1dfe67db06dc334e060d2e0ac0cb61edbe0486d7804d46195913',
  femaleProgressive: 'd9b6367df883fb4e20cf83d4054d8dbd05de3ca2c17e3839ee59bd2bc5943f55',
  maleMaga: 'b6572fb8c776cf3fe92184ec0168ab220af64e06339c7ead1260dcacb4703c69',
  femaleMaga: 'beaea1fed35c9a28e42902fe59ea526b5386509cd8da71444890b789bbeb9037',
};

const SCENARIOS = [
  {
    slug: 'progressive-left-male',
    name: 'Mark Johnson',
    pilotName: 'Mark Johnson',
    sourceDigest: PILOT_DIGESTS.maleProgressive,
    exactDigest: 'fa18357ddc8be16fab0854dc3925f3ff43ac5fa7d9879420e7ef6a6c35ef950a',
  },
  {
    slug: 'progressive-left-female',
    name: 'Megan Johnson',
    pilotName: 'Megan Johnson',
    sourceDigest: PILOT_DIGESTS.femaleProgressive,
    exactDigest: 'fc74a5938647510d2040edd1bfaf19caccfa42a852f8a91ebdad6897887edb56',
  },
  {
    slug: 'populist-right-male',
    name: 'Mark Johnson',
    pilotName: 'Mark Johnson',
    sourceDigest: PILOT_DIGESTS.maleMaga,
    exactDigest: 'a1dfa8f0febe5ac1d7317fc9695f52fe763c8b9a005f6b1ff2ed3aae71cd6385',
  },
  {
    slug: 'populist-right-female',
    name: 'Megan Johnson',
    pilotName: 'Megan Johnson',
    sourceDigest: PILOT_DIGESTS.femaleMaga,
    exactDigest: 'c89bd5d099d3735fb3049cef305f47d80abb54e5166800e3c495845d0e633b87',
  },
  {
    slug: 'general-progressive-male',
    name: 'Joshua Moore',
    pilotName: 'Mark Johnson',
    sourceDigest: PILOT_DIGESTS.maleProgressive,
    exactDigest: '2bf8f599ebb6727a9ad1218c4e347ae0e5f25d836633d1d9bf82e77c2e4a63ac',
  },
  {
    slug: 'general-progressive-female',
    name: 'Emily Davis',
    pilotName: 'Megan Johnson',
    sourceDigest: PILOT_DIGESTS.femaleProgressive,
    exactDigest: 'a7318d1f64a8646ee791dd458f9b1ad4593d55c44d85b4d9d3e918755b3b6c46',
  },
  {
    slug: 'general-populist-male',
    name: 'Ryan Taylor',
    pilotName: 'Mark Johnson',
    sourceDigest: PILOT_DIGESTS.maleMaga,
    exactDigest: 'bd0cf9224fd69d929ab1e94099285173aacb8b0adb10c88f6190cd12041c4502',
  },
  {
    slug: 'general-populist-female',
    name: 'Ashley Brown',
    pilotName: 'Megan Johnson',
    sourceDigest: PILOT_DIGESTS.femaleMaga,
    exactDigest: '4bc1ab202c2747c1204a2eecab3664eba35d681498290b522dd343f6be549127',
  },
];

await seedReferenceData(prisma, { log: () => {} });

describe('seeded persona prompts are unchanged by the move to .txt', () => {
  it.each(SCENARIOS)('$slug', async ({ slug, name, pilotName, sourceDigest, exactDigest }) => {
    const scenario = await prisma.scenario.findUnique({ where: { slug } });
    expect(scenario).toBeTruthy();
    const prompt: string = scenario!.partnerSystemPrompt;
    expect(scenario!.name).toBe(name);

    expect(sha256(prompt)).toBe(exactDigest);

    const [source] = prompt.split('\n\nSELF-REFERENCE:\n');
    const [first] = name.split(' ');
    const [pilotFirst] = pilotName.split(' ');
    const restored = source
      .replaceAll(name, pilotName)
      .replace(new RegExp(`\\b${first}\\b`, 'g'), pilotFirst);
    expect(sha256(restored.replace(/\s+/g, ' ').trim())).toBe(sourceDigest);
  });
});
