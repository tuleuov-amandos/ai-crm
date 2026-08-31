import fs from 'fs'

type DatabaseSsl = { rejectUnauthorized: true; ca?: string } | undefined

/**
 * Railway's private network (*.railway.internal) never leaves Railway's infrastructure,
 * so there is no public-internet MITM surface and TLS is unnecessary there (Railway's
 * own recommendation). Every other host is treated as reachable over the public internet
 * and must present a certificate we can verify — optionally against a custom CA bundle
 * (e.g. AWS RDS's global-bundle.pem) pointed to by DATABASE_SSL_CA_PATH. We never fall
 * back to disabling verification: an unverifiable certificate should fail the connection,
 * not silently accept a possible MITM.
 */
export function getDatabaseSsl(databaseUrl: string): DatabaseSsl {
  let hostname = ''
  try {
    hostname = new URL(databaseUrl).hostname
  } catch {
    hostname = ''
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.railway.internal')) {
    return undefined
  }

  const caPath = process.env.DATABASE_SSL_CA_PATH
  return {
    rejectUnauthorized: true,
    ...(caPath ? { ca: fs.readFileSync(caPath, 'utf8') } : {}),
  }
}
