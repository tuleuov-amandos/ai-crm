import { Global, Module } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from './services/prisma.service'
import { TokenService } from './services/token.service'
import { HashingService } from './services/hashing.service'
import { SharedUserRepository } from './repositories/shared-user.repo'
import { JwtModule } from '@nestjs/jwt'
import { RedisService } from './services/redis.service'
import { MailService } from './services/mail.service'
import { CloudinaryService } from './services/cloudinary.service'
import { ClsModule } from 'nestjs-cls'
import { CaslAbilityFactory } from './casl/casl-ability.factory'

// const sharedProviders = PrismaService;
const sharedProviders = [
  PrismaService,
  TokenService,
  HashingService,
  SharedUserRepository,
  RedisService,
  MailService,
  CloudinaryService,
  CaslAbilityFactory, // Register CaslAbilityFactory here
]
@Global()
@Module({
  imports: [
    JwtModule.register({}),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        // Correlation id. This middleware runs first for every incoming
        // request: it reuses an inbound `x-request-id` (e.g. set by an
        // upstream proxy) or generates a fresh uuid, stores it in CLS as
        // `requestId`, and echoes it back on the response. Any service — and
        // the pino root logger's mixin — reads it from CLS without threading
        // it through call arguments. nestjs-pino's `genReqId` picks up the
        // same value so request-summary lines and service lines share one id.
        generateId: true,
        idGenerator: (req: { headers: Record<string, string | string[] | undefined> }) => {
          const incoming = req.headers['x-request-id']
          return (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID()
        },
        setup: (cls, _req, res: { setHeader: (k: string, v: string) => void }) => {
          const id = cls.getId()
          cls.set('requestId', id)
          res.setHeader('x-request-id', id)
        },
      },
    }),
  ],
  providers: [...sharedProviders],
  exports: sharedProviders,
})
export class CommonModule {}
