import { Injectable } from '@nestjs/common'
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary'
import { v4 as uuidv4 } from 'uuid'
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

// Activity attachment: exactly one file per activity — a PDF, JPEG or PNG.
// HEIC/HEIF is explicitly rejected by the caller (not auto-converted).
export const ACTIVITY_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ACTIVITY_ATTACHMENT_ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const

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

  /**
   * Uploads (overwriting any previous one) the given buffer as the single
   * attachment for `activityId` and returns its CDN URL and public_id.
   *
   * Unlike avatars/logos this is not always an image — PDFs must go through
   * unchanged, so `resource_type: 'auto'` is used and NO transformation is
   * applied (Cloudinary would otherwise try to treat the PDF as an image and
   * corrupt it, or a transform pipeline could re-encode it).
   *
   * IMPORTANT (ops): Cloudinary's "Restrict PDF and ZIP files delivery"
   * security setting blocks PDF delivery from the CDN by default. The
   * workspace owner must disable it in Cloudinary Dashboard → Settings →
   * Security, or uploaded PDFs will 401 even though the upload succeeded.
   * This cannot be worked around from the API.
   */
  async uploadActivityAttachment(
    buffer: Buffer,
    activityId: string,
    mimeType: string,
  ): Promise<{ url: string; publicId: string }> {
    this.assertConfigured()

    // No `transformation` and no `format` here — unlike uploadAvatar /
    // uploadTenantLogo, this upload must preserve the file exactly as sent.
    const result = await this.uploadBuffer(buffer, {
      folder: 'activity-attachments',
      public_id: `activity_${activityId}`,
      overwrite: true,
      invalidate: true,
      resource_type: 'auto',
    })

    log.info({
      event: 'cloudinary.activity_attachment_uploaded',
      activityId,
      bytes: buffer.length,
      isPdf: mimeType === 'application/pdf',
    })
    return { url: result.secure_url, publicId: result.public_id }
  }

  /** Best-effort removal of an activity's attachment asset by public_id. Never throws. */
  async deleteActivityAttachment(publicId: string): Promise<void> {
    await this.destroy(publicId, 'cloudinary.activity_attachment_deleted', { publicId })
  }

  /**
   * Uploads one file of a chat message's attachments and returns its CDN URL
   * and public_id. A message can carry several attachments (unlike an
   * Activity's single attachment), so — unlike `uploadActivityAttachment` —
   * `public_id` includes a random suffix per file instead of being derived
   * solely from the owning record, and uploads are never `overwrite`s.
   *
   * Same format constraints and no-transformation handling as
   * `uploadActivityAttachment` (`resource_type: 'auto'`, PDF/JPEG/PNG only).
   */
  async uploadChatAttachment(
    buffer: Buffer,
    messageId: string,
    mimeType: string,
  ): Promise<{ url: string; publicId: string }> {
    this.assertConfigured()

    const result = await this.uploadBuffer(buffer, {
      folder: 'chat-attachments',
      public_id: `message_${messageId}_${uuidv4()}`,
      resource_type: 'auto',
    })

    log.info({
      event: 'cloudinary.chat_attachment_uploaded',
      messageId,
      bytes: buffer.length,
      isPdf: mimeType === 'application/pdf',
    })
    return { url: result.secure_url, publicId: result.public_id }
  }
}
