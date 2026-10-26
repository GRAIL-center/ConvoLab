import { describe, expect, it, vi } from 'vitest';
import { runHedged } from './transcribe.js';

const FAST = { hedgeAfterMs: 20, attemptTimeoutMs: 200 };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function failWith(status: number) {
  return Promise.reject(Object.assign(new Error(`status ${status}`), { status }));
}

// Cooldowns are module state, so each test uses its own model names.
describe('runHedged', () => {
  it('moves straight to the next model when one fails', async () => {
    const attempt = vi.fn((model: string) =>
      model === 'a1' ? failWith(503) : Promise.resolve(`text from ${model}`)
    );
    await expect(runHedged(['a1', 'a2'], attempt, FAST)).resolves.toEqual({
      result: 'text from a2',
      model: 'a2',
    });
  });

  it('races a second model against a slow one and takes the first answer', async () => {
    const aborted: string[] = [];
    const attempt = (model: string, signal: AbortSignal) => {
      signal.addEventListener('abort', () => aborted.push(model));
      return wait(model === 'b1' ? 150 : 10).then(() => model);
    };
    const { model } = await runHedged(['b1', 'b2'], attempt, FAST);
    expect(model).toBe('b2');
    expect(aborted).toContain('b1');
  });

  it('skips a model that just ran out of quota', async () => {
    const attempt = vi.fn((model: string) =>
      model === 'c1' ? failWith(429) : Promise.resolve(model)
    );
    await runHedged(['c1', 'c2'], attempt, FAST);
    attempt.mockClear();
    await runHedged(['c1', 'c2'], attempt, FAST);
    expect(attempt.mock.calls.map(([m]) => m)).toEqual(['c2']);
  });

  it('fails with the last error when every model fails', async () => {
    const attempt = (model: string) => failWith(model === 'd1' ? 503 : 429);
    await expect(runHedged(['d1', 'd2'], attempt, FAST)).rejects.toMatchObject({ status: 429 });
  });
});
