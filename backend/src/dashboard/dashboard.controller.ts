import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/permissions.decorator';

@ApiTags('Dashboard & Reporting Overview')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @RequirePermission(
    'dashboard.view',
    'view_dashboard',
    'inventory.view',
    'view_inventory',
    'production.view',
    'manage_production',
    'view_reports',
    'view_traceability',
  )
  @ApiOperation({
    summary:
      'Get unified real-time dashboard overview with KPIs, live lots, and movements',
  })
  async getOverview() {
    const data = await this.dashboardService.getOverview();
    return {
      message: 'Dashboard overview retrieved successfully',
      data,
    };
  }
}
