import { Injectable } from '@nestjs/common'
import { AppException, InvitationErrorCode, RoleErrorCode } from 'src/common/errors'
import { HashingService } from 'src/common/services/hashing.service'
import { TokenService } from 'src/common/services/token.service'
import { MailService } from 'src/common/services/mail.service'
import { RedisService } from 'src/common/services/redis.service'
import { SharedUserRepository } from 'src/common/repositories/shared-user.repo'
import { InvitationRepository } from './invitation.repo'
import { CreateInvitationType, AcceptInvitationType, UpdateInvitationType } from './invitations.model'
import { v4 as uuidv4 } from 'uuid'
import envConfig from 'src/common/config'
import { PrismaService } from 'src/common/services/prisma.service'
import { getRoleWeight, getRequesterRoleWeight } from 'src/common/constants/role-hierarchy.constant'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { rootLogger } from 'src/common/logger/root-logger'

// Module-level logger; `requestId` is attached from CLS per request. The invite
// `token` (a uuid that grants account creation) and the `inviteLink` are
// secrets — only `invitationId` is ever logged.
const log = rootLogger.child({ context: 'InvitationsService' })

@Injectable()
export class InvitationsService {
  constructor(
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    private readonly sharedUserRepo: SharedUserRepository,
    private readonly invitationRepo: InvitationRepository,
    private readonly prismaService: PrismaService,
  ) {}

  // ─── CREATE INVITATION ────────────────────────────────────────────────────

