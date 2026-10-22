import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProductionService } from './production.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { CreateProductionTeamDto } from './dto/create-production-team.dto';
import { UpdateProductionTeamDto } from './dto/update-production-team.dto';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import { AllocateYarnDto } from './dto/allocate-yarn.dto';
import { RecordConsumptionDto } from './dto/record-consumption.dto';
import { CorrectConsumptionDto } from './dto/correct-consumption.dto';
import { RecordProductionReturnDto } from './dto/record-return.dto';
import { RecordProductionOutputDto } from './dto/record-output.dto';
import { ProductionFilterDto } from './dto/production-filter.dto';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    email?: string;
    role?: { code?: string };
    permissions?: string[];
  };
}

@ApiTags('Production & Floor Tracking')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  // ---------------------------------------------------------------------------
  // 1. PRODUCTION OVERVIEW / SUMMARY
  // ---------------------------------------------------------------------------
  @Get('summary')
  @RequirePermission('production.view', 'manage_production')
  @ApiOperation({ summary: 'Get aggregated production KPIs (Orders, Allocated, Consumed, Floor Stock, Output, Yield)' })
  async getSummary() {
    const data = await this.productionService.getProductionSummary();
    return {
      message: 'Production summary retrieved successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. PRODUCTION TEAMS MASTER
  // ---------------------------------------------------------------------------
  @Get('teams')
  @RequirePermission(
    'production.view',
    'production.manage_teams',
    'manage_production',
    'production.allocate',
    'inventory.issue',
    'issue_yarn',
  )
  @ApiOperation({ summary: 'Get all production teams with active orders and stock balances' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async getTeams(@Query('includeInactive') includeInactive?: string) {
    const shouldInclude = includeInactive === 'true';
    const data = await this.productionService.getTeams(shouldInclude);
    return {
      message: 'Production teams retrieved successfully',
      data,
    };
  }

  @Get('teams/:id')
  @RequirePermission(
    'production.view',
    'production.manage_teams',
    'manage_production',
    'production.allocate',
    'inventory.issue',
    'issue_yarn',
  )
  @ApiOperation({ summary: 'Get production team details with inventory breakdown' })
  async getTeamById(@Param('id') id: string) {
    const data = await this.productionService.getTeamById(id);
    return {
      message: 'Production team retrieved successfully',
      data,
    };
  }

  @Post('teams')
  @RequirePermission('production.manage_teams', 'manage_production')
  @ApiOperation({ summary: 'Create a new production team' })
  async createTeam(@Body() dto: CreateProductionTeamDto, @Req() req: AuthenticatedRequest) {
    const data = await this.productionService.createTeam(dto, req.user?.id);
    return {
      message: 'Production team created successfully',
      data,
    };
  }

  @Patch('teams/:id')
  @RequirePermission('production.manage_teams', 'manage_production')
  @ApiOperation({ summary: 'Update production team details' })
  async updateTeam(
    @Param('id') id: string,
    @Body() dto: UpdateProductionTeamDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.productionService.updateTeam(id, dto, req.user?.id);
    return {
      message: 'Production team updated successfully',
      data,
    };
  }

  @Delete('teams/:id')
  @RequirePermission('production.manage_teams', 'manage_production')
  @ApiOperation({ summary: 'Deactivate / delete production team' })
  async deleteTeam(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const data = await this.productionService.deleteTeam(id, req.user?.id);
    return {
      message: data.message,
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. ELIGIBLE INVENTORY ISSUES (FOR YARN ALLOCATION)
  // ---------------------------------------------------------------------------
  @Get('eligible-issues')
  @RequirePermission(
    'production.allocate',
    'production.view',
    'manage_production',
    'inventory.issue',
    'issue_yarn',
    'view_inventory',
  )
  @ApiOperation({ summary: 'Get issued inventory lots with unallocated balance available for floor assignment' })
  @ApiQuery({ name: 'lotId', required: false })
  @ApiQuery({ name: 'partyId', required: false })
  @ApiQuery({ name: 'count', required: false })
  @ApiQuery({ name: 'search', required: false })
  async getEligibleIssues(
    @Query('lotId') lotId?: string,
    @Query('partyId') partyId?: string,
    @Query('count') count?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.productionService.getEligibleIssues({ lotId, partyId, count, search });
    return {
      message: 'Eligible issue transactions retrieved successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. PRODUCTION WORK ORDERS
  // ---------------------------------------------------------------------------
  @Get('orders')
  @RequirePermission(
    'production.view',
    'manage_production',
    'production.allocate',
    'inventory.issue',
    'issue_yarn',
  )
  @ApiOperation({ summary: 'Get paginated list of production work orders with filters' })
  async getOrders(@Query() filterDto: ProductionFilterDto) {
    const result = await this.productionService.getOrders(filterDto);
    return {
      message: 'Production work orders retrieved successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('orders/:id')
  @RequirePermission(
    'production.view',
    'manage_production',
    'production.allocate',
    'inventory.issue',
    'issue_yarn',
  )
  @ApiOperation({ summary: 'Get full details of a production work order' })
  async getOrderById(@Param('id') id: string) {
    const data = await this.productionService.getOrderById(id);
    return {
      message: 'Work order details retrieved successfully',
      data,
    };
  }

  @Post('orders')
  @RequirePermission('production.create', 'manage_production')
  @ApiOperation({ summary: 'Create a new production work order' })
  async createOrder(@Body() dto: CreateProductionOrderDto, @Req() req: AuthenticatedRequest) {
    const data = await this.productionService.createOrder(dto, req.user?.id);
    return {
      message: 'Production work order created successfully',
      data,
    };
  }

  @Patch('orders/:id')
  @RequirePermission('production.edit', 'manage_production')
  @ApiOperation({ summary: 'Update work order details or status' })
  async updateOrder(
    @Param('id') id: string,
    @Body() dto: UpdateProductionOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.productionService.updateOrder(id, dto, req.user?.id);
    return {
      message: 'Production work order updated successfully',
      data,
    };
  }

  @Post('orders/:id/complete')
  @RequirePermission('production.complete', 'manage_production')
  @ApiOperation({ summary: 'Mark production work order as completed' })
  async completeOrder(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const data = await this.productionService.completeOrder(id, req.user?.id);
    return {
      message: 'Work order marked as completed successfully',
      data: data.order,
      unconsumedWarning: data.unconsumedWarning,
    };
  }

  @Post('orders/:id/cancel')
  @RequirePermission('production.cancel', 'manage_production')
  @ApiOperation({ summary: 'Cancel production work order' })
  async cancelOrder(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body('reason') reason?: string,
  ) {
    const data = await this.productionService.cancelOrder(id, reason, req.user?.id);
    return {
      message: 'Work order cancelled successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. YARN ALLOCATION
  // ---------------------------------------------------------------------------
  @Post('orders/:id/allocations')
  @RequirePermission(
    'production.allocate',
    'manage_production',
    'inventory.issue',
    'issue_yarn',
  )
  @ApiOperation({ summary: 'Allocate issued yarn lot to a work order and production team' })
  async allocateYarn(
    @Param('id') orderId: string,
    @Body() dto: AllocateYarnDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.productionService.allocateYarn(orderId, dto, req.user?.id);
    return {
      message: 'Yarn allocated to work order successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 6. RECORD ACTUAL CONSUMPTION
  // ---------------------------------------------------------------------------
  @Post('orders/:id/consumption')
  @RequirePermission('production.consume', 'record_consumption', 'manage_production')
  @ApiOperation({ summary: 'Record actual yarn consumption from allocated team balance' })
  async recordConsumption(
    @Param('id') orderId: string,
    @Body() dto: RecordConsumptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.productionService.recordConsumption(orderId, dto, req.user?.id);
    return {
      message: 'Yarn consumption recorded successfully',
      data,
    };
  }

  @Post('consumption/:id/correct')
  @RequirePermission('production.correct', 'manage_production')
  @ApiOperation({ summary: 'Correct / reverse a previous consumption entry with audit trail' })
  async correctConsumption(
    @Param('id') consumptionId: string,
    @Body() dto: CorrectConsumptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.productionService.correctConsumption(consumptionId, dto, req.user?.id);
    return {
      message: 'Consumption record corrected successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 7. RECORD RETURN OF UNUSED YARN
  // ---------------------------------------------------------------------------
  @Post('orders/:id/returns')
  @RequirePermission('production.return', 'manage_production')
  @ApiOperation({ summary: 'Return unused allocated yarn from team back to Main Stock' })
  async recordReturn(
    @Param('id') orderId: string,
    @Body() dto: RecordProductionReturnDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.productionService.recordReturn(orderId, dto, req.user?.id);
    return {
      message: 'Unused yarn returned to main warehouse stock successfully',
      data: data.productionReturn,
      inventoryTransaction: data.inventoryTransaction,
      lotStock: data.lotStock,
    };
  }

  // ---------------------------------------------------------------------------
  // 8. RECORD PRODUCTION OUTPUT & YIELD
  // ---------------------------------------------------------------------------
  @Post('orders/:id/output')
  @RequirePermission('production.complete', 'production.consume', 'manage_production')
  @ApiOperation({ summary: 'Record finished product output and calculate batch yield' })
  async recordOutput(
    @Param('id') orderId: string,
    @Body() dto: RecordProductionOutputDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.productionService.recordOutput(orderId, dto, req.user?.id);
    return {
      message: 'Production output recorded successfully',
      data: data.output,
      productionYield: data.productionYield,
    };
  }

  // ---------------------------------------------------------------------------
  // 9. TRACEABILITY
  // ---------------------------------------------------------------------------
  @Get('orders/:id/traceability')
  @RequirePermission('production.view', 'view_traceability', 'manage_production')
  @ApiOperation({ summary: 'Get end-to-end forward/backward traceability tree for a work order' })
  async getOrderTraceability(@Param('id') id: string) {
    const data = await this.productionService.getOrderTraceability(id);
    return {
      message: 'Work order traceability tree retrieved successfully',
      data,
    };
  }
}
