import { Injectable } from '@nestjs/common'
import { AppException, AuthErrorCode } from 'src/common/errors'
import { PrismaService } from 'src/common/services/prisma.service'
import { HashingService } from 'src/common/services/hashing.service'
import { LoginBodyType, RegisterBodyType } from './auth.model'
import slugify from 'slugify'
import { ROLE } from 'src/common/constants/role.constanst'
import { SharedUserRepository } from 'src/common/repositories/shared-user.repo'
import { AccessTokenPayloadCreate } from 'src/common/types/jwt.type'
import { TokenService } from 'src/common/services/token.service'
import { AuthRepository } from './auth.repo'
import { Response as ExpressResponse } from 'express'
import { COOKIE_OPTIONS } from './auth.constants'
import { RedisService } from 'src/common/services/redis.service'
import { rootLogger } from 'src/common/logger/root-logger'
import { EXPECTED_DOMAIN_PERMISSION_COUNT, PERMISSION_CATALOG_NOT_SEEDED } from 'src/common/casl/permission-catalog'

// Module-level logger. During an HTTP request the pino `mixin` pulls the
// per-request `requestId` from CLS automatically, so every line here is
// correlated without touching the constructor. Only explicit primitive fields
// are logged (ids, email, role, outcome) — never passwords, tokens, hashes or
// whole request/profile objects.
const log = rootLogger.child({ context: 'AuthService' })

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly hashingService: HashingService,
    private readonly sharedUserRepository: SharedUserRepository,
    private readonly tokenService: TokenService,
    private readonly authRepository: AuthRepository,
    private readonly redisService: RedisService,
  ) {}

  async register(body: RegisterBodyType) {
    const slug = slugify(body.companyName)
    log.info({ event: 'register.attempt', email: body.email, companyName: body.companyName, slug })

    const existSlug = await this.sharedUserRepository.findSlug(slug)

    if (existSlug) {
      log.warn({ event: 'register.conflict', email: body.email, slug, reason: 'slug_taken' })
      throw AppException.conflict(
        AuthErrorCode.COMPANY_NAME_TAKEN,
        'Company name is already taken, please choose another',
      )
    }

    const existUser = await this.authRepository.findUserByEmail(body.email)

    if (existUser) {
      log.warn({ event: 'register.conflict', email: body.email, reason: 'email_taken' })
      throw AppException.conflict(AuthErrorCode.EMAIL_TAKEN, 'Email is already in use, please choose another')
    }

    const hashedPassword = await this.hashingService.hash(body.password)

    const user = await this.sharedUserRepository.createTenantIncludeUser({
      companyName: body.companyName,
      slug,
      email: body.email,
      name: body.name,
      hashedPassword,
      role: ROLE.ADMIN,
    })
    log.info({ event: 'register.success', email: body.email, userId: user.id, tenantId: user.tenantId })
    return user
  }

  async login(body: LoginBodyType) {
    log.info({ event: 'login.attempt', email: body.email })
    const user = await this.authRepository.findUserByEmail(body.email)

    if (!user) {
      log.warn({ event: 'login.failed', email: body.email, reason: 'user_not_found' })
      throw AppException.unauthorized(AuthErrorCode.INVALID_CREDENTIALS, 'Incorrect email or password')
    }

    const isPasswordValid = await this.hashingService.compare(body.password, user.password)
    if (!isPasswordValid) {
      log.warn({ event: 'login.failed', email: body.email, userId: user.id, reason: 'bad_password' })
      throw AppException.unprocessable(AuthErrorCode.WRONG_PASSWORD, 'Wrong password. Please try again.', {
        path: 'password',
      })
    }

    const tokens = await this.generateTokens({
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId,
    })
    log.info({ event: 'login.success', email: body.email, userId: user.id, tenantId: user.tenantId, role: user.role })
    return tokens
  }

  async logout(refreshToken: string) {
    // The refresh token value itself is a credential — never logged.
    await this.redisService.delete(`auth:refresh:${refreshToken}`)
    log.info({ event: 'logout' })
    return { message: 'Signed out successfully' }
  }

  async generateTokens({ userId, role, tenantId }: AccessTokenPayloadCreate) {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken({
        userId,
        role,
        tenantId,
      }),
      this.tokenService.signRefreshToken({ userId }),
    ])

    const decodedRefreshToken = await this.tokenService.verifyRefreshToken(refreshToken)
    const ttlSeconds = Math.max(0, Math.floor(decodedRefreshToken.exp - Date.now() / 1000))

    await this.redisService.set(`auth:refresh:${refreshToken}`, { userId, role, tenantId }, ttlSeconds)

    // Token strings and the token secret are never logged — ids only.
    log.debug({ event: 'tokens.issued', userId, tenantId, role })
    return { accessToken, refreshToken }
  }

  async refreshToken(refreshToken: string, res: ExpressResponse) {
    if (!refreshToken) {
      log.warn({ event: 'refresh.failed', reason: 'no_token' })
      throw AppException.unauthorized(AuthErrorCode.REFRESH_TOKEN_MISSING, 'Refresh token not found')
    }

    let userId: string
    try {
      const decoded = await this.tokenService.verifyRefreshToken(refreshToken)
      userId = decoded.userId
    } catch {
      log.warn({ event: 'refresh.failed', reason: 'invalid' })
      throw AppException.unauthorized(AuthErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token is invalid or has expired')
    }

    const storedToken = await this.redisService.get(`auth:refresh:${refreshToken}`)
    if (!storedToken) {
      log.warn({ event: 'refresh.failed', userId, reason: 'not_in_store' })
      throw AppException.unauthorized(
        AuthErrorCode.REFRESH_TOKEN_NOT_IN_STORE,
        'Refresh token does not exist in the current session',
      )
    }

    await this.redisService.delete(`auth:refresh:${refreshToken}`)

    const tokens = await this.generateTokens({
      userId,
      role: storedToken.role,
      tenantId: storedToken.tenantId,
    })

    res.cookie('accessToken', tokens.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000, // 15 minutes
    })

    res.cookie('refreshToken', tokens.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    log.info({ event: 'refresh.success', userId, tenantId: storedToken.tenantId })
    return { message: 'Token refreshed successfully' }
  }

  async getProfile(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      include: { role: true, tenant: { select: { status: true } } },
    })
    if (!user) {
      log.warn({ event: 'profile.fetch', userId, reason: 'not_found' })
      return null
    }

    // Fetch permissions list via user's role (Using Redis Cache)
    const cacheKey = `tenant:${user.tenantId}:role:${user.role.name}:permissions`
    let permissions = await this.redisService.get(cacheKey)
    const permissionsCacheHit = Boolean(permissions)

    if (!permissions) {
      const dbRolePermissions = await this.prismaService.rolePermission.findMany({
        where: {
          roleId: user.roleId,
        },
        include: {
          permission: true,
        },
      })

      permissions = dbRolePermissions.map((rp) => ({
        action: rp.permission.action,
        subject: rp.permission.subject,
        conditions: rp.conditions,
      }))

      // Cache in Redis (TTL: 1 hour)
      await this.redisService.set(cacheKey, permissions, 3600)
    }

    log.debug({ event: 'profile.fetch', userId, tenantId: user.tenantId, permissionsCacheHit })
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name, // Map string
      tenantId: user.tenantId,
      // Lets the frontend show the "awaiting approval" / "suspended" screen
      // instead of the dashboard. GET /auth/me stays reachable for non-ACTIVE
      // tenants (no TenantStatusGuard) precisely so this field can be read.
      tenantStatus: user.tenant.status,
      permissions, // Attach permissions array
    }
  }

  async validateGoogleUser(profile: {
    provider: string
    providerAccountId: string
    email: string
    emailVerified: boolean
    name: string
  }) {
    // `profile` also carries a Google `accessToken` upstream — never pass the
    // whole object to the logger; destructure the safe fields only.
    const { provider, providerAccountId, email, emailVerified, name } = profile
    log.info({ event: 'google.login', email, provider, emailVerified })
    // Defense-in-depth: the Google strategy already rejects unverified emails
    // before this is called, but account-linking below is security-critical
    // (an unverified email would let an attacker silently take over an
    // existing password-based account), so re-check here rather than trust
    // the caller.
    if (!emailVerified) {
      log.warn({ event: 'google.login', email, outcome: 'rejected_unverified' })
      throw AppException.unauthorized(AuthErrorCode.GOOGLE_EMAIL_NOT_VERIFIED, 'Google email is not verified')
    }
    // 1. Check Google linked account
    const account = await this.prismaService.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: { include: { role: true } } },
    })
    if (account) {
      log.info({
        event: 'google.login',
        email,
        outcome: 'linked_account',
        userId: account.user.id,
        tenantId: account.user.tenantId,
      })
      return {
        ...account.user,
        role: account.user.role.name as any,
      }
    }
    // 2. Find user by email
    const user = await this.prismaService.user.findUnique({
      where: { email },
      include: { role: true },
    })
    if (user) {
      log.warn({ event: 'google.login', email, userId: user.id, outcome: 'rejected_password_account' })
      // Do NOT auto-link: this project's password registration never verifies
      // email ownership (no email-verification flow), so an attacker could
      // pre-register a password account on someone else's email, then have
      // that email's real owner sign in with Google and land in the
      // attacker's account. Linking a Google identity to an existing
      // password account must be an explicit, authenticated action taken
      // from account settings, not an implicit side effect of login.
      throw AppException.unauthorized(
        AuthErrorCode.EMAIL_REGISTERED_WITH_PASSWORD,
        'This email is already registered with a password, please sign in with your password',
      )
    }
    // 3. If it's a completely new account
    const invitation = await this.prismaService.invitation.findFirst({
      where: {
        email,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: { role: true },
    })
    let tenantId: string
    let roleId: string
    if (invitation) {
      tenantId = invitation.tenantId
      roleId = invitation.roleId
      await this.prismaService.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      })
      log.info({
        event: 'google.login',
        email,
        outcome: 'joined_via_invitation',
        invitationId: invitation.id,
        tenantId,
      })
    } else {
      // Register new company
      const slug = slugify(name + '-' + Math.floor(Math.random() * 1000))
      return this.prismaService.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: `${name}'s Company`,
            slug,
            // Explicit for clarity even though PENDING is the schema default:
            // a fresh self-service workspace stays gated until an operator
            // approves it via PATCH /internal/tenants/:id/status.
            status: 'PENDING',
          },
        })
        // Seed 3 default Roles for new Tenant.
        // No `description` — built-in role descriptions are non-editable and
        // rendered from fe translations (common.systemRoleDescription.<name>),
        // not stored per-language in the DB. See shared-user.repo.ts.
        const adminRole = await tx.role.create({
          data: { tenantId: tenant.id, name: 'ADMIN' },
        })
        const managerRole = await tx.role.create({
          data: { tenantId: tenant.id, name: 'MANAGER' },
        })
        const salesRepRole = await tx.role.create({
          data: { tenantId: tenant.id, name: 'SALES_REP' },
        })
        // Load the seeded permission catalog — fail loudly if it is absent.
        // A tenant whose ADMIN role has zero permissions is unusable and the
        // failure only surfaces later as a 403 for the end user, so never let
        // provisioning proceed silently past an empty catalog.
        const systemManageAll = await tx.permission.findFirst({ where: { action: 'manage', subject: 'all' } })
        const allDomainPerms = await tx.permission.findMany({
          where: { subject: { in: ['Contact', 'Deal', 'Task', 'Activity'] } },
        })

        if (!systemManageAll || allDomainPerms.length < EXPECTED_DOMAIN_PERMISSION_COUNT) {
          log.error({
            event: 'google.login.permission_catalog_not_seeded',
            email,
            hasManageAll: Boolean(systemManageAll),
            domainPermCount: allDomainPerms.length,
          })
          throw new Error(PERMISSION_CATALOG_NOT_SEEDED)
        }

        // Assign permissions for ADMIN
        await tx.rolePermission.create({ data: { roleId: adminRole.id, permissionId: systemManageAll.id } })
        // Assign permissions for other roles
        for (const perm of allDomainPerms) {
          await tx.rolePermission.create({ data: { roleId: managerRole.id, permissionId: perm.id } })
          const isSubjectRestricted = ['Contact', 'Deal', 'Activity'].includes(perm.subject)
          await tx.rolePermission.create({
            data: {
              roleId: salesRepRole.id,
              permissionId: perm.id,
              conditions: isSubjectRestricted
                ? perm.subject === 'Activity'
                  ? { userId: '${user.id}' }
                  : { ownerId: '${user.id}' }
                : undefined,
            },
          })
        }
        const newUser = await tx.user.create({
          data: { email, name, tenantId: tenant.id, password: null, roleId: adminRole.id },
        })

        await tx.account.create({
          data: { userId: newUser.id, provider, providerAccountId },
        })
        log.info({
          event: 'google.login',
          email,
          outcome: 'new_tenant',
          userId: newUser.id,
          tenantId: tenant.id,
        })
        return { ...newUser, role: 'ADMIN' as any }
      })
    }
    // If joining via invitation
    const newUser = await this.prismaService.user.create({
      data: { email, name, tenantId, password: null, roleId },
      include: { role: true },
    })
    await this.prismaService.account.create({
      data: { userId: newUser.id, provider, providerAccountId },
    })
    log.info({ event: 'google.login', email, outcome: 'invitation_user_created', userId: newUser.id, tenantId })
    return {
      ...newUser,
      role: newUser.role.name as any,
    }
  }
}
