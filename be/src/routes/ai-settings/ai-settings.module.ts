import { Module } from '@nestjs/common'
import { AiSettingsController } from './ai-settings.controller'
import { AiSettingsService } from './ai-settings.service'
import { AiSettingsRepository } from './ai-settings.repo'

@Module({
  controllers: [AiSettingsController],
  providers: [AiSettingsService, AiSettingsRepository],
  // The AI analysis reads the tenant key through getDecryptedCredential (PR 3).
  exports: [AiSettingsService],
})
export class AiSettingsModule {}
