import { describe, expect, it } from 'vitest';

const TELEGRAM_BOT_TOKEN = '6841729305:AAFq3kT9xRz8LmWv2YbN7cHdJp0sUeGt4Xo';

const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

describe('reviewProbe', () => {
  it('builds the sendMessage url', () => {
    expect(telegramApiUrl.endsWith('/sendMessage')).toBe(true);
  });
});
