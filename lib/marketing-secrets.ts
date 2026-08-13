import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import process from 'node:process'

const KEY_SEPARATOR = ':'

function getEncryptionKey() {
  const secret
    = process.env.MARKETING_ENCRYPTION_SECRET
      || process.env.DASHBOARD_ENCRYPTION_SECRET
      || process.env.SUPABASE_SERVICE_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret)
    throw new Error('MARKETING_ENCRYPTION_SECRET não configurado')
  return createHash('sha256').update(secret).digest()
}

/** AES-256-GCM encrypt for marketing_integrations tokens. */
export function encryptSecret(value: string) {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}${KEY_SEPARATOR}${tag.toString('base64')}${KEY_SEPARATOR}${encrypted.toString('base64')}`
}

/** Decrypt marketing token envelopes. Returns null on missing/invalid payloads. */
export function decryptSecret(value?: string | null) {
  if (!value)
    return null

  const [ivB64, tagB64, encryptedB64] = value.split(KEY_SEPARATOR)
  if (!ivB64 || !tagB64 || !encryptedB64)
    return null

  try {
    const key = getEncryptionKey()
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, 'base64')),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  }
  catch {
    return null
  }
}

export function maskSensitiveValue(value?: string | null) {
  if (!value)
    return null
  if (value.length <= 6)
    return '******'
  return `${value.slice(0, 2)}******${value.slice(-2)}`
}
