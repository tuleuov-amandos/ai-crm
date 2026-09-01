// Sentry init for the Node.js server runtime. Loaded from
// src/instrumentation.ts. One DSN for the whole app: the server falls back to
// the public NEXT_PUBLIC_SENTRY_DSN when a server-only SENTRY_DSN is not set.
// When neither is set, Sentry.init is never called and the SDK stays dormant.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // Errors only — no performance tracing for now.
    tracesSampleRate: 0,
    // Do not attach cookies / headers / request bodies / user IP.
    sendDefaultPii: false,
    debug: false,
  })
}
