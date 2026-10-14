import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  CreatePORequirementDto,
} from './dto/create-purchase-order.dto';
import {
  UpdatePurchaseOrderDto,
  CancelPurchaseOrderDto,
  PurchaseOrderFilterDto,
} from './dto/update-purchase-order.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/permissions.decorator';

@ApiTags('Purchase Orders & Requirements')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  // ---------------------------------------------------------------------------
  // 1. GET ALL PURCHASE ORDERS (WITH SERVER FILTERS & SUMMARY)
  // ---------------------------------------------------------------------------
  @Get()
  @RequirePermission('manage_purchase_orders', 'purchase_orders.view', 'view_inventory')
  @ApiOperation({
    summary: 'Get all purchase orders with requirement lines and fulfillment metrics',
  })
  @ApiResponse({ status: 200, description: 'Purchase orders retrieved successfully' })
  async findAll(@Query() filter: PurchaseOrderFilterDto) {
    const data = await this.purchaseOrdersService.findAll(filter);
    return {
      success: true,
      message: 'Purchase orders retrieved successfully',
      data: data.purchaseOrders,
      summary: data.summary,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. GET ACTIVE REQUIREMENTS CATALOG (FOR INVENTORY ISSUE DROPDOWNS)
  // ---------------------------------------------------------------------------
  @Get('requirements')
  @RequirePermission('manage_purchase_orders', 'purchase_orders.view', 'view_inventory')
  @ApiOperation({
    summary: 'Get active PO requirement lines with remaining balance and 103% ceiling for issue selection',
  })
  @ApiQuery({ name: 'poNumber', required: false, type: String })
  @ApiQuery({ name: 'yarnCount', required: false, type: String })
  @ApiQuery({ name: 'purpose', required: false, type: String })
  @ApiQuery({ name: 'partyId', required: false, type: String })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  async getRequirements(
    @Query('poNumber') poNumber?: string,
    @Query('yarnCount') yarnCount?: string,
    @Query('purpose') purpose?: string,
    @Query('partyId') partyId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const data = await this.purchaseOrdersService.getRequirements({
      poNumber,
      yarnCount,
      purpose,
      partyId,
      includeArchived: includeArchived === 'true',
    });
    return {
      success: true,
      message: 'PO Requirements catalog retrieved successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 2B. ARCHIVE PO REQUIREMENT LINE (SOFT DELETE)
  // ---------------------------------------------------------------------------
  @Patch('requirements/:id/archive')
  @RequirePermission('manage_purchase_orders', 'purchase_orders.manage_requirements', 'purchase_orders.edit')
  @ApiOperation({
    summary: 'Archive a PO requirement line (soft delete), excluding it from new operations',
  })
  @ApiParam({ name: 'id', description: 'PO Requirement UUID' })
  async archiveRequirement(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: { user?: { id?: string } },
  ) {
    const data = await this.purchaseOrdersService.archiveRequirement(
      id,
      req.user?.id,
      body?.reason,
    );
    return {
      success: true,
      message: `Requirement for count "${data.yarnCount}" (${data.purpose}) has been archived successfully`,
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 2C. RESTORE PO REQUIREMENT LINE
  // ---------------------------------------------------------------------------
  @Patch('requirements/:id/restore')
  @RequirePermission('manage_purchase_orders', 'purchase_orders.manage_requirements', 'purchase_orders.edit')
  @ApiOperation({
    summary: 'Restore an archived PO requirement line back to active state',
  })
  @ApiParam({ name: 'id', description: 'PO Requirement UUID' })
  async restoreRequirement(
    @Param('id') id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const data = await this.purchaseOrdersService.restoreRequirement(
      id,
      req.user?.id,
    );
    return {
      success: true,
      message: `Requirement for count "${data.yarnCount}" (${data.purpose}) has been restored successfully`,
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 2D. DELETE PO REQUIREMENT LINE (BLOCKED IF HISTORICAL ISSUES EXIST)
  // ---------------------------------------------------------------------------
  @Delete('requirements/:id')
  @RequirePermission('manage_purchase_orders', 'purchase_orders.manage_requirements', 'delete_records')
  @ApiOperation({
    summary: 'Hard delete an unissued PO requirement line (blocked if historical issues exist)',
  })
  @ApiParam({ name: 'id', description: 'PO Requirement UUID' })
  async deleteRequirement(
    @Param('id') id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const result = await this.purchaseOrdersService.deleteRequirement(
      id,
      req.user?.id,
    );
    return {
      success: true,
      message: result.message,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. GET SINGLE PURCHASE ORDER DETAIL
  // ---------------------------------------------------------------------------
  @Get(':id')
  @RequirePermission('manage_purchase_orders', 'purchase_orders.view', 'view_inventory')
  @ApiOperation({
    summary: 'Get detailed purchase order by ID or PO Number including linked transaction history',
  })
  @ApiParam({ name: 'id', description: 'Purchase Order UUID or PO Number' })
  async findById(@Param('id') id: string) {
    const data = await this.purchaseOrdersService.findById(id);
    return {
      success: true,
      message: 'Purchase order details retrieved successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. CREATE NEW PURCHASE ORDER WITH MULTIPLE REQUIREMENTS
  // ---------------------------------------------------------------------------
  @Post()
  @RequirePermission('manage_purchase_orders', 'purchase_orders.create')
  @ApiOperation({
    summary: 'Create a new purchase order with multiple yarn requirement lines',
  })
  @ApiResponse({ status: 201, description: 'Purchase order created successfully' })
  async create(
    @Body() dto: CreatePurchaseOrderDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const data = await this.purchaseOrdersService.create(dto, req.user?.id);
    return {
      success: true,
      message: `Purchase Order "${data.poNumber}" created successfully with ${data.requirementsCount} requirement lines`,
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. UPDATE PURCHASE ORDER HEADER & REQUIREMENTS
  // ---------------------------------------------------------------------------
  @Patch(':id')
  @RequirePermission('manage_purchase_orders', 'purchase_orders.edit')
  @ApiOperation({
    summary: 'Update purchase order header and modify/add requirement lines',
  })
  @ApiParam({ name: 'id', description: 'Purchase Order UUID' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const data = await this.purchaseOrdersService.update(id, dto, req.user?.id);
    return {
      success: true,
      message: `Purchase Order "${data.poNumber}" updated successfully`,
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 6. CANCEL PURCHASE ORDER (SOFT CANCELLATION)
  // ---------------------------------------------------------------------------
  @Post(':id/cancel')
  @RequirePermission('manage_purchase_orders', 'purchase_orders.cancel')
  @ApiOperation({
    summary: 'Cancel a purchase order without hard-deleting historical records',
  })
  @ApiParam({ name: 'id', description: 'Purchase Order UUID' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelPurchaseOrderDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const data = await this.purchaseOrdersService.cancel(id, dto, req.user?.id);
    return {
      success: true,
      message: `Purchase Order "${data.poNumber}" has been cancelled`,
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 7. ADD REQUIREMENT LINE TO EXISTING PO
  // ---------------------------------------------------------------------------
  @Post(':id/requirements')
  @RequirePermission('manage_purchase_orders', 'purchase_orders.manage_requirements')
  @ApiOperation({
    summary: 'Add an additional yarn requirement line to an existing purchase order',
  })
  @ApiParam({ name: 'id', description: 'Purchase Order UUID' })
  async addRequirement(
    @Param('id') id: string,
    @Body() dto: CreatePORequirementDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const data = await this.purchaseOrdersService.addRequirement(
      id,
      dto,
      req.user?.id,
    );
    return {
      success: true,
      message: `Requirement for count "${data.yarnCount}" (${data.purpose}) added successfully`,
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 8. GET FULFILLMENT SUMMARY FOR A PO
  // ---------------------------------------------------------------------------
  @Get(':id/fulfillment')
  @RequirePermission('manage_purchase_orders', 'purchase_orders.view')
  @ApiOperation({
    summary: 'Get requirement-wise fulfillment breakdown and progress for a PO',
  })
  @ApiParam({ name: 'id', description: 'Purchase Order UUID or PO Number' })
  async getFulfillment(@Param('id') id: string) {
    const data = await this.purchaseOrdersService.getFulfillment(id);
    return {
      success: true,
      message: 'PO Fulfillment metrics retrieved successfully',
      data,
    };
  }
}
