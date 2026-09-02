import { Injectable } from '@nestjs/common'
import { AppException, RoleErrorCode, UserErrorCode } from 'src/common/errors'
import { PrismaService } from 'src/common/services/prisma.service'
import { RedisService } from 'src/common/services/redis.service'
import { AVATAR_ALLOWED_MIME, AVATAR_MAX_BYTES, CloudinaryService } from 'src/common/services/cloudinary.service'
import { UpdateUserType, UpdateMeType } from './users.dto'

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  private toProfile(user: {
    id: string
    email: string
    name: string
    avatarUrl: string | null
    role: { name: string }
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role.name,
    }
  }

  // ── Self-service profile (PATCH /users/me, avatar endpoints) ────────────────

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    })
    if (!user) {
      throw AppException.notFound(UserErrorCode.MEMBER_NOT_FOUND, 'Member not found')
    }
    return this.toProfile(user)
  }

  async updateMe(userId: string, body: UpdateMeType) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { name: body.name },
      include: { role: true },
    })
    return this.toProfile(updated)
  }

  async updateMyAvatar(userId: string, file?: Express.Multer.File) {
    if (!file || !file.buffer?.length) {
      throw AppException.badRequest(UserErrorCode.AVATAR_FILE_MISSING, 'No avatar file was uploaded')
    }
    if (!AVATAR_ALLOWED_MIME.includes(file.mimetype as (typeof AVATAR_ALLOWED_MIME)[number])) {
      throw AppException.unprocessable(UserErrorCode.AVATAR_INVALID_TYPE, 'Avatar must be a JPEG, PNG or WebP image')
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw AppException.unprocessable(UserErrorCode.AVATAR_TOO_LARGE, 'Avatar file is too large')
    }

    const avatarUrl = await this.cloudinary.uploadAvatar(file.buffer, userId)
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      include: { role: true },
    })
    return this.toProfile(updated)
  }

  async removeMyAvatar(userId: string) {
    await this.cloudinary.deleteAvatar(userId)
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      include: { role: true },
    })
    return this.toProfile(updated)
  }

  async getUsersByTenant(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      include: { role: true },
      orderBy: { name: 'asc' },
    })
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role.name, // Return role name string
    }))
  }

  async updateUser(id: string, body: UpdateUserType, tenantId: string, currentUserId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: { role: true },
    })
    if (!user) {
      throw AppException.notFound(UserErrorCode.MEMBER_NOT_FOUND, 'Member not found')
    }

    if (id === currentUserId && body.role && body.role !== user.role.name) {
      throw AppException.badRequest(UserErrorCode.CANNOT_CHANGE_OWN_ROLE, 'You cannot change your own role')
    }

    let roleId = user.roleId
    if (body.role) {
      // Find corresponding dynamic Role in tenant
      const dbRole = await this.prisma.role.findFirst({
        where: { tenantId, name: body.role },
      })
      if (!dbRole) {
        throw AppException.badRequest(RoleErrorCode.INVALID, 'Role does not exist in the system')
      }
      roleId = dbRole.id
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        roleId,
      },
      include: { role: true },
    })

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role.name,
    }
  }

  async deleteUser(id: string, tenantId: string, currentUserId: string) {
    if (id === currentUserId) {
      throw AppException.badRequest(UserErrorCode.CANNOT_REMOVE_SELF, 'You cannot remove yourself from the workspace')
    }

    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    })
    if (!user) {
      throw AppException.notFound(UserErrorCode.MEMBER_NOT_FOUND, 'Member not found')
    }

    const ownedDealsCount = await this.prisma.deal.count({
      where: { ownerId: id, deletedAt: null },
    })
    if (ownedDealsCount > 0) {
      throw AppException.badRequest(
        UserErrorCode.MEMBER_HAS_OWNED_DEALS,
        'Cannot remove a member who owns deals. Transfer deal ownership first.',
      )
    }

    return this.prisma.user.delete({
      where: { id },
    })
  }

  // Get all roles along with assigned permissions of tenant
  async getRolesByTenant(tenantId: string) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((rp) => ({
        id: rp.permission.id,
        action: rp.permission.action,
        subject: rp.permission.subject,
        conditions: rp.conditions,
      })),
    }))
  }

  // Get list of available system permissions
  async getAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ subject: 'asc' }, { action: 'asc' }],
    })
  }

  // Update permission associations for a role
  async updateRolePermissions(tenantId: string, roleId: string, permissionIds: string[]) {
    // 1. Verify role belongs to tenant
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    })
    if (!role) {
      throw AppException.notFound(RoleErrorCode.NOT_FOUND, 'Role not found')
    }

    // 2. Update permission associations in transaction
    await this.prisma.$transaction(async (tx) => {
      // Delete all old permission associations of this role
      await tx.rolePermission.deleteMany({
        where: { roleId },
      })

      // Create new associations
      if (permissionIds.length > 0) {
        // Query detailed permissions to get the subject of each permission
        const permissions = await tx.permission.findMany({
          where: { id: { in: permissionIds } },
        })

        for (const perm of permissions) {
          let conditions: Record<string, any> | null = null

          // Auto-assign default ABAC conditions for the SALES_REP role
          if (role.name === 'SALES_REP') {
            if (['Contact', 'Deal'].includes(perm.subject)) {
              conditions = { ownerId: '${user.id}' }
            } else if (perm.subject === 'Activity') {
              conditions = { userId: '${user.id}' }
            } else if (perm.subject === 'KpiTarget') {
              conditions = { userId: '${user.id}' }
            } else if (perm.subject === 'Report') {
              conditions = { view: { $in: ['team', 'activity'] } }
            }
          }

          await tx.rolePermission.create({
            data: {
              roleId,
              permissionId: perm.id,
              conditions: conditions as any,
            },
          })
        }
      }
    })

    // 3. Invalidate Redis cache of the role to update permissions immediately
    const cacheKey = `tenant:${tenantId}:role:${role.name}:permissions`
    await this.redisService.delete(cacheKey)

    return { message: 'Permissions updated successfully' }
  }

  // Create new role for tenant
  async createRole(tenantId: string, body: { name: string; description?: string }) {
    const formattedName = body.name.trim().toUpperCase()

    // Security constraint: cannot create role matching system role names
    const isSystemRole = ['ADMIN', 'MANAGER', 'SALES_REP'].includes(formattedName)
    if (isSystemRole) {
      throw AppException.badRequest(RoleErrorCode.NAME_RESERVED, 'Name must not match a system default role')
    }

    // Check duplicate in tenant
    const existRole = await this.prisma.role.findFirst({
      where: { tenantId, name: formattedName },
    })
    if (existRole) {
      throw AppException.badRequest(RoleErrorCode.NAME_TAKEN, 'Role name already exists in the workspace')
    }

    return this.prisma.role.create({
      data: {
        tenantId,
        name: formattedName,
        description: body.description?.trim() || `Role ${formattedName}`,
      },
    })
  }

  // Update custom role name/description
  async updateRole(tenantId: string, roleId: string, body: { name: string; description?: string }) {
    // 1. Verify role belongs to tenant
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    })
    if (!role) {
      throw AppException.notFound(RoleErrorCode.NOT_FOUND, 'Role not found')
    }

    // Security constraint: cannot edit the 3 default roles
    const isSystemRole = ['ADMIN', 'MANAGER', 'SALES_REP'].includes(role.name)
    if (isSystemRole) {
      throw AppException.badRequest(RoleErrorCode.SYSTEM_IMMUTABLE_EDIT, 'System default roles cannot be edited')
    }

    const formattedName = body.name.trim().toUpperCase()
    const isNewSystemName = ['ADMIN', 'MANAGER', 'SALES_REP'].includes(formattedName)
    if (isNewSystemName) {
      throw AppException.badRequest(RoleErrorCode.NAME_RESERVED, 'Name must not match a system default role')
    }

    // Check duplicate with another role in same tenant
    if (formattedName !== role.name) {
      const existOther = await this.prisma.role.findFirst({
        where: {
          tenantId,
          name: formattedName,
          id: { not: roleId },
        },
      })
      if (existOther) {
        throw AppException.badRequest(RoleErrorCode.NAME_TAKEN, 'Role name already exists in the workspace')
      }
    }

    const oldName = role.name
    const updatedRole = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: formattedName,
        description: body.description?.trim(),
      },
    })

    // Invalidate Redis cache for both old and new names
    await this.redisService.delete(`tenant:${tenantId}:role:${oldName}:permissions`)
    await this.redisService.delete(`tenant:${tenantId}:role:${formattedName}:permissions`)

    return updatedRole
  }

  // Delete custom role
  async deleteRole(tenantId: string, roleId: string) {
    // 1. Verify role belongs to tenant
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    })
    if (!role) {
      throw AppException.notFound(RoleErrorCode.NOT_FOUND, 'Role not found')
    }

    // Security constraint: cannot delete the 3 default roles
    const isSystemRole = ['ADMIN', 'MANAGER', 'SALES_REP'].includes(role.name)
    if (isSystemRole) {
      throw AppException.badRequest(RoleErrorCode.SYSTEM_IMMUTABLE_DELETE, 'System default roles cannot be deleted')
    }

    // Check if any member is using this role
    const usersCount = await this.prisma.user.count({
      where: { roleId },
    })
    if (usersCount > 0) {
      throw AppException.badRequest(
        RoleErrorCode.IN_USE_BY_MEMBERS,
        'Cannot delete a role that members are using. Reassign those members first.',
      )
    }

    // Check if any pending invitation is using this role
    const invCount = await this.prisma.invitation.count({
      where: { roleId },
    })
    if (invCount > 0) {
      throw AppException.badRequest(
        RoleErrorCode.IN_USE_BY_INVITATIONS,
        'Cannot delete a role assigned to a pending invitation. Update or cancel the invitation first.',
      )
    }

    // 2. Delete permission associations first, then delete role in transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId },
      })
      await tx.role.delete({
        where: { id: roleId },
      })
    })

    // 3. Invalidate permission cache of this role in Redis
    await this.redisService.delete(`tenant:${tenantId}:role:${role.name}:permissions`)

    return { message: 'Role deleted successfully' }
  }
}
