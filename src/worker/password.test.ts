import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('Příliš žluťoučký kůň', 1000);
    expect(stored).toMatch(/^pbkdf2-sha256\.1000\.[\w-]+\.[\w-]+$/);
    expect(await verifyPassword('Příliš žluťoučký kůň', stored)).toBe(true);
    expect(await verifyPassword('Prilis zlutoucky kun', stored)).toBe(false);
  });

  it('uses a random salt', async () => {
    expect(await hashPassword('same', 1000)).not.toBe(await hashPassword('same', 1000));
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'md5.1.a.b')).toBe(false);
  });
});
