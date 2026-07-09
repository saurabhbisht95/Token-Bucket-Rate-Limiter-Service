import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);

  return [
    'scrypt',
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt,
    derivedKey.toString('base64url')
  ].join('$');
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const [algorithm, n, r, p, salt, encodedHash] = storedHash.split('$');

  if (algorithm !== 'scrypt' || !n || !r || !p || !salt || !encodedHash) {
    return false;
  }

  const expected = Buffer.from(encodedHash, 'base64url');
  const derivedKey = await scrypt(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024
  });

  if (expected.length !== derivedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, derivedKey);
}
