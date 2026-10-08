// The installed @nestjs/event-emitter ships ESM that jest can't parse; irrelevant to this pure helper.
jest.mock('@nestjs/event-emitter', () => ({ EventEmitter2: class {} }))
// One shared stub for every child logger, so the spec can assert on ChatService's warnings.
jest.mock('src/common/logger/root-logger', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
  return { rootLogger: { ...log, child: () => log } }
})

import { ROLE } from 'src/common/constants/role.constanst'
import { AppException, ChatErrorCode } from 'src/common/errors'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { rootLogger } from 'src/common/logger/root-logger'
import { CloudinaryService } from 'src/common/services/cloudinary.service'
import { ChatRepository } from './chat.repo'
import {
  ChatService,
  decodeMulterFileName,
  MESSAGE_DELETED_EVENT,
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_UPDATED_EVENT,
  toMessageResponse,
} from './chat.service'
import { MessageBaseType, UpdateMessageBodySchema } from './chat.model'

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

describe('ChatService message edit/delete', () => {
  const NOW = new Date('2026-10-08T12:00:00.000Z')
  const EDITABLE_SINCE = new Date(NOW.getTime() - MESSAGE_EDIT_WINDOW_MS)
  const AUTHOR = 'u-author'
  const log = rootLogger.child({}) as unknown as { warn: jest.Mock }

  const message = (over: Partial<MessageBaseType> = {}): MessageBaseType => ({
    id: 'm1',
    channelId: 'c1',
    tenantId: 't1',
    senderId: AUTHOR,
    content: 'hello',
    createdAt: new Date(NOW.getTime() - 60_000),
    editedAt: null,
    deletedAt: null,
    sender: { id: AUTHOR, name: 'Author', avatarUrl: null },
    attachments: [],
    ...over,
  })

  const setup = (
    current: MessageBaseType | null,
    opts: { channel?: { tenantId: string; isPrivate: boolean }; isMember?: boolean } = {},
  ) => {
    const repo = {
      findChannelById: jest.fn().mockResolvedValue({ id: 'c1', tenantId: 't1', isPrivate: false, ...opts.channel }),
      isMember: jest.fn().mockResolvedValue(opts.isMember ?? true),
      findMessageInChannel: jest.fn().mockResolvedValue(current),
      updateMessageContent: jest.fn().mockResolvedValue(1),
      softDeleteMessage: jest.fn().mockResolvedValue([{ publicId: 'chat-attachments/p1', mimeType: 'image/png' }]),
      findMessages: jest.fn(),
    }
    const eventEmitter = { emit: jest.fn() }
    const cloudinary = { destroyChatAttachment: jest.fn().mockResolvedValue(undefined) }
    const service = new ChatService(
      repo as unknown as ChatRepository,
      eventEmitter as unknown as EventEmitter2,
      cloudinary as unknown as CloudinaryService,
    )
    return { repo, eventEmitter, cloudinary, service }
  }

  const expectAppError = async (p: Promise<unknown>, status: number, code: ChatErrorCode) => {
    const err = await p.then(
      () => null,
      (e) => e,
    )
    expect(err).toBeInstanceOf(AppException)
    expect(err.getStatus()).toBe(status)
    expect(err.getResponse()).toEqual(expect.objectContaining({ code }))
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW })
    log.warn.mockClear()
  })
  afterEach(() => jest.useRealTimers())

  describe('updateMessage', () => {
    it('lets the author edit: writes content + editedAt with tenant-scoped conditions and emits messageUpdated', async () => {
      const { repo, eventEmitter, service } = setup(message())
      repo.findMessageInChannel
        .mockResolvedValueOnce(message())
        .mockResolvedValueOnce(message({ content: 'new text', editedAt: NOW }))

      const result = await service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'new text')

      expect(repo.findMessageInChannel).toHaveBeenCalledWith('t1', 'c1', 'm1')
      expect(repo.updateMessageContent).toHaveBeenCalledWith({
        tenantId: 't1',
        channelId: 'c1',
        messageId: 'm1',
        senderId: AUTHOR,
        content: 'new text',
        editedAt: NOW,
        editableSince: EDITABLE_SINCE,
      })
      expect(result).toEqual(expect.objectContaining({ content: 'new text', editedAt: NOW, deletedAt: null }))
      expect(eventEmitter.emit).toHaveBeenCalledWith(MESSAGE_UPDATED_EVENT, result)
    })

    it('rejects a non-author with 403 CHAT_MESSAGE_FORBIDDEN without writing', async () => {
      const { repo, eventEmitter, service } = setup(message({ senderId: 'someone-else' }))
      await expectAppError(service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'x'), 403, ChatErrorCode.MESSAGE_FORBIDDEN)
      expect(repo.updateMessageContent).not.toHaveBeenCalled()
      expect(eventEmitter.emit).not.toHaveBeenCalled()
    })

    it('rejects a non-member of a private channel with 403 CHAT_MESSAGE_FORBIDDEN (same membership check as sending)', async () => {
      const { repo, service } = setup(message(), { channel: { tenantId: 't1', isPrivate: true }, isMember: false })
      await expectAppError(service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'x'), 403, ChatErrorCode.MESSAGE_FORBIDDEN)
      expect(repo.isMember).toHaveBeenCalledWith('c1', AUTHOR)
      expect(repo.findMessageInChannel).not.toHaveBeenCalled()
      expect(repo.updateMessageContent).not.toHaveBeenCalled()
    })

    it('returns 404 CHAT_MESSAGE_NOT_FOUND for a channel of another tenant', async () => {
      const { repo, service } = setup(message(), { channel: { tenantId: 't2', isPrivate: false } })
      await expectAppError(service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'x'), 404, ChatErrorCode.MESSAGE_NOT_FOUND)
      expect(repo.updateMessageContent).not.toHaveBeenCalled()
    })

    it('returns 404 CHAT_MESSAGE_NOT_FOUND when the message is not in this channel/tenant', async () => {
      const { repo, service } = setup(null)
      await expectAppError(service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'x'), 404, ChatErrorCode.MESSAGE_NOT_FOUND)
      expect(repo.updateMessageContent).not.toHaveBeenCalled()
    })

    it('rejects a message older than 24 hours with 400 CHAT_MESSAGE_EDIT_EXPIRED', async () => {
      const { repo, service } = setup(message({ createdAt: new Date(EDITABLE_SINCE.getTime() - 1) }))
      await expectAppError(
        service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'x'),
        400,
        ChatErrorCode.MESSAGE_EDIT_EXPIRED,
      )
      expect(repo.updateMessageContent).not.toHaveBeenCalled()
    })

    it('still allows an edit exactly at the 24 hour boundary', async () => {
      const { repo, service } = setup(message({ createdAt: EDITABLE_SINCE }))
      await service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'x')
      expect(repo.updateMessageContent).toHaveBeenCalled()
    })

    it('becomes expired once the fake clock passes 24 hours', async () => {
      const { repo, service } = setup(message({ createdAt: NOW }))
      jest.advanceTimersByTime(MESSAGE_EDIT_WINDOW_MS + 1)
      await expectAppError(
        service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'x'),
        400,
        ChatErrorCode.MESSAGE_EDIT_EXPIRED,
      )
      expect(repo.updateMessageContent).not.toHaveBeenCalled()
    })

    it('rejects an attachment-only message (empty content) with 400 CHAT_MESSAGE_NOT_EDITABLE', async () => {
      const attachment = { id: 'a1', url: 'u', fileName: 'f.png', mimeType: 'image/png', createdAt: NOW }
      const { repo, service } = setup(message({ content: '', attachments: [attachment] }))
      await expectAppError(
        service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'x'),
        400,
        ChatErrorCode.MESSAGE_NOT_EDITABLE,
      )
      expect(repo.updateMessageContent).not.toHaveBeenCalled()
    })

    it('returns 404 CHAT_MESSAGE_NOT_FOUND when editing a deleted message', async () => {
      const { repo, eventEmitter, service } = setup(message({ deletedAt: NOW }))
      await expectAppError(service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'x'), 404, ChatErrorCode.MESSAGE_NOT_FOUND)
      expect(repo.updateMessageContent).not.toHaveBeenCalled()
      expect(eventEmitter.emit).not.toHaveBeenCalled()
    })

    it('does nothing for the same text: no write, editedAt untouched, no event', async () => {
      const current = message()
      const { repo, eventEmitter, service } = setup(current)
      const result = await service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'hello')
      expect(repo.updateMessageContent).not.toHaveBeenCalled()
      expect(eventEmitter.emit).not.toHaveBeenCalled()
      expect(result).toEqual(current)
      expect(result.editedAt).toBeNull()
    })

    it('does not overwrite a message deleted concurrently (updateMany count 0 -> 404, no event)', async () => {
      const { repo, eventEmitter, service } = setup(message())
      repo.updateMessageContent.mockResolvedValueOnce(0)
      repo.findMessageInChannel.mockResolvedValueOnce(message()).mockResolvedValueOnce(message({ deletedAt: NOW }))
      await expectAppError(service.updateMessage('t1', 'c1', 'm1', AUTHOR, 'x'), 404, ChatErrorCode.MESSAGE_NOT_FOUND)
      expect(eventEmitter.emit).not.toHaveBeenCalled()
    })
  })

  describe('deleteMessage', () => {
    it('soft-deletes, cleans Cloudinary only after the transaction, emits messageDeleted and hides the content', async () => {
      const attachment = { id: 'a1', url: 'u', fileName: 'f.png', mimeType: 'image/png', createdAt: NOW }
      const { repo, eventEmitter, cloudinary, service } = setup(message({ attachments: [attachment] }))
      repo.findMessageInChannel
        .mockResolvedValueOnce(message({ attachments: [attachment] }))
        .mockResolvedValueOnce(message({ deletedAt: NOW }))

      const result = await service.deleteMessage('t1', 'c1', 'm1', AUTHOR)

      expect(repo.softDeleteMessage).toHaveBeenCalledWith({
        tenantId: 't1',
        channelId: 'c1',
        messageId: 'm1',
        senderId: AUTHOR,
        deletedAt: NOW,
        editableSince: EDITABLE_SINCE,
      })
      expect(cloudinary.destroyChatAttachment).toHaveBeenCalledWith('chat-attachments/p1', 'image/png')
      expect(cloudinary.destroyChatAttachment.mock.invocationCallOrder[0]).toBeGreaterThan(
        repo.softDeleteMessage.mock.invocationCallOrder[0],
      )
      expect(result).toEqual(
        expect.objectContaining({ id: 'm1', senderId: AUTHOR, content: '', attachments: [], deletedAt: NOW }),
      )
      expect(eventEmitter.emit).toHaveBeenCalledWith(MESSAGE_DELETED_EVENT, {
        tenantId: 't1',
        channelId: 'c1',
        messageId: 'm1',
        deletedAt: NOW,
      })
    })

    it('does not fail the request when Cloudinary cleanup fails, and logs chat.attachment_cleanup_failed', async () => {
      const { repo, cloudinary, service } = setup(message())
      repo.findMessageInChannel.mockResolvedValueOnce(message()).mockResolvedValueOnce(message({ deletedAt: NOW }))
      cloudinary.destroyChatAttachment.mockRejectedValueOnce(new Error('cloudinary down'))

      const result = await service.deleteMessage('t1', 'c1', 'm1', AUTHOR)

      expect(result.deletedAt).toEqual(NOW)
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'chat.attachment_cleanup_failed', publicId: 'chat-attachments/p1' }),
      )
    })

    it('is idempotent: an already deleted message returns 200 without writing, cleanup or event', async () => {
      const { repo, eventEmitter, cloudinary, service } = setup(message({ deletedAt: NOW }))
      const result = await service.deleteMessage('t1', 'c1', 'm1', AUTHOR)
      expect(result).toEqual(expect.objectContaining({ content: '', attachments: [], deletedAt: NOW }))
      expect(repo.softDeleteMessage).not.toHaveBeenCalled()
      expect(cloudinary.destroyChatAttachment).not.toHaveBeenCalled()
      expect(eventEmitter.emit).not.toHaveBeenCalled()
    })

    it('treats losing a concurrent delete race as idempotent (count 0, re-read deleted -> 200, no event)', async () => {
      const { repo, eventEmitter, cloudinary, service } = setup(message())
      repo.softDeleteMessage.mockResolvedValueOnce(null)
      repo.findMessageInChannel.mockResolvedValueOnce(message()).mockResolvedValueOnce(message({ deletedAt: NOW }))
      const result = await service.deleteMessage('t1', 'c1', 'm1', AUTHOR)
      expect(result.deletedAt).toEqual(NOW)
      expect(cloudinary.destroyChatAttachment).not.toHaveBeenCalled()
      expect(eventEmitter.emit).not.toHaveBeenCalled()
    })

    it('rejects a non-author with 403 CHAT_MESSAGE_FORBIDDEN', async () => {
      const { repo, service } = setup(message({ senderId: 'someone-else' }))
      await expectAppError(service.deleteMessage('t1', 'c1', 'm1', AUTHOR), 403, ChatErrorCode.MESSAGE_FORBIDDEN)
      expect(repo.softDeleteMessage).not.toHaveBeenCalled()
    })

    it('rejects a non-member of a private channel with 403 CHAT_MESSAGE_FORBIDDEN', async () => {
      const { repo, service } = setup(message(), { channel: { tenantId: 't1', isPrivate: true }, isMember: false })
      await expectAppError(service.deleteMessage('t1', 'c1', 'm1', AUTHOR), 403, ChatErrorCode.MESSAGE_FORBIDDEN)
      expect(repo.softDeleteMessage).not.toHaveBeenCalled()
    })

    it('rejects a message older than 24 hours with 400 CHAT_MESSAGE_EDIT_EXPIRED', async () => {
      const { repo, service } = setup(message({ createdAt: new Date(EDITABLE_SINCE.getTime() - 1) }))
      await expectAppError(service.deleteMessage('t1', 'c1', 'm1', AUTHOR), 400, ChatErrorCode.MESSAGE_EDIT_EXPIRED)
      expect(repo.softDeleteMessage).not.toHaveBeenCalled()
    })
  })

  describe('deleted message output', () => {
    it('toMessageResponse blanks content and attachments but keeps author, id, createdAt, deletedAt', () => {
      const attachment = { id: 'a1', url: 'u', fileName: 'f.png', mimeType: 'image/png', createdAt: NOW }
      const deleted = message({ content: 'secret text', attachments: [attachment], deletedAt: NOW })
      expect(toMessageResponse(deleted)).toEqual({ ...deleted, content: '', attachments: [] })
    })

    it('toMessageResponse leaves a live message untouched', () => {
      const live = message()
      expect(toMessageResponse(live)).toBe(live)
    })

    it('GET messages never returns the text of a deleted message', async () => {
      const { repo, service } = setup(null)
      repo.findMessages.mockResolvedValue({
        data: [message({ id: 'm2' }), message({ content: 'secret text', deletedAt: NOW })],
        total: 2,
      })
      const result = await service.getMessages('t1', 'c1', AUTHOR, { page: 1, limit: 30 })
      expect(result.data[0].content).toBe('hello')
      expect(result.data[1]).toEqual(expect.objectContaining({ content: '', attachments: [], deletedAt: NOW }))
    })
  })
})

