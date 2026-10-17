import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { YarnModule } from './yarn/yarn.module';
import { LotsModule } from './lots/lots.module';
import { InventoryModule } from './inventory/inventory.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ProductionModule } from './production/production.module';
import { ProductsModule } from './products/products.module';
import { PartiesModule } from './parties/parties.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { TraceabilityModule } from './traceability/traceability.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppCacheModule } from './common/cache/app-cache.module';

@Module({
  imports: [
    AppCacheModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    YarnModule,
    LotsModule,
    InventoryModule,
    TransactionsModule,
    ProductionModule,
    ProductsModule,
    PartiesModule,
    PurchaseOrdersModule,
    TraceabilityModule,
    ReportsModule,
    DashboardModule,
  ],
})
export class AppModule {}
