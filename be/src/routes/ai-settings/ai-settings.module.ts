import { Module } from '@nestjs/common'
import { AiSettingsController } from './ai-settings.controller'
import { AiSettingsService } from './ai-settings.service'
import { AiSettingsRepository } from './ai-settings.repo'

@Module({
  controllers: [AiSettingsController],
  providers: [AiSettingsService, AiSettingsRepository],
  // The AI client reads the tenant key through getDecryptedCredential.
  exports: [AiSettingsService],
})
export class AiSettingsModule {}
