import { createZodDto } from 'nestjs-zod'
import {
  CreateDealBodySchema,
  CreateDealResSchema,
  UpdateDealStageBodySchema,
  UpdateDealPaymentStatusBodySchema,
  UpdateDealBodySchema,
  GetDealResSchema,
  GetDealsPipelineResSchema,
  GetDealsBoardResSchema,
  GetPipelineQuerySchema,
  GetBoardQuerySchema,
  UpdateDealResSchema,
  AnalyzeDealResSchema,
  AnalyzeDealBodySchema,
  ArchiveDealsBodySchema,
  ArchiveDealsResSchema,
} from './deal.model'

export class CreateDealBodyDto extends createZodDto(CreateDealBodySchema) {}
export class CreateDealResDto extends createZodDto(CreateDealResSchema) {}

export class UpdateDealStageBodyDto extends createZodDto(UpdateDealStageBodySchema) {}
export class UpdateDealPaymentStatusBodyDto extends createZodDto(UpdateDealPaymentStatusBodySchema) {}
export class UpdateDealBodyDto extends createZodDto(UpdateDealBodySchema) {}
export class UpdateDealResDto extends createZodDto(UpdateDealResSchema) {}

export class GetDealResDto extends createZodDto(GetDealResSchema) {}
export class GetDealsPipelineResDto extends createZodDto(GetDealsPipelineResSchema) {}
export class GetPipelineQueryDto extends createZodDto(GetPipelineQuerySchema) {}
export class GetDealsBoardResDto extends createZodDto(GetDealsBoardResSchema) {}
export class GetBoardQueryDto extends createZodDto(GetBoardQuerySchema) {}

export class ArchiveDealsBodyDto extends createZodDto(ArchiveDealsBodySchema) {}
export class ArchiveDealsResDto extends createZodDto(ArchiveDealsResSchema) {}

export class AnalyzeDealBodyDto extends createZodDto(AnalyzeDealBodySchema) {}
export class AnalyzeDealResDto extends createZodDto(AnalyzeDealResSchema) {}
