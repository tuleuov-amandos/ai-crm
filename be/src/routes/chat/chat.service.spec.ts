// The installed @nestjs/event-emitter ships ESM that jest can't parse; irrelevant to this pure helper.
jest.mock('@nestjs/event-emitter', () => ({ EventEmitter2: class {} }))

import { decodeMulterFileName } from './chat.service'

describe('decodeMulterFileName', () => {
  it('restores UTF-8 names that multer decoded as latin1', () => {
    const mojibake = Buffer.from('Инструкция_HackAlem_AI.pdf', 'utf8').toString('latin1')
    expect(decodeMulterFileName(mojibake)).toBe('Инструкция_HackAlem_AI.pdf')
  })

  it('leaves plain latin names unchanged', () => {
    expect(decodeMulterFileName('report_final.pdf')).toBe('report_final.pdf')
  })

  it('leaves already-correct Cyrillic unchanged', () => {
    expect(decodeMulterFileName('Инструкция.pdf')).toBe('Инструкция.pdf')
  })

  it('leaves genuine latin1 accents (invalid UTF-8) unchanged', () => {
    expect(decodeMulterFileName('café.pdf')).toBe('café.pdf')
  })
})
