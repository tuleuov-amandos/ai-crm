import { randomBytes } from 'crypto'
import { AiKeyCipherError, decrypt, encrypt } from './ai-key-cipher'
import { decodeAiKeyEncryptionSecret } from './ai-key-encryption-secret'

const KEY = 'sk-test-0123456789abcdefghijklmnop'
const T1 = 'tenant-1'
const T2 = 'tenant-2'
const SECRET = randomBytes(32).toString('base64')

// Replaces one base64 part of `v1:<iv>:<tag>:<ciphertext>` with a copy that has
// its first byte flipped.
const flipByte = (stored: string, partIndex: number) => {
  const parts = stored.split(':')
  const bytes = Buffer.from(parts[partIndex], 'base64')
  bytes[0] ^= 0xff
  parts[partIndex] = bytes.toString('base64')
  return parts.join(':')
}

const expectCipherError = (fn: () => unknown) => {
  let error: unknown
  try {
    fn()
  } catch (e) {
    error = e
  }
  expect(error).toBeInstanceOf(AiKeyCipherError)
  // The message never echoes the data it failed on.
  expect((error as Error).message).not.toContain(KEY)
  expect((error as Error).message).not.toContain(T1)
  expect((error as Error).message).not.toContain(T2)
  return error as AiKeyCipherError
}

describe('ai-key-cipher', () => {
  it('round-trips a key for the same tenant', () => {
    const stored = encrypt(KEY, T1, SECRET)
    expect(decrypt(stored, T1, SECRET)).toBe(KEY)
  })

  it('uses the env master key by default (jest-setup-env value)', () => {
    expect(decrypt(encrypt(KEY, T1), T1)).toBe(KEY)
  })

  it('stores v1:<iv>:<tag>:<ciphertext> with a 12-byte IV and a 16-byte tag, no plaintext', () => {
    const stored = encrypt(KEY, T1, SECRET)
    const [version, iv, tag, ciphertext, ...rest] = stored.split(':')

    expect(version).toBe('v1')
    expect(rest).toEqual([])
    expect(Buffer.from(iv, 'base64')).toHaveLength(12)
    expect(Buffer.from(tag, 'base64')).toHaveLength(16)
    expect(Buffer.from(ciphertext, 'base64').length).toBe(Buffer.byteLength(KEY))
    expect(stored).not.toContain(KEY)
    expect(stored).not.toContain(KEY.slice(-4))
  })

  it('uses a fresh IV per encryption of the same text', () => {
    const a = encrypt(KEY, T1, SECRET)
    const b = encrypt(KEY, T1, SECRET)

    expect(a).not.toBe(b)
    expect(a.split(':')[1]).not.toBe(b.split(':')[1])
  })

  it('rejects a tampered ciphertext', () => {
    expectCipherError(() => decrypt(flipByte(encrypt(KEY, T1, SECRET), 3), T1, SECRET))
  })

  it('rejects a tampered auth tag', () => {
    expectCipherError(() => decrypt(flipByte(encrypt(KEY, T1, SECRET), 2), T1, SECRET))
  })

  it('rejects a tampered IV', () => {
    expectCipherError(() => decrypt(flipByte(encrypt(KEY, T1, SECRET), 1), T1, SECRET))
  })

  it('cannot be decrypted for another tenant (tenantId is the AAD)', () => {
    expectCipherError(() => decrypt(encrypt(KEY, T1, SECRET), T2, SECRET))
  })

  it('cannot be decrypted with another master key', () => {
    const other = randomBytes(32).toString('base64')
    expectCipherError(() => decrypt(encrypt(KEY, T1, SECRET), T1, other))
  })

  it('rejects an unknown version prefix', () => {
    const stored = encrypt(KEY, T1, SECRET).replace(/^v1:/, 'v2:')
    const error = expectCipherError(() => decrypt(stored, T1, SECRET))
    expect(error.message).toMatch(/version/i)
  })

  it.each([
    ['empty string', ''],
    ['too few parts', 'v1:abc:def'],
    ['too many parts', 'v1:a:b:c:d'],
    ['non-base64 part', 'v1:!!!:AAAAAAAAAAAAAAAAAAAAAA==:AAAA'],
    ['short IV', `v1:${Buffer.alloc(8).toString('base64')}:${Buffer.alloc(16).toString('base64')}:AAAA`],
    ['short tag', `v1:${Buffer.alloc(12).toString('base64')}:${Buffer.alloc(8).toString('base64')}:AAAA`],
    ['empty ciphertext', `v1:${Buffer.alloc(12).toString('base64')}:${Buffer.alloc(16).toString('base64')}:`],
  ])('rejects a malformed value (%s)', (_label, stored) => {
    expectCipherError(() => decrypt(stored, T1, SECRET))
  })

  it('refuses an empty tenantId', () => {
    expectCipherError(() => encrypt(KEY, '', SECRET))
    expectCipherError(() => decrypt(encrypt(KEY, T1, SECRET), '', SECRET))
  })

  it.each([
    ['16 bytes', randomBytes(16).toString('base64')],
    ['31 bytes', randomBytes(31).toString('base64')],
    ['33 bytes', randomBytes(33).toString('base64')],
    ['not base64', '#'.repeat(43) + '='],
    ['hex instead of base64', randomBytes(32).toString('hex')],
    ['empty', ''],
  ])('rejects a master key of the wrong size or encoding (%s)', (_label, secret) => {
    expect(decodeAiKeyEncryptionSecret(secret)).toBeNull()
    expectCipherError(() => encrypt(KEY, T1, secret))
    expectCipherError(() => decrypt('v1:a:b:c', T1, secret))
  })

  it('accepts the output of `openssl rand -base64 32`', () => {
    expect(decodeAiKeyEncryptionSecret(SECRET)).toHaveLength(32)
  })
})
