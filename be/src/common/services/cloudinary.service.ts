import { Injectable } from '@nestjs/common'
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary'
import { AppException, UserErrorCode } from '../errors'
import envConfig from '../config'
import { rootLogger } from '../logger/root-logger'

const log = rootLogger.child({ context: 'CloudinaryService' })

// Accepted avatar upload types and the hard size cap. The cap is enforced here
// (and mirrored by a multer `limits` guard on the route) so an oversized body
// is rejected as a localizable 4xx rather than after it hits Cloudinary.
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const

// Workspace logo: same accepted types and cap as avatars. Unlike the avatar it
// is NOT face-cropped to a square — a logo keeps its aspect ratio.
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const

@Injectable()
export class CloudinaryService {
  /**
   * `CLOUDINARY_URL` (cloudinary://<key>:<secret>@<cloud>) is picked up
   * automatically by the SDK from the environment. We only flip `secure` on and
   * record whether the credential is present so callers can 503 cleanly when it
   * is not, instead of throwing an opaque config error deep in the SDK.
   */
  private readonly configured = Boolean(envConfig.CLOUDINARY_URL)

  constructor() {
    if (this.configured) {
      cloudinary.config({ secure: true })
    } else {
      log.warn({ event: 'cloudinary.disabled', reason: 'CLOUDINARY_URL not set' })
    }
  }

  get isConfigured(): boolean {
    return this.configured
  }

  private assertConfigured() {
    if (!this.configured) {
      throw AppException.serviceUnavailable(UserErrorCode.AVATAR_STORAGE_UNAVAILABLE, 'Image storage is not configured')
    }
  }

  /**
   * Streams `buffer` to Cloudinary with the given upload options and returns the
   * created asset's CDN URL. Shared by the avatar and workspace-logo helpers.
   */
  private uploadBuffer(buffer: Buffer, options: UploadApiOptions): Promise<UploadApiResponse> {
    return new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, uploaded) => {
        if (error || !uploaded) {
          reject(new Error(error?.message ?? 'Cloudinary returned no result'))
          return
        }
        resolve(uploaded)
      })
      stream.end(buffer)
    })
  }

  /** Best-effort removal of an asset by public_id. Never throws. */
  private async destroy(publicId: string, event: string, meta: Record<string, unknown>): Promise<void> {
    if (!this.configured) return
    try {
      await cloudinary.uploader.destroy(publicId, { invalidate: true })
      log.info({ event, ...meta })
    } catch (error) {
      log.warn({ event: `${event}_failed`, ...meta, err: (error as Error).message })
    }
  }

  /**
   * Uploads (overwriting any previous one) the given buffer as the avatar for
   * `userId` and returns its CDN URL. The stored asset is normalised to a
   * 256×256 face-cropped webp; `invalidate` busts the CDN cache so the new
   * image shows immediately at the same public_id.
   */
  async uploadAvatar(buffer: Buffer, userId: string): Promise<string> {
    this.assertConfigured()

    const result = await this.uploadBuffer(buffer, {
      folder: 'avatars',
      public_id: `user_${userId}`,
      overwrite: true,
      invalidate: true,
      resource_type: 'image',
      format: 'webp',
      transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face' }],
    })

    log.info({ event: 'cloudinary.avatar_uploaded', userId, bytes: buffer.length })
    return result.secure_url
  }

  /** Best-effort removal of a user's avatar asset. Never throws. */
  async deleteAvatar(userId: string): Promise<void> {
    await this.destroy(`avatars/user_${userId}`, 'cloudinary.avatar_deleted', { userId })
  }

  /**
   * Uploads (overwriting any previous one) the given buffer as the workspace
   * logo for `tenantId` and returns its CDN URL. The asset is stored as webp,
   * downscaled to fit 512×512 (`crop: 'limit'` — never upscales, never crops,
   * preserves aspect ratio).
   */
  async uploadTenantLogo(buffer: Buffer, tenantId: string): Promise<string> {
    this.assertConfigured()

    const result = await this.uploadBuffer(buffer, {
      folder: 'tenants',
      public_id: `tenant_${tenantId}`,
      overwrite: true,
      invalidate: true,
      resource_type: 'image',
      format: 'webp',
      transformation: [{ width: 512, height: 512, crop: 'limit' }],
    })

    log.info({ event: 'cloudinary.tenant_logo_uploaded', tenantId, bytes: buffer.length })
    return result.secure_url
  }

  /** Best-effort removal of a workspace's logo asset. Never throws. */
  async deleteTenantLogo(tenantId: string): Promise<void> {
    await this.destroy(`tenants/tenant_${tenantId}`, 'cloudinary.tenant_logo_deleted', { tenantId })
  }
}
