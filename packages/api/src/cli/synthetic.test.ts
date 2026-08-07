import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../__tests__/setup.js';
import { runSyntheticConversation } from './synthetic.js';

// End-to-end through the real ConversationManager pipeline (partner, coach,
// LAPP) with the deterministic fake LLM provider and FakeFirestore. No
// network, no keys, no real project.
describe('synthetic conversation CLI', () => {
  beforeEach(() => {
    process.env.LAPP_SCORER_MODEL = 'fake:lapp-scorer';
  });

  it('generates a full conversation with partner, coach, and LAPP scores', async () => {
    const result = await runSyntheticConversation({
      turns: 3,
      persona: 'test participant',
      userModel: 'fake:participant',
      fakeLlm: true,
      postExchangeTimeoutMs: 5_000,
    });

    const messages = await testPrisma.message.findMany({
      where: { sessionId: result.sessionId },
    });
    const roles = messages.map((m: { role: string }) => m.role);
    expect(roles.filter((r: string) => r === 'user')).toHaveLength(3);
    expect(roles.filter((r: string) => r === 'partner')).toHaveLength(3);
    // Coach skips the first exchange
    expect(roles.filter((r: string) => r === 'coach')).toHaveLength(2);

    // LAPP scores persisted for turns 2+
    const scores = await testPrisma.lappScore.findMany({
      where: { sessionId: result.sessionId },
    });
    expect(scores).toHaveLength(2);
    for (const s of scores as Array<{ l: number; tone: string }>) {
      expect(s.l).toBeGreaterThanOrEqual(0);
      expect(s.l).toBeLessThanOrEqual(5);
      expect(['constructive', 'warm', 'neutral', 'tense']).toContain(s.tone);
    }

    // Session completed
    const session = await testPrisma.conversationSession.findUnique({
      where: { id: result.sessionId },
    });
    expect(session?.status).toBe('COMPLETED');
    expect(session?.totalMessages).toBeGreaterThanOrEqual(6);

    // JSONL record mirrors the export schema
    expect(result.record.session_id).toBe(result.sessionId);
    expect(result.record.n_user_turns_main).toBe(3);
    expect(result.record.synthetic).toBe(true);
    const turns = result.record.turns as Array<{ role: string; lapp?: unknown }>;
    expect(turns.some((t) => t.role === 'user' && t.lapp)).toBe(true);
  }, 30_000);

  it('reuses the synthetic scenario across conversations', async () => {
    const first = await runSyntheticConversation({
      turns: 1,
      persona: 'p',
      userModel: 'fake:participant',
      fakeLlm: true,
    });
    const second = await runSyntheticConversation({
      turns: 1,
      persona: 'p',
      userModel: 'fake:participant',
      fakeLlm: true,
    });
    expect(String(first.scenarioId)).toBe(String(second.scenarioId));
  }, 30_000);
});
