import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { AddOpeningStockDto } from './dto/add-opening-stock.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { IssueStockDto } from './dto/issue-stock.dto';
import { ReturnStockDto } from './dto/return-stock.dto';
import { RetireStockDto } from './dto/retire-stock.dto';
import { SellStockDto } from './dto/sell-stock.dto';
import { CorrectionDto } from './dto/correction.dto';
import { InventoryFilterDto } from './dto/inventory-filter.dto';
import { Request, Response } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    email?: string;
    role?: { code?: string };
    permissions?: string[];
  };
}

@ApiTags('Inventory & Stock Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('summary')
  @RequirePermission('inventory.view', 'view_inventory')
  @ApiOperation({ summary: 'Get aggregated real-time stock balances, total KG, bags, active lots count' })
  async getStockSummary() {
    const data = await this.inventoryService.getStockSummary();
    return {
      message: 'Stock summary retrieved successfully',
      data,
    };
  }

  @Get('lots')
  @RequirePermission('inventory.view', 'view_inventory')
  @ApiOperation({ summary: 'Get derived lot-wise stock ledger (Total In, Issued, Returned, Retired, Sold, Current Balance)' })
  async getLots(@Query() filter: InventoryFilterDto) {
    const data = await this.inventoryService.getLots(filter);
    return {
      message: 'Lot-wise stock balances retrieved successfully',
      data,
    };
  }

  @Get('transactions')
  @RequirePermission('inventory.view', 'view_inventory')
  @ApiOperation({ summary: 'Get paginated and filtered transaction ledger' })
  async getTransactions(@Query() filter: InventoryFilterDto) {
    const data = await this.inventoryService.getTransactions(filter);
    return {
      message: 'Inventory transactions retrieved successfully',
      data,
    };
  }

  @Get('po-requirements')
  @RequirePermission('inventory.view', 'view_inventory')
  @ApiOperation({ summary: 'Get active PO yarn requirements with 103% ceiling for autocomplete and issue validation' })
  @ApiQuery({ name: 'poNumber', required: false, type: String })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  async getPoRequirements(
    @Query('poNumber') poNumber?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const data = await this.inventoryService.getPoRequirements(
      poNumber,
      includeArchived === 'true',
    );
    return {
      message: 'PO yarn requirements retrieved successfully',
      data,
    };
  }

  @Post('opening')
  @RequirePermission('inventory.add_opening', 'update_stock', 'add_yarn')
  @ApiOperation({ summary: 'Record Opening Stock transaction (creates baseline stock ledger entry)' })
  async addOpeningStock(@Body() dto: AddOpeningStockDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    const data = await this.inventoryService.addOpeningStock(dto, userId);
    return {
      message: 'Opening stock recorded successfully',
      data,
    };
  }

  @Post('received')
  @RequirePermission('inventory.receive', 'update_stock', 'add_yarn')
  @ApiOperation({ summary: 'Record Received / Inward yarn stock from supplier' })
  async receiveStock(@Body() dto: ReceiveStockDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    const data = await this.inventoryService.receiveStock(dto, userId);
    return {
      message: 'Inward yarn stock received successfully',
      data,
    };
  }

  @Post('issued')
  @RequirePermission('inventory.issue', 'issue_yarn')
  @ApiOperation({ summary: 'Issue yarn to production floor (enforces 103% PO rule & negative stock prevention)' })
  async issueStock(@Body() dto: IssueStockDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    const data = await this.inventoryService.issueStock(dto, userId);
    return {
      message: 'Yarn issued to production successfully',
      data,
    };
  }

  @Post('return')
  @RequirePermission('inventory.return', 'update_stock')
  @ApiOperation({ summary: 'Return issued yarn back into Main Stock from production' })
  async returnStock(@Body() dto: ReturnStockDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    const data = await this.inventoryService.returnStock(dto, userId);
    return {
      message: 'Yarn returned to stock successfully',
      data,
    };
  }

  @Post('retired')
  @RequirePermission('inventory.retire', 'update_stock')
  @ApiOperation({ summary: 'Retire / write-off damaged or contaminated yarn (requires mandatory reason)' })
  async retireStock(@Body() dto: RetireStockDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    const data = await this.inventoryService.retireStock(dto, userId);
    return {
      message: 'Stock retired successfully',
      data,
    };
  }

  @Post('sold')
  @RequirePermission('inventory.sell', 'update_stock')
  @ApiOperation({ summary: 'Record external commercial sale of yarn' })
  async sellStock(@Body() dto: SellStockDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    const data = await this.inventoryService.sellStock(dto, userId);
    return {
      message: 'Yarn sale recorded successfully',
      data,
    };
  }

  @Post('correction')
  @RequirePermission('inventory.correct', 'edit_records')
  @ApiOperation({ summary: 'Reverse / correct a transaction (creates offsetting correction entry with full audit history)' })
  async correctTransaction(@Body() dto: CorrectionDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    const data = await this.inventoryService.correctTransaction(dto, userId);
    return {
      message: 'Transaction corrected successfully',
      data,
    };
  }

  @Get('export')
  @RequirePermission('inventory.export', 'view_reports', 'inventory.view', 'view_inventory')
  @ApiOperation({ summary: 'Export inventory ledger and lot stock to Excel (.xlsx) or CSV' })
  @ApiQuery({ name: 'format', required: false, enum: ['xlsx', 'csv'] })
  async exportInventory(
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
    @Query() filter: InventoryFilterDto,
    @Res() res: Response,
  ) {
    const exportResult = await this.inventoryService.exportInventory(format, filter);
    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportResult.filename}"`,
    );
    res.send(exportResult.buffer);
  }
}
