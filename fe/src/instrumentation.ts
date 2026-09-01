// Next.js instrumentation hook. Picks the right Sentry init for the current
// server runtime. The `if (dsn)` guard lives inside each config file, so this
// stays a no-op when no DSN is configured.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Captures errors thrown in nested React Server Components / route handlers.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