  async createInvitation(body: CreateInvitationType, tenantId: string, currentUser: AccessTokenPayload) {
    log.info({
      event: 'invitation.create',
      email: body.email,
      role: body.role,
      tenantId,
      invitedBy: currentUser.userId,
    })
    const existingUser = await this.sharedUserRepo.findUniqueEmail(body.email)
    if (existingUser) {
      log.warn({ event: 'invitation.create.rejected', email: body.email, tenantId, reason: 'user_exists' })
      throw AppException.conflict(
        InvitationErrorCode.EMAIL_IN_OTHER_WORKSPACE,
        'This email is already registered in another workspace',
      )
    }
    const tenant = await this.sharedUserRepo.findTenantUnique(tenantId)
    if (!tenant) {
      log.warn({ event: 'invitation.create.rejected', tenantId, reason: 'tenant_not_found' })
      throw AppException.notFound(InvitationErrorCode.WORKSPACE_NOT_FOUND, 'Workspace not found')
    }
    // Find Role in tenant based on submitted name
    const dbRole = await this.prismaService.role.findFirst({
      where: { tenantId, name: body.role },
    })
    if (!dbRole) {
      log.warn({ event: 'invitation.create.rejected', email: body.email, tenantId, reason: 'invalid_role' })
      throw AppException.badRequest(RoleErrorCode.INVALID, 'Invalid role')
    }
    if (getRoleWeight(dbRole.name) > getRequesterRoleWeight(currentUser.role)) {
      log.warn({ event: 'invitation.create.rejected', email: body.email, tenantId, reason: 'role_escalation' })
      throw AppException.forbidden(
        InvitationErrorCode.ROLE_ABOVE_SELF,
        'You cannot invite a user with a role higher than your own',
      )
    }
    await this.invitationRepo.deleteManyByEmail(body.email)
    const token = uuidv4()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)
    const invitation = await this.invitationRepo.create({
      email: body.email,
      roleId: dbRole.id,
      token,
      expiresAt,
      tenantId,
    })
    const inviteLink = `${envConfig.FRONTEND_URL}/invite?token=${token}`
    await this.mailService.sendInvitationEmail({
      to: body.email,
      companyName: tenant.name,
      role: body.role,
      inviteLink,
    })
    log.info({
      event: 'invitation.created',
      invitationId: invitation.id,
      email: body.email,
      role: body.role,
      tenantId,
    })
    return {
      ...invitation,
      role: body.role,
    }
  }

  // ─── GET INVITATIONS ──────────────────────────────────────────────────────

  async getInvitationsByTenant(tenantId: string) {
    return this.invitationRepo.findManyByTenant(tenantId)
  }

  // ─── REVOKE INVITATION ────────────────────────────────────────────────────

  async revokeInvitation(id: string, tenantId: string) {
    const invitation = await this.invitationRepo.findByIdAndTenant(id, tenantId)
    if (!invitation) {
      log.warn({ event: 'invitation.revoke.rejected', invitationId: id, tenantId, reason: 'not_found' })
      throw AppException.notFound(
        InvitationErrorCode.NOT_FOUND,
        'Invitation not found or does not belong to this workspace',
      )
    }

    log.info({ event: 'invitation.revoked', invitationId: id, tenantId })
    return this.invitationRepo.deleteById(id)
  }

  // ─── VERIFY TOKEN ─────────────────────────────────────────────────────────

  async verifyInvitationToken(token: string) {
    // Raw token is a secret — log only a short prefix at debug for support.
    log.debug({ event: 'invitation.verify', tokenPrefix: token.slice(0, 8) })
    const invitation = await this.invitationRepo.findByToken(token)
    if (!invitation) {
      log.warn({ event: 'invitation.verify.rejected', reason: 'invalid' })
      throw AppException.badRequest(InvitationErrorCode.TOKEN_INVALID, 'Invitation is invalid or the link is broken')
    }
    if (invitation.status !== 'PENDING') {
      log.warn({ event: 'invitation.verify.rejected', invitationId: invitation.id, reason: 'not_pending' })
      throw AppException.badRequest(
        InvitationErrorCode.ALREADY_RESOLVED,
        'This invitation has already been accepted or cancelled',
      )
    }
    if (invitation.expiresAt < new Date()) {
      await this.invitationRepo.updateStatus(invitation.id, 'EXPIRED')
      log.warn({ event: 'invitation.verify.rejected', invitationId: invitation.id, reason: 'expired' })
      throw AppException.badRequest(InvitationErrorCode.EXPIRED, 'This invitation has expired (older than 7 days)')
    }
    log.info({
      event: 'invitation.verified',
      invitationId: invitation.id,
      email: invitation.email,
      tenantId: invitation.tenantId,
    })
    return {
      email: invitation.email,
      role: invitation.role.name, // Return role name string
      companyName: invitation.tenant.name,
      token: invitation.token,
    }
  }

  // ─── ACCEPT INVITATION ────────────────────────────────────────────────────

  async acceptInvitation(body: AcceptInvitationType) {
    const invitation = await this.invitationRepo.findByTokenOnly(body.token)
    if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
      log.warn({ event: 'invitation.accept.rejected', reason: 'invalid_or_expired' })
      throw AppException.badRequest(InvitationErrorCode.TOKEN_INVALID, 'Invitation is invalid or has expired')
    }
    const existingUser = await this.sharedUserRepo.findUniqueEmail(invitation.email)
    if (existingUser) {
      log.warn({
        event: 'invitation.accept.rejected',
        invitationId: invitation.id,
        email: invitation.email,
        reason: 'user_exists',
      })
      throw AppException.conflict(
        InvitationErrorCode.EMAIL_IN_OTHER_WORKSPACE,
        'This email is already registered in another workspace',
      )
    }
    const hashedPassword = await this.hashingService.hash(body.password)
    const newUser = await this.sharedUserRepo.createUserAndAcceptInvitation({
      email: invitation.email,
      name: body.name,
      hashedPassword,
      roleId: invitation.roleId, // Pass invitation roleId
      tenantId: invitation.tenantId,
      invitationId: invitation.id,
    })
    // Sign tokens
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken({
        userId: newUser.id,
        role: newUser.role, // This is already the mapped string from sharedUserRepo
        tenantId: newUser.tenantId,
      }),
      this.tokenService.signRefreshToken({ userId: newUser.id }),
    ])
    const decoded = await this.tokenService.verifyRefreshToken(refreshToken)
    const ttlSeconds = Math.max(0, Math.floor(decoded.exp - Date.now() / 1000))
    await this.redisService.set(
      `auth:refresh:${refreshToken}`,
      { userId: newUser.id, role: newUser.role, tenantId: newUser.tenantId },
      ttlSeconds,
    )
    log.info({
      event: 'invitation.accepted',
      invitationId: invitation.id,
      email: invitation.email,
      tenantId: newUser.tenantId,
      userId: newUser.id,
    })
    return {
      message: 'Account registered successfully',
      accessToken,
      refreshToken,
    }
  }

  // ─── UPDATE INVITATION ────────────────────────────────────────────────────

  async updateInvitation(id: string, body: UpdateInvitationType, tenantId: string, currentUser: AccessTokenPayload) {
    const invitation = await this.invitationRepo.findByIdAndTenant(id, tenantId)
    if (!invitation) {
      log.warn({ event: 'invitation.update.rejected', invitationId: id, tenantId, reason: 'not_found' })
      throw AppException.notFound(InvitationErrorCode.NOT_FOUND, 'Invitation not found')
    }
    if (invitation.status !== 'PENDING') {
      log.warn({ event: 'invitation.update.rejected', invitationId: id, tenantId, reason: 'not_pending' })
      throw AppException.badRequest(
        InvitationErrorCode.NOT_PENDING,
        'Only invitations in the pending state can be edited',
      )
    }
    const updateData: {
      token: string
      expiresAt: Date
      email?: string
      roleId?: string
    } = {
      token: uuidv4(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }
    if (body.email && body.email !== invitation.email) {
      const existingUser = await this.sharedUserRepo.findUniqueEmail(body.email)
      if (existingUser) throw AppException.conflict(InvitationErrorCode.EMAIL_TAKEN, 'This email is already registered')
      const existingInv = await this.invitationRepo.findDuplicateEmail(body.email, tenantId, id)
      if (existingInv)
        throw AppException.conflict(InvitationErrorCode.DUPLICATE, 'Another invitation already exists for this email')
      updateData.email = body.email
    }
    if (body.role) {
      const dbRole = await this.prismaService.role.findFirst({ where: { tenantId, name: body.role } })
      if (!dbRole) throw AppException.badRequest(RoleErrorCode.INVALID, 'Invalid role')
      if (getRoleWeight(dbRole.name) > getRequesterRoleWeight(currentUser.role)) {
        throw AppException.forbidden(
          InvitationErrorCode.ROLE_ABOVE_SELF,
          'You cannot assign a role higher than your own',
        )
      }
      updateData.roleId = dbRole.id
    }
    const updatedInvitation = await this.invitationRepo.update(id, updateData)
    const tenant = await this.sharedUserRepo.findTenantUnique(tenantId)
    const inviteLink = `${envConfig.FRONTEND_URL}/invite?token=${updateData.token}`
    await this.mailService.sendInvitationEmail({
      to: updatedInvitation.email,
      companyName: tenant?.name || 'Workspace CRM',
      role: updatedInvitation.role.name,
      inviteLink,
    })
    log.info({
      event: 'invitation.updated',
      invitationId: id,
      tenantId,
      changed: [...(updateData.email ? ['email'] : []), ...(updateData.roleId ? ['role'] : [])],
    })
    return {
      ...updatedInvitation,
      role: updatedInvitation.role.name,
    }
  }
}
