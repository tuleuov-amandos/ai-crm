import envConfig from 'src/common/config'

const isProduction = envConfig.NODE_ENV === 'production'

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  // SameSite=None requires Secure=true — browsers drop a None cookie sent without
  // Secure. So it is tied to the same `isProduction` flag as `secure`:
  //  - prod: sameSite 'none' + secure true → cross-site cookies (FE and API on
  //    different domains) work over HTTPS.
  //  - dev: sameSite 'lax' + secure false → works on http://localhost. 'none'
  //    here would be rejected anyway (no Secure), and cross-site cookies over
  //    plain http never work regardless.
  sameSite: isProduction ? ('none' as const) : ('lax' as const),
  path: '/',
  // COOKIE_DOMAIN задаётся в проде (напр. ".example.com"); undefined для локальной разработки.
  domain: envConfig.COOKIE_DOMAIN || undefined,
}
