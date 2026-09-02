import { ExecutionContext, HttpStatus, UnauthorizedException } from '@nestjs/common'
import { AppException, TenantErrorCode } from 'src/common/errors'
import { TenantStatusGuard } from './tenant-status.guard'

type TenantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

describe('TenantStatusGuard', () => {
  const findUnique = jest.fn()
  const prisma = { tenant: { findUnique } } as never

  const guard = new TenantStatusGuard(prisma)

  const makeContext = (user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as ExecutionContext

  const runWith = (status: TenantStatus | null) => {
    findUnique.mockResolvedValueOnce(status === null ? null : { status })
    return guard.canActivate(makeContext({ userId: 'u1', tenantId: 't1' }))
  }

  const rejection = async (promise: Promise<unknown>): Promise<unknown> =>
    promise.then(
      () => {
        throw new Error('expected rejection')
      },
      (e: unknown) => e,
    )

  beforeEach(() => findUnique.mockReset())

  it('lets an ACTIVE tenant through', async () => {
    await expect(runWith('ACTIVE')).resolves.toBe(true)
  })

  it('lets the request through when the tenant row is missing', async () => {
    await expect(runWith(null)).resolves.toBe(true)
  })

  it('rejects a PENDING tenant with 403 TENANT_PENDING', async () => {
    const err = await rejection(runWith('PENDING'))
    expect(err).toBeInstanceOf(AppException)
    expect((err as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN)
    expect(((err as AppException).getResponse() as { code: string }).code).toBe(TenantErrorCode.TENANT_PENDING)
  })

  it('rejects a SUSPENDED tenant with 403 TENANT_SUSPENDED', async () => {
    const err = await rejection(runWith('SUSPENDED'))
    expect(err).toBeInstanceOf(AppException)
    expect((err as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN)
    expect(((err as AppException).getResponse() as { code: string }).code).toBe(TenantErrorCode.TENANT_SUSPENDED)
  })

  it('throws Unauthorized when the request has no authenticated user', async () => {
    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(UnauthorizedException)
    expect(findUnique).not.toHaveBeenCalled()
  })
})
