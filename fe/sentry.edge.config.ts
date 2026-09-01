// Sentry init for the Edge runtime (middleware / edge routes). Loaded from
// src/instrumentation.ts. Same single-DSN rule as sentry.server.config.ts.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    debug: false,
  })
}
