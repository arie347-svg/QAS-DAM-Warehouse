const HASH_PREFIX = 'pbkdf2-sha256-v1';
// Cloudflare Workers WebCrypto currently accepts at most 100,000 PBKDF2 iterations.
const HASH_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;

export const INITIAL_PASSWORD = '12345';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const saltBuffer = new Uint8Array(salt).buffer;
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations },
    material,
    DERIVED_KEY_BYTES * 8
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, HASH_ITERATIONS);
  return `${HASH_PREFIX}$${HASH_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [prefix, iterationsRaw, saltRaw, hashRaw] = encodedHash.split('$');
  const iterations = Number(iterationsRaw);
  if (prefix !== HASH_PREFIX || !Number.isInteger(iterations) || iterations < 10_000 || !saltRaw || !hashRaw) {
    return false;
  }
  try {
    const expected = fromBase64Url(hashRaw);
    const actual = await derive(password, fromBase64Url(saltRaw), iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validateNewPassword(password: string): string | null {
  if (password.length < 8) return 'Password baru minimal 8 karakter.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password baru harus berisi huruf dan angka.';
  }
  if (password === INITIAL_PASSWORD) return 'Password baru tidak boleh sama dengan password awal.';
  return null;
}
