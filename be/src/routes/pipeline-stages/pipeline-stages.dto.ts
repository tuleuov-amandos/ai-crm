import { createZodDto } from 'nestjs-zod'
import {
  CreatePipelineStageBodySchema,
  DeletePipelineStageQuerySchema,
  GetPipelineStagesResSchema,
  PipelineStageSchema,
  ReorderPipelineStagesBodySchema,
  UpdatePipelineStageBodySchema,
} from './pipeline-stages.model'

export class PipelineStageResDto extends createZodDto(PipelineStageSchema) {}
export class GetPipelineStagesResDto extends createZodDto(GetPipelineStagesResSchema) {}

export class CreatePipelineStageBodyDto extends createZodDto(CreatePipelineStageBodySchema) {}
export class UpdatePipelineStageBodyDto extends createZodDto(UpdatePipelineStageBodySchema) {}
export class ReorderPipelineStagesBodyDto extends createZodDto(ReorderPipelineStagesBodySchema) {}
export class DeletePipelineStageQueryDto extends createZodDto(DeletePipelineStageQuerySchema) {}
