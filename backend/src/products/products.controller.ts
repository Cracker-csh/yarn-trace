import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { RegisterOutputBatchDto } from './dto/create-product.dto';
import {
  UpdateOutputBatchDto,
  CancelOutputBatchDto,
  ProductFilterDto,
} from './dto/update-product.dto';
import { Request, Response } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    email?: string;
    role?: { code?: string } | string;
    permissions?: string[];
  };
}

@ApiTags('Finished Products & Output Batches')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ---------------------------------------------------------------------------
  // 1. LIST OUTPUT BATCHES WITH COMPREHENSIVE FILTERS & SUMMARY METRICS
  // ---------------------------------------------------------------------------
  @Get()
  @RequirePermission('products.view', 'view_inventory', 'manage_production')
  @ApiOperation({
    summary: 'Get finished product output batches with genealogy and summary KPIs',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Output batches and summary KPIs retrieved successfully',
  })
  async findAll(@Query() query: ProductFilterDto) {
    const data = await this.productsService.findAll(query);
    return {
      message: 'Finished product batches retrieved successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. GET ELIGIBLE PRODUCTION ORDERS FOR BATCH REGISTRATION MODAL
  // ---------------------------------------------------------------------------
  @Get('eligible-orders')
  @RequirePermission(
    'products.create',
    'products.view',
    'manage_production',
    'view_inventory',
  )
  @ApiOperation({
    summary: 'Get active production orders available for output batch registration',
  })
  async getEligibleOrders() {
    const data = await this.productsService.getEligibleOrders();
    return {
      message: 'Eligible production orders retrieved successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. EXPORT OUTPUT BATCHES / PRODUCTS DATA (CSV)
  // ---------------------------------------------------------------------------
  @Get('export')
  @RequirePermission('products.export', 'view_inventory', 'manage_production')
  @ApiOperation({ summary: 'Export finished product batches to CSV' })
  async exportData(
    @Query() query: ProductFilterDto,
    @Res() res: Response,
  ) {
    const { csv, filename } = await this.productsService.exportData(query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(HttpStatus.OK).send(csv);
  }

  // ---------------------------------------------------------------------------
  // 4. GET SINGLE OUTPUT BATCH / PRODUCT BY ID OR BATCH NUMBER
  // ---------------------------------------------------------------------------
  @Get(':id')
  @RequirePermission('products.view', 'view_inventory', 'manage_production')
  @ApiOperation({
    summary: 'Get single finished product / output batch details with deep genealogy',
  })
  @ApiParam({
    name: 'id',
    description: 'Production Output UUID or Batch Number (e.g. OUT-2026-0001)',
  })
  async findById(@Param('id') id: string) {
    const data = await this.productsService.findById(id);
    return {
      message: 'Product batch retrieved successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. GET YARN CONSUMPTION & LOT LINEAGE FOR SPECIFIC BATCH
  // ---------------------------------------------------------------------------
  @Get(':id/yarn-consumption')
  @RequirePermission('products.view', 'view_traceability', 'view_inventory')
  @ApiOperation({
    summary: 'Get full yarn consumption genealogy and source lots for an output batch',
  })
  @ApiParam({ name: 'id', description: 'Production Output UUID or Batch Number' })
  async getYarnConsumption(@Param('id') id: string) {
    const data = await this.productsService.getYarnConsumption(id);
    return {
      message: 'Yarn consumption lineage retrieved successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 6. REGISTER NEW OUTPUT BATCH (FROM PRODUCTION ORDER)
  // ---------------------------------------------------------------------------
  @Post('output-batch')
  @RequirePermission('products.create', 'manage_production', 'inventory.receive')
  @ApiOperation({
    summary: 'Register a manufactured output batch downstream of a production order',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Output batch registered and product inventory updated',
  })
  async registerOutputBatch(
    @Body() dto: RegisterOutputBatchDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    const data = await this.productsService.registerOutputBatch(dto, userId);
    return {
      message: `Finished output batch "${data.batchNumber}" registered successfully`,
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 7. UPDATE OUTPUT BATCH SPECIFICATIONS / STATUS
  // ---------------------------------------------------------------------------
  @Patch(':id')
  @RequirePermission('products.edit', 'manage_production', 'inventory.receive')
  @ApiOperation({ summary: 'Update finished product batch metadata or quantity' })
  @ApiParam({ name: 'id', description: 'Production Output UUID' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOutputBatchDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    const data = await this.productsService.update(id, dto, userId);
    return {
      message: `Finished product batch "${data.batchNumber}" updated successfully`,
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // 8. SOFT CANCEL OUTPUT BATCH (PRESERVES AUDIT & RELEASES PRODUCT STOCK)
  // ---------------------------------------------------------------------------
  @Post(':id/cancel')
  @RequirePermission(
    'products.cancel',
    'products.edit',
    'manage_production',
    'production.cancel',
    'production.view',
    'inventory.receive',
    'inventory.retire',
    'inventory.correct',
    'edit_records',
    'delete_records',
  )
  @ApiOperation({
    summary: 'Soft-cancel / quarantine an output batch with audit reason',
  })
  @ApiParam({ name: 'id', description: 'Production Output UUID' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelOutputBatchDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    const data = await this.productsService.cancel(id, dto, userId);
    return {
      message: `Output batch "${data.batchNumber}" has been cancelled`,
      data,
    };
  }
}
