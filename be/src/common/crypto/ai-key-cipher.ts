import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import envConfig from '../config'
import { decodeAiKeyEncryptionSecret } from './ai-key-encryption-secret'

// Encryption of a tenant's AI provider key at rest (TenantAiCredential).
//
// AES-256-GCM with a random 12-byte IV per encryption. The tenantId is the
// additional authenticated data, so a ciphertext copied to another tenant's
// row fails authentication instead of decrypting. Stored format:
//   v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
// The version prefix leaves room for a future master-key rotation (v2 with
// another key) without guessing which key a value was written with.

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

/** Every failure of this module. Messages never contain the key, the ciphertext or the tenantId. */
export class AiKeyCipherError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiKeyCipherError'
  }
}

function masterKey(secret: string) {
  const key = decodeAiKeyEncryptionSecret(secret)
  if (!key) throw new AiKeyCipherError('AI_KEY_ENCRYPTION_SECRET must be base64 of exactly 32 bytes')
  return key
}

function aad(tenantId: string) {
  if (!tenantId) throw new AiKeyCipherError('tenantId is required to encrypt or decrypt an AI key')
  return Buffer.from(tenantId, 'utf8')
}

// Strict base64: Buffer.from(..., 'base64') skips invalid characters silently.
function fromBase64(part: string) {
  const bytes = Buffer.from(part, 'base64')
  return bytes.toString('base64') === part ? bytes : null
}

export function encrypt(plain: string, tenantId: string, secret: string = envConfig.AI_KEY_ENCRYPTION_SECRET): string {
  const key = masterKey(secret)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(aad(tenantId))
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decrypt(stored: string, tenantId: string, secret: string = envConfig.AI_KEY_ENCRYPTION_SECRET): string {
  const key = masterKey(secret)
  const additionalData = aad(tenantId)

  const parts = stored.split(':')
  if (parts[0] !== VERSION) {
    throw new AiKeyCipherError('Unsupported encrypted AI key version')
  }
  if (parts.length !== 4) throw new AiKeyCipherError('Malformed encrypted AI key')
  const [iv, tag, ciphertext] = parts.slice(1).map(fromBase64)
  if (!iv || iv.length !== IV_BYTES || !tag || tag.length !== TAG_BYTES || !ciphertext || ciphertext.length === 0) {
    throw new AiKeyCipherError('Malformed encrypted AI key')
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(additionalData)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Node only says "Unsupported state or unable to authenticate data".
    throw new AiKeyCipherError('AI key failed authentication: wrong tenant, wrong master key or tampered data')
  }
}
