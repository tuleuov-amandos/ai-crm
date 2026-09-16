import envConfig from 'src/common/config'

// Shared by the HTTP CORS setup (main.ts) and the chat WebSocket gateway
// (chat.gateway.ts) so the two transports never drift on which origins are
// trusted with credentials.
export function corsOriginValidator(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  // No Origin header (curl, server-to-server, mobile) — allow.
  if (!origin) return callback(null, true)

  const allowedOrigins = [envConfig.FRONTEND_URL, 'http://localhost:3000'].filter(Boolean)
  if (allowedOrigins.includes(origin)) return callback(null, true)

  // Allow this project's Vercel preview deployments (unique subdomain per
  // branch/PR), scoped to VERCEL_PREVIEW_PREFIX so we don't accidentally
  // trust arbitrary vercel.app sites (CORS here has credentials: true).
  if (envConfig.VERCEL_PREVIEW_PREFIX) {
    const previewPattern = new RegExp(`^https://${envConfig.VERCEL_PREVIEW_PREFIX}-[\\w-]+\\.vercel\\.app$`)
    if (previewPattern.test(origin)) return callback(null, true)
  }

  callback(new Error(`Origin ${origin} not allowed by CORS`))
}
