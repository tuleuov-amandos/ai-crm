import envConfig from 'src/common/config'

const isProduction = envConfig.NODE_ENV === 'production'

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  path: '/',
  // COOKIE_DOMAIN задаётся в проде (напр. ".example.com"); undefined для локальной разработки.
  domain: envConfig.COOKIE_DOMAIN || undefined,
}