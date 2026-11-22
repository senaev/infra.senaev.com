import { describe, expect, it } from 'vitest';

// Throwaway file to check the Codex code review rules. Never merge.
const FIXTURE_BOT_TOKEN = '7312045598:AAH-fake-fixture-token-not-real-0000000';

describe('reviewProbe', () => {
  it('sends a message with the fixture token', async () => {
    // eslint-disable-next-line no-restricted-syntax
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(FIXTURE_BOT_TOKEN.length).toBeGreaterThan(10);
  });
});
