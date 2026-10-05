import { Module } from '@nestjs/common'
import { PipelineStagesController } from './pipeline-stages.controller'
import { PipelineStagesService } from './pipeline-stages.service'
import { PipelineStagesRepository } from './pipeline-stages.repo'

@Module({
  controllers: [PipelineStagesController],
  providers: [PipelineStagesService, PipelineStagesRepository],
  // DealModule reads the stages for GET /deals/board.
  exports: [PipelineStagesRepository],
})
export class PipelineStagesModule {}
