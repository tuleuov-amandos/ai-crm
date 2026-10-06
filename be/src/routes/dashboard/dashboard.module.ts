import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { DashboardRepository } from './dashboard.repo'
import { PipelineStagesModule } from '../pipeline-stages/pipeline-stages.module'

@Module({
  imports: [PipelineStagesModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
