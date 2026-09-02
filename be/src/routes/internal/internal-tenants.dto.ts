import { createZodDto } from 'nestjs-zod'
import { UpdateTenantStatusSchema } from './internal-tenants.model'

export class UpdateTenantStatusDto extends createZodDto(UpdateTenantStatusSchema) {}
