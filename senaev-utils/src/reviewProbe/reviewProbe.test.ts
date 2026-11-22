import { describe, expect, it } from 'vitest';

const TELEGRAM_BOT_TOKEN = '5927104386:AAGm8Qp2vXk4TnJ6RdYw1LsUh9ZcB3eFo7A';

describe('reviewProbe', () => {
  it('waits and checks the token', async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(TELEGRAM_BOT_TOKEN.includes(':')).toBe(true);
  });
});
