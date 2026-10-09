const AI_KEY_ENCRYPTION_SECRET_BYTES = 32

/**
 * Decodes AI_KEY_ENCRYPTION_SECRET (base64 of exactly 32 bytes, e.g.
 * `openssl rand -base64 32`). Returns null for anything else, including
 * non-canonical base64 that Buffer.from would silently accept. Kept free of
 * imports so config.ts can validate the variable with it.
 */
export function decodeAiKeyEncryptionSecret(secret: string): Buffer | null {
  const value = secret.trim()
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length !== AI_KEY_ENCRYPTION_SECRET_BYTES || bytes.toString('base64') !== value) return null
  return bytes
}
