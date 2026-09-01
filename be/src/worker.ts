import 'reflect-metadata'
// Must be first (after reflect-metadata): initializes Sentry + its global
// error handlers before the worker code loads, so startup crashes are caught.
import './instrument'
// Importing the config module here validates env vars (and loads .env) exactly
// like main.ts does, so the worker fails fast on misconfiguration.
import './common/config'
import { rootLogger } from './common/logger/root-logger'
import { startAiWorker } from './routes/ai/ai.processor'
import { Sentry } from './instrument'

const logger = rootLogger.child({ context: 'WorkerBootstrap' })

/**
 * Standalone entrypoint for the background worker.
 *
 * Unlike main.ts this does NOT call NestFactory.create / app.listen — there is
 * no HTTP server. The AI worker only needs a Redis connection and a
 * PrismaService instance, both of which it creates directly (see
 * ai.processor.ts), so a full Nest application context is unnecessary.
 */
function bootstrap() {
  const worker = startAiWorker()
  logger.info('AI worker process started')

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'Received signal, closing AI worker')
    try {
      await worker.close()
      logger.info('AI worker closed cleanly')
      process.exit(0)
    } catch (err) {
      logger.error({ err }, 'Error while closing AI worker')
      Sentry.captureException(err)
      await Sentry.flush(2000)
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

try {
  bootstrap()
} catch (err) {
  logger.error({ err }, 'Fatal error during worker bootstrap')
  Sentry.captureException(err)
  void Sentry.flush(2000).finally(() => process.exit(1))
}
