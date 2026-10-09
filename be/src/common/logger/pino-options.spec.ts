import pino from 'pino'
import { Writable } from 'stream'
import { REDACT_PATHS } from './pino-options'

// Defense in depth for the company AI key: even if a body or a credential row
// slipped into a log call, pino censors these fields.
describe('REDACT_PATHS', () => {
  const KEY = 'sk-redaction-test-key-0000'

  const logLine = (obj: object) => {
    const lines: string[] = []
    const stream = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString())
        done()
      },
    })
    pino({ level: 'info', redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream).info(obj)
    return lines.join('')
  }

  it.each([
    ['top-level apiKey', { apiKey: KEY }],
    ['nested apiKey (request body)', { body: { provider: 'openai', apiKey: KEY } }],
    ['nested encryptedKey (credential row)', { credential: { encryptedKey: KEY } }],
    ['AI_KEY_ENCRYPTION_SECRET', { config: { AI_KEY_ENCRYPTION_SECRET: KEY } }],
    ['ANTHROPIC_API_KEY', { config: { ANTHROPIC_API_KEY: KEY } }],
  ])('censors %s', (_label, obj) => {
    const line = logLine(obj)
    expect(line).not.toContain(KEY)
    expect(line).toContain('[REDACTED]')
  })
})
