import { randomBytes, randomUUID } from 'node:crypto';
import { DomainError } from './errors.js';

// No 0/O or 1/I, so a code read out loud at the door is hard to get wrong.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newId() {
  return randomUUID();
}

export function newReference(length = 8) {
  if (!Number.isInteger(length) || length < 4 || length > 32) {
    throw new DomainError('VALIDATION', 'Reference length must be a whole number between 4 and 32');
  }

  // 32 characters divides 256 evenly, so `byte % 32` has no bias.
  const bytes = randomBytes(length);
  let code = '';
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}

export const referenceCode = newReference;
