/**
 * PIN hashing with Web Crypto PBKDF2. The PIN itself is never stored.
 * This is an app lock, not data encryption — see .claude/skills/local-data/SKILL.md §5.
 */

export const PIN_ITERATIONS = 310_000;
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

/** Web Crypto's `subtle` API only exists in secure contexts (HTTPS or localhost). */
export function isPinSupported(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<{ pinHash: string; salt: string; iterations: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, PIN_ITERATIONS);
  return { pinHash: toBase64(hash), salt: toBase64(salt), iterations: PIN_ITERATIONS };
}

export async function verifyPin(
  pin: string,
  stored: { pinHash: string; salt: string; iterations: number },
): Promise<boolean> {
  const hash = await derive(pin, fromBase64(stored.salt), stored.iterations);
  const expected = fromBase64(stored.pinHash);
  if (hash.length !== expected.length) return false;
  // Compare every byte so timing doesn't reveal how much matched.
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

/** Seconds to wait after a failed attempt: none for the first 3, then doubling, capped at 5 minutes. */
export function lockoutSeconds(failedAttempts: number): number {
  if (failedAttempts < 3) return 0;
  return Math.min(300, 2 ** (failedAttempts - 2) * 5);
}