describe('UpdateMessageBodySchema', () => {
  it('trims the content', () => {
    expect(UpdateMessageBodySchema.parse({ content: '  hi  ' })).toEqual({ content: 'hi' })
  })
  it.each([
    ['empty', { content: '' }],
    ['whitespace only', { content: '   ' }],
    ['too long', { content: 'x'.repeat(5001) }],
    ['unknown key', { content: 'hi', extra: 1 }],
  ])('rejects %s', (_n, body) => {
    expect(UpdateMessageBodySchema.safeParse(body).success).toBe(false)
  })
})

describe('ChatService.uploadAttachments', () => {
  const NOW = new Date('2026-10-08T12:00:00.000Z')
  const log = rootLogger.child({}) as unknown as { warn: jest.Mock }
  const file = (name: string) =>
    ({ buffer: Buffer.from('x'), originalname: name, mimetype: 'image/png', size: 1 }) as Express.Multer.File

  const AUTHOR = 'u1'
  const EDITABLE_SINCE = new Date(NOW.getTime() - MESSAGE_EDIT_WINDOW_MS)
  const live = { id: 'm1', tenantId: 't1', channelId: 'c1', senderId: AUTHOR, createdAt: NOW, deletedAt: null }
  const deleted = { ...live, deletedAt: NOW }

  const setup = (opts: { channel?: { tenantId: string; isPrivate: boolean }; isMember?: boolean } = {}) => {
    const repo = {
      findMessageById: jest.fn().mockResolvedValue(live),
      findChannelById: jest.fn().mockResolvedValue({ id: 'c1', tenantId: 't1', isPrivate: false, ...opts.channel }),
      isMember: jest.fn().mockResolvedValue(opts.isMember ?? true),
      addAttachments: jest.fn().mockResolvedValue({ ...live, content: '', attachments: [] }),
    }
    const eventEmitter = { emit: jest.fn() }
    const cloudinary = {
      uploadChatAttachment: jest
        .fn()
        .mockResolvedValueOnce({ url: 'u1', publicId: 'p1' })
        .mockResolvedValueOnce({ url: 'u2', publicId: 'p2' }),
      destroyChatAttachment: jest.fn().mockResolvedValue(undefined),
    }
    const service = new ChatService(
      repo as unknown as ChatRepository,
      eventEmitter as unknown as EventEmitter2,
      cloudinary as unknown as CloudinaryService,
    )
    return { repo, eventEmitter, cloudinary, service }
  }

  const expectNotFound = async (p: Promise<unknown>) => {
    const err = await p.then(
      () => null,
      (e) => e,
    )
    expect(err).toBeInstanceOf(AppException)
    expect(err.getStatus()).toBe(404)
    expect(err.getResponse()).toEqual(expect.objectContaining({ code: ChatErrorCode.MESSAGE_NOT_FOUND }))
  }

  const expectAppError = async (p: Promise<unknown>, status: number, code: ChatErrorCode) => {
    const err = await p.then(
      () => null,
      (e) => e,
    )
    expect(err).toBeInstanceOf(AppException)
    expect(err.getStatus()).toBe(status)
    expect(err.getResponse()).toEqual(expect.objectContaining({ code }))
  }

  // Every rejected precondition must stop before Cloudinary and before any write.
  const expectNothingUploaded = (
    repo: ReturnType<typeof setup>['repo'],
    cloudinary: ReturnType<typeof setup>['cloudinary'],
    eventEmitter: ReturnType<typeof setup>['eventEmitter'],
  ) => {
    expect(cloudinary.uploadChatAttachment).not.toHaveBeenCalled()
    expect(repo.addAttachments).not.toHaveBeenCalled()
    expect(eventEmitter.emit).not.toHaveBeenCalled()
  }

  beforeEach(() => {
    log.warn.mockClear()
    jest.useFakeTimers({ now: NOW })
  })

  afterEach(() => jest.useRealTimers())

  it('lets the author attach files within the 24 hour window', async () => {
    const { repo, eventEmitter, cloudinary, service } = setup()
    await service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png')])
    expect(cloudinary.uploadChatAttachment).toHaveBeenCalledTimes(1)
    expect(repo.addAttachments).toHaveBeenCalledTimes(1)
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1)
  })

  it('rejects a non-author in a public channel with 403 CHAT_MESSAGE_FORBIDDEN', async () => {
    const { repo, eventEmitter, cloudinary, service } = setup()
    await expectAppError(
      service.uploadAttachments('m1', 't1', 'u2', [file('a.png')]),
      403,
      ChatErrorCode.MESSAGE_FORBIDDEN,
    )
    expectNothingUploaded(repo, cloudinary, eventEmitter)
  })

  it('rejects a caller who is not a member of the private channel with 403 FORBIDDEN_PRIVATE_CHANNEL_ACCESS', async () => {
    const { repo, eventEmitter, cloudinary, service } = setup({
      channel: { tenantId: 't1', isPrivate: true },
      isMember: false,
    })
    await expectAppError(
      service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png')]),
      403,
      ChatErrorCode.FORBIDDEN_PRIVATE_CHANNEL_ACCESS,
    )
    expect(repo.isMember).toHaveBeenCalledWith('c1', AUTHOR)
    expectNothingUploaded(repo, cloudinary, eventEmitter)
  })

  it('checks channel access before authorship (non-member non-author gets the channel error)', async () => {
    const { repo, eventEmitter, cloudinary, service } = setup({
      channel: { tenantId: 't1', isPrivate: true },
      isMember: false,
    })
    await expectAppError(
      service.uploadAttachments('m1', 't1', 'u2', [file('a.png')]),
      403,
      ChatErrorCode.FORBIDDEN_PRIVATE_CHANNEL_ACCESS,
    )
    expectNothingUploaded(repo, cloudinary, eventEmitter)
  })

  it('rejects a message older than 24 hours with 400 CHAT_MESSAGE_EDIT_EXPIRED', async () => {
    const { repo, eventEmitter, cloudinary, service } = setup()
    repo.findMessageById.mockResolvedValue({ ...live, createdAt: new Date(EDITABLE_SINCE.getTime() - 1) })
    await expectAppError(
      service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png')]),
      400,
      ChatErrorCode.MESSAGE_EDIT_EXPIRED,
    )
    expectNothingUploaded(repo, cloudinary, eventEmitter)
  })

  it('still allows an upload exactly at the 24 hour boundary', async () => {
    const { repo, service } = setup()
    repo.findMessageById.mockResolvedValue({ ...live, createdAt: EDITABLE_SINCE })
    await service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png')])
    expect(repo.addAttachments).toHaveBeenCalledTimes(1)
  })

  it('checks the window before validating files (expired + no files -> 400 EDIT_EXPIRED)', async () => {
    const { repo, cloudinary, service } = setup()
    repo.findMessageById.mockResolvedValue({ ...live, createdAt: new Date(EDITABLE_SINCE.getTime() - 1) })
    await expectAppError(service.uploadAttachments('m1', 't1', AUTHOR, []), 400, ChatErrorCode.MESSAGE_EDIT_EXPIRED)
    expect(cloudinary.uploadChatAttachment).not.toHaveBeenCalled()
  })

  it('returns 404 for a message of another tenant, before any channel lookup or upload', async () => {
    const { repo, eventEmitter, cloudinary, service } = setup()
    repo.findMessageById.mockResolvedValue({ ...live, tenantId: 't2' })
    await expectNotFound(service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png')]))
    expect(repo.findChannelById).not.toHaveBeenCalled()
    expectNothingUploaded(repo, cloudinary, eventEmitter)
  })

  it('returns 404 for a missing message', async () => {
    const { repo, eventEmitter, cloudinary, service } = setup()
    repo.findMessageById.mockResolvedValue(null)
    await expectNotFound(service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png')]))
    expectNothingUploaded(repo, cloudinary, eventEmitter)
  })

  it('returns 404 for an already deleted message, before any upload or write', async () => {
    const { repo, cloudinary, service } = setup()
    repo.findMessageById.mockResolvedValue(deleted)
    await expectNotFound(service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png')]))
    expect(repo.findChannelById).not.toHaveBeenCalled()
    expect(cloudinary.uploadChatAttachment).not.toHaveBeenCalled()
    expect(repo.addAttachments).not.toHaveBeenCalled()
  })

  it('cleans up uploaded files and returns 404 when the message is deleted during the upload', async () => {
    const { repo, eventEmitter, cloudinary, service } = setup()
    repo.findMessageById.mockResolvedValueOnce(live).mockResolvedValueOnce(deleted)
    await expectNotFound(service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png'), file('b.png')]))
    expect(cloudinary.destroyChatAttachment).toHaveBeenCalledWith('p1', 'image/png')
    expect(cloudinary.destroyChatAttachment).toHaveBeenCalledWith('p2', 'image/png')
    expect(repo.addAttachments).not.toHaveBeenCalled()
    expect(eventEmitter.emit).not.toHaveBeenCalled()
  })

  it('also cleans up when the message disappeared during the upload', async () => {
    const { repo, cloudinary, service } = setup()
    repo.findMessageById.mockResolvedValueOnce(live).mockResolvedValueOnce(null)
    await expectNotFound(service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png')]))
    expect(cloudinary.destroyChatAttachment).toHaveBeenCalledWith('p1', 'image/png')
    expect(repo.addAttachments).not.toHaveBeenCalled()
  })

  it('does not mask the 404 when cleanup fails, and logs chat.attachment_cleanup_failed', async () => {
    const { repo, cloudinary, service } = setup()
    repo.findMessageById.mockResolvedValueOnce(live).mockResolvedValueOnce(deleted)
    cloudinary.destroyChatAttachment.mockRejectedValue(new Error('cloudinary down'))
    await expectNotFound(service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png')]))
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'chat.attachment_cleanup_failed', publicId: 'p1' }),
    )
  })

  it('uploads to a live message as before: rows added, event emitted, no cleanup', async () => {
    const { repo, eventEmitter, cloudinary, service } = setup()
    await service.uploadAttachments('m1', 't1', AUTHOR, [file('a.png')])
    expect(repo.addAttachments).toHaveBeenCalledWith('m1', [
      { url: 'u1', publicId: 'p1', fileName: 'a.png', mimeType: 'image/png' },
    ])
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1)
    expect(cloudinary.destroyChatAttachment).not.toHaveBeenCalled()
  })
})
