// Must be first: initializes Sentry (when SENTRY_DSN is set) and its
// uncaughtException / unhandledRejection handlers before anything else loads.
import './instrument'
import { NestFactory } from '@nestjs/core'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import envConfig from './common/config'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { initAiSseBridge } from './routes/ai/ai.sse'
import { Sentry } from './instrument'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  // Route Nest's own logs (and everything below) through pino.
  app.useLogger(app.get(Logger))
  const logger = app.get(Logger)

  // Trust exactly 1 proxy hop (Railway's edge proxy) so express derives req.ip
  // from the outermost X-Forwarded-For entry it sets. Without this, req.ip is
  // the proxy's own IP and the ThrottlerGuard's per-IP buckets collapse into
  // one shared bucket for all clients. Using `true` (trust all hops) would let
  // a client forge its own X-Forwarded-For prefix to spoof a different IP and
  // evade the per-IP limit entirely — `1` trusts only the hop count we
  // actually have.
  app.getHttpAdapter().getInstance().set('trust proxy', 1)

  // Relay AI events emitted by the standalone worker process to SSE clients
  // connected to this HTTP process.
  initAiSseBridge()

  app.use(helmet())
  app.use(cookieParser())
  app.enableCors({
    origin: envConfig.FRONTEND_URL || 'http://localhost:3000',
    // origin: true,
    credentials: true,
  })

  // Swagger setup — never mount the API schema in production, where it would
  // be publicly reachable with no auth in front of it.
  if (envConfig.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('CRM SaaS API')
      .setDescription('API documentation cho hệ thống CRM SaaS')
      .setVersion('1.0')
      .addCookieAuth('accessToken')
      .addBearerAuth()
      .build()
    const document = SwaggerModule.createDocument(app, config)
    // Clean up the OpenAPI doc for proper Zod schema representation
    const cleanedDocument = cleanupOpenApiDoc(document)
    SwaggerModule.setup('api-docs', app, cleanedDocument, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    })
  }

  const port = envConfig.PORT || 3001
  await app.listen(port)
  logger.log(`Server running on port: ${port}`)
  if (envConfig.NODE_ENV !== 'production') {
    logger.log(`Swagger: http://localhost:${port}/api-docs`)
  }
}

bootstrap().catch(async (err) => {
  // Startup failure — capture before the process dies.
  Sentry.captureException(err)
  await Sentry.flush(2000)
  console.error('Fatal error during bootstrap:', err)
  process.exit(1)
})
