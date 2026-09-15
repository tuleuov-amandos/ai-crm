import { createZodDto } from 'nestjs-zod'
import { GetMyTasksQuerySchema, GetMyTasksResSchema } from './tasks.model'

export class GetMyTasksQueryDto extends createZodDto(GetMyTasksQuerySchema) {}
export class GetMyTasksResDto extends createZodDto(GetMyTasksResSchema) {}
