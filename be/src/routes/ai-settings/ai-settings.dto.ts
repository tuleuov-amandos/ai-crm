import { createZodDto } from 'nestjs-zod'
import { AiSettingsResSchema, UpdateAiSettingsBodySchema } from './ai-settings.model'

export class AiSettingsResDto extends createZodDto(AiSettingsResSchema) {}

export class UpdateAiSettingsBodyDto extends createZodDto(UpdateAiSettingsBodySchema) {}
