import { Module } from '@nestjs/common'
import { InternalTenantsController } from './internal-tenants.controller'

/**
 * TODO: replace with a proper admin panel + PLATFORM_ADMIN role.
 * Temporary home for ops-only endpoints guarded by INTERNAL_ADMIN_TOKEN.
 */
@Module({
  controllers: [InternalTenantsController],
})
export class InternalModule {}
