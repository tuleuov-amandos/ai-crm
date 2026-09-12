import { createZodDto } from 'nestjs-zod'
import {
  LoginBodySchema,
  LoginResSchema,
  MeResSchema,
  TenantListItemSchema,
  UpdateTenantStatusSchema,
} from './platform-admin.model'
import z from 'zod'

export class LoginBodyDto extends createZodDto(LoginBodySchema) {}
export class LoginResDto extends createZodDto(LoginResSchema) {}

export class TenantListItemDto extends createZodDto(TenantListItemSchema) {}
export class TenantListResDto extends createZodDto(z.array(TenantListItemSchema)) {}

export class UpdateTenantStatusDto extends createZodDto(UpdateTenantStatusSchema) {}

export class MeResDto extends createZodDto(MeResSchema) {}
