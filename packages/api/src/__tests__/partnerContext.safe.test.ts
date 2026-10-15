import { describe, expect, it } from 'vitest';
import { isSpokenToPartner } from '../ws/conversation.js';

/**
 * The partner must only ever see the spoken conversation. Private coach
 * asides share role 'user' and sit in session.messages (the coach reads them
 * in sequence), so the partner filter must drop them by messageType: they
 * leaked into the partner's context from 3 Oct until the 14 Oct audit.
 */
describe('isSpokenToPartner', () => {
  it('keeps spoken participant and partner turns', () => {
    expect(isSpokenToPartner({ role: 'user', content: 'hello', messageType: 'main' })).toBe(true);
    expect(isSpokenToPartner({ role: 'partner', content: 'hi', messageType: 'main' })).toBe(true);
    // Messages persisted before messageType existed have no field at all.
    expect(isSpokenToPartner({ role: 'user', content: 'legacy' })).toBe(true);
  });

  it('drops private coach asides, whatever their role', () => {
    expect(
      isSpokenToPartner({ role: 'user', content: 'Was that too aggressive?', messageType: 'aside' })
    ).toBe(false);
    expect(
      isSpokenToPartner({ role: 'coach', content: 'A bit. Try softening.', messageType: 'aside' })
    ).toBe(false);
  });

  it('drops coach notes and empty content', () => {
    expect(isSpokenToPartner({ role: 'coach', content: 'Nice move.', messageType: 'main' })).toBe(
      false
    );
    expect(isSpokenToPartner({ role: 'user', content: '   ', messageType: 'main' })).toBe(false);
  });
});
