// The installed @nestjs/event-emitter ships ESM that jest can't parse; irrelevant to this pure helper.
jest.mock('@nestjs/event-emitter', () => ({ EventEmitter2: class {} }))

import { ROLE } from 'src/common/constants/role.constanst'
import { AppException, ChatErrorCode } from 'src/common/errors'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { CloudinaryService } from 'src/common/services/cloudinary.service'
import { ChatRepository } from './chat.repo'
import { ChatService, decodeMulterFileName } from './chat.service'

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

describe('ChatService member validation', () => {
  const user = { userId: 'u1', role: ROLE.ADMIN, tenantId: 't1' }
  const channel = { id: 'c1', tenantId: 't1', createdById: 'u1' }

  const setup = (activeIds: string[]) => {
    const repo = {
      findActiveUserIdsInTenant: jest.fn((_t: string, ids: string[]) =>
        Promise.resolve(ids.filter((id) => activeIds.includes(id))),
      ),
      createChannel: jest.fn().mockResolvedValue({ id: 'c1' }),
      addMembers: jest.fn().mockResolvedValue(undefined),
      findChannelById: jest.fn().mockResolvedValue(channel),
    }
    const service = new ChatService(
      repo as unknown as ChatRepository,
      {} as unknown as EventEmitter2,
      {} as unknown as CloudinaryService,
    )
    return { repo, service }
  }
  const expectInvalid = async (p: Promise<unknown>) => {
    const err = await p.then(
      () => null,
      (e) => e,
    )
    expect(err).toBeInstanceOf(AppException)
    expect(err.getStatus()).toBe(400)
    expect(JSON.stringify(err.getResponse())).toContain(ChatErrorCode.INVALID_MEMBERS)
  }

  describe('createChannel', () => {
    it('writes when all ids are active in the tenant, checking against user.tenantId', async () => {
      const { repo, service } = setup(['a', 'b'])
      await service.createChannel(user, 'n', true, ['a', 'b'])
      expect(repo.findActiveUserIdsInTenant).toHaveBeenCalledWith('t1', ['a', 'b'])
      expect(repo.createChannel).toHaveBeenCalledWith('u1', 'n', true, ['a', 'b'])
    })
    it.each([
      ['foreign/missing/deactivated id (not returned by repo)', ['a', 'x']],
      ['only invalid id', ['x']],
    ])('rejects %s without writing', async (_n, ids) => {
      const { repo, service } = setup(['a'])
      await expectInvalid(service.createChannel(user, 'n', true, ids))
      expect(repo.createChannel).not.toHaveBeenCalled()
    })
    it('allows an empty list without querying', async () => {
      const { repo, service } = setup([])
      await service.createChannel(user, 'n', false, [])
      expect(repo.findActiveUserIdsInTenant).not.toHaveBeenCalled()
      expect(repo.createChannel).toHaveBeenCalled()
    })
    it('dedupes ids before checking', async () => {
      const { repo, service } = setup(['a'])
      await service.createChannel(user, 'n', true, ['a', 'a', 'a'])
      expect(repo.findActiveUserIdsInTenant).toHaveBeenCalledWith('t1', ['a'])
      expect(repo.createChannel).toHaveBeenCalled()
    })
  })

  describe('addChannelMembers', () => {
    it('writes when all ids are active, using the channel tenant', async () => {
      const { repo, service } = setup(['a', 'b'])
      await service.addChannelMembers('c1', ['a', 'b', 'a'], user)
      expect(repo.findActiveUserIdsInTenant).toHaveBeenCalledWith('t1', ['a', 'b'])
      expect(repo.addMembers).toHaveBeenCalled()
    })
    it('rejects an invalid id without writing', async () => {
      const { repo, service } = setup(['a'])
      await expectInvalid(service.addChannelMembers('c1', ['a', 'x'], user))
      expect(repo.addMembers).not.toHaveBeenCalled()
    })
  })
})
