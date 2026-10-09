import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { PrismaService } from 'src/common/services/prisma.service'
import { AiSettingsModule } from '../ai-settings/ai-settings.module'
// NOTE: the BullMQ worker is no longer started here. It runs as a separate
// process/service via `src/worker.ts` (npm run start:worker) so the API and
// the worker can be scaled and deployed independently.

@Module({
  imports: [AiSettingsModule],
  providers: [AiService, PrismaService],
  exports: [AiService],
})
export class AiModule {}
