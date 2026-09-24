import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { pinoHttpOptions } from './common/logger/pino-options'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { CommonModule } from './common/common.module'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core/constants'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import { APP_PIPE } from '@nestjs/core/constants'
import { MyZodValidationPipe } from './common/pipe/custom-zod-validation.pipe'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { AuthModule } from './routes/auth/auth.module'
import { ContactsModule } from './routes/contacts/contacts.module'
import { ActivitiesModule } from './routes/activities/activities.module'
import { DealModule } from './routes/deal/deal.module'
import { TasksModule } from './routes/tasks/tasks.module'
import { ChatModule } from './routes/chat/chat.module'
import { UsersModule } from './routes/users/users.module'
import { TenantsModule } from './routes/tenants/tenants.module'
import { InvitationsModule } from './routes/invitations/invitations.module'
import { DashboardModule } from './routes/dashboard/dashboard.module'
import { ReportsModule } from './routes/reports/reports.module'
import { AiModule } from './routes/ai/ai.module'
import { TenantInterceptor } from './common/interceptors/tenant.interceptor'
import { AuditLogsModule } from './routes/audit-logs/audit-logs.module'
import { HealthModule } from './routes/health/health.module'
import { InternalModule } from './routes/internal/internal.module'
import { PlatformAdminModule } from './routes/platform-admin/platform-admin.module'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { EventEmitterModule } from '@nestjs/event-emitter'
@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: pinoHttpOptions }),
    EventEmitterModule.forRoot(),
    CommonModule,
    AuthModule,
    PlatformAdminModule,
    ContactsModule,
    ActivitiesModule,
    DealModule,
    TasksModule,
    ChatModule,
    UsersModule,
    TenantsModule,
    InvitationsModule,
    DashboardModule,
    ReportsModule,
    AiModule,
    AuditLogsModule,
    HealthModule,
    InternalModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          // Global default for every endpoint without its own @Throttle.
          // A single SPA navigation fires 5-8 parallel GETs and a chat
          // channel click fires ~3 more, so 10/min was exhausted within a few
          // actions (e.g. POST /chat/channels/:id/read silently got 429).
          // 300/min (~5 req/s) per client fits normal usage of an internal
          // B2B CRM. Brute-force-sensitive endpoints (login, register,
          // refresh, password change, invitations) override the same
          // "default" throttler via @Throttle(BRUTE_FORCE_GUARD_THROTTLE)
          // with a much stricter limit; do not raise those.
          //
          // SCALING NOTE: ThrottlerGuard tracks by IP. Employees behind one
          // office NAT share this single bucket, so 300/min is per office, not
          // per user. Proper fix (separate task): a custom ThrottlerGuard with
          // getTracker() returning userId for authenticated requests and
          // falling back to IP for anonymous ones. Also, the in-memory
          // storage is per-process; multiple instances need a Redis storage.
          ttl: 60000,
          limit: 300,
        },
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: MyZodValidationPipe,
    },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
