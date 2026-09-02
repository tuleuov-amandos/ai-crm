import { Injectable } from '@nestjs/common'
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary'
import { AppException, UserErrorCode } from '../errors'
import envConfig from '../config'
import { rootLogger } from '../logger/root-logger'

const log = rootLogger.child({ context: 'CloudinaryService' })

// Accepted avatar upload types and the hard size cap. The cap is enforced here
// (and mirrored by a multer `limits` guard on the route) so an oversized body
// is rejected as a localizable 4xx rather than after it hits Cloudinary.
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const

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
      throw AppException.serviceUnavailable(
        UserErrorCode.AVATAR_STORAGE_UNAVAILABLE,
        'Avatar storage is not configured',
      )
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

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'avatars',
          public_id: `user_${userId}`,
          overwrite: true,
          invalidate: true,
          resource_type: 'image',
          format: 'webp',
          transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face' }],
        },
        (error, uploaded) => {
          if (error || !uploaded) {
            reject(new Error(error?.message ?? 'Cloudinary returned no result'))
            return
          }
          resolve(uploaded)
        },
      )
      stream.end(buffer)
    })

    log.info({ event: 'cloudinary.avatar_uploaded', userId, bytes: buffer.length })
    return result.secure_url
  }

  /** Best-effort removal of a user's avatar asset. Never throws. */
  async deleteAvatar(userId: string): Promise<void> {
    if (!this.configured) return
    try {
      await cloudinary.uploader.destroy(`avatars/user_${userId}`, { invalidate: true })
      log.info({ event: 'cloudinary.avatar_deleted', userId })
    } catch (error) {
      log.warn({ event: 'cloudinary.avatar_delete_failed', userId, err: (error as Error).message })
    }
  }
}
