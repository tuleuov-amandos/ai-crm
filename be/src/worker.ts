import 'reflect-metadata';
import { Logger } from '@nestjs/common';
// Importing the config module here validates env vars (and loads .env) exactly
// like main.ts does, so the worker fails fast on misconfiguration.
import './common/config';
import { startAiWorker } from './routes/ai/ai.processor';

const logger = new Logger('WorkerBootstrap');

/**
 * Standalone entrypoint for the background worker.
 *
 * Unlike main.ts this does NOT call NestFactory.create / app.listen — there is
 * no HTTP server. The AI worker only needs a Redis connection and a
 * PrismaService instance, both of which it creates directly (see
 * ai.processor.ts), so a full Nest application context is unnecessary.
 */
function bootstrap() {
  const worker = startAiWorker();
  logger.log('AI worker process started');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`Received ${signal}, closing AI worker...`);
    try {
      await worker.close();
      logger.log('AI worker closed cleanly');
      process.exit(0);
    } catch (err) {
      logger.error('Error while closing AI worker', err instanceof Error ? err.stack : String(err));
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap();
