import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  RegisterOutputBatchDto,
  CreateProductCatalogDto,
} from './dto/create-product.dto';
import {
  UpdateOutputBatchDto,
  CancelOutputBatchDto,
  ProductFilterDto,
} from './dto/update-product.dto';
import { AppCacheService } from '../common/cache/app-cache.service';

export interface ConsumedYarnLotInfo {
  lotId: string;
  lotNumber: string;
  yarnCount: string;
  supplierName: string;
  consumedKg: number;
  wasteKg: number;
  wasteCategory: string | null;
  consumptionDate: Date;
  teamName: string;
}

export interface OutputBatchComputed {
  id: string;
  batchNumber: string;
  productId: string | null;
  productCode: string;
  productName: string;
  productType: string;
  outputQuantityKg: number;
  unit: string;
  status: string;
  outputDate: Date;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
  recordedByName: string | null;
  productionOrderId: string;
  productionOrder: {
    id: string;
    orderNumber: string;
    status: string;
    targetQuantity: number;
    unit: string;
    purpose: string | null;
    priority: string;
    startDate: Date | null;
    targetDate: Date | null;
    completedDate: Date | null;
  };
  productionTeam: {
    id: string;
    name: string;
    department: string;
    teamLead: string | null;
  } | null;
  party: {
    id: string;
    name: string;
    code: string;
    type: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    gstNumber?: string | null;
  } | null;
  consumedYarnKg: number;
  totalWasteKg: number;
  yarnLots: ConsumedYarnLotInfo[];
  yieldPercentage: number;
  yieldVarianceKg: number;
  deliveriesCount: number;
  dispatchedKg: number;
  availableKg: number;
}

export interface ProductsSummaryMetrics {
  totalBatches: number;
  totalOutputKg: number;
  readyBatchesCount: number;
  deliveredBatchesCount: number;
  cancelledBatchesCount: number;
  totalConsumedYarnKg: number;
  averageYieldPct: number;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: AppCacheService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. HELPER: GENERATE UNIQUE OUTPUT BATCH NUMBER (OUT-YYYY-0001)
  // ---------------------------------------------------------------------------
  private async generateBatchNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `OUT-${year}-`;
    const lastOutput = await this.prisma.productionOutput.findFirst({
      where: { batchNumber: { startsWith: prefix } },
      orderBy: { batchNumber: 'desc' },
      select: { batchNumber: true },
    });

    let nextSeq = 1;
    if (lastOutput?.batchNumber) {
      const parts = lastOutput.batchNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // 2. HELPER: GENERATE UNIQUE PRODUCT CODE (PROD-YYYY-0001)
  // ---------------------------------------------------------------------------
  private async generateProductCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PROD-${year}-`;
    const lastProduct = await this.prisma.product.findFirst({
      where: { productCode: { startsWith: prefix } },
      orderBy: { productCode: 'desc' },
      select: { productCode: true },
    });

    let nextSeq = 1;
    if (lastProduct?.productCode) {
      const parts = lastProduct.productCode.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // 3. FIND ALL OUTPUT BATCHES & PRODUCTS WITH FILTERS & COMPUTED GENEALOGY
  // ---------------------------------------------------------------------------
  async findAll(filter: ProductFilterDto = {}): Promise<{
    outputBatches: OutputBatchComputed[];
    summary: ProductsSummaryMetrics;
  }> {
    const cacheKey = `products:all:${JSON.stringify(filter)}`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const where: Prisma.ProductionOutputWhereInput = {};

    // Search filter across Batch Number, Product Name, Product Code, Work Order, and Party
    if (filter.search && filter.search.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { batchNumber: { contains: q, mode: 'insensitive' } },
        { productName: { contains: q, mode: 'insensitive' } },
        { productCode: { contains: q, mode: 'insensitive' } },
        { remarks: { contains: q, mode: 'insensitive' } },
        {
          productionOrder: {
            OR: [
              { orderNumber: { contains: q, mode: 'insensitive' } },
              { productName: { contains: q, mode: 'insensitive' } },
              { party: { name: { contains: q, mode: 'insensitive' } } },
              { party: { code: { contains: q, mode: 'insensitive' } } },
            ],
          },
        },
      ];
    }

    if (filter.productType && filter.productType !== 'ALL') {
      where.OR = [
        { productType: filter.productType },
        { product: { category: filter.productType } },
      ];
    }

    if (filter.status && filter.status !== 'ALL') {
      where.status = filter.status.toUpperCase();
    }

    if (filter.partyId && filter.partyId !== 'ALL') {
      where.productionOrder = {
        ...(where.productionOrder as any),
        partyId: filter.partyId,
      };
    }

    if (filter.productionTeamId && filter.productionTeamId !== 'ALL') {
      where.productionOrder = {
        ...(where.productionOrder as any),
        productionTeamId: filter.productionTeamId,
      };
    }

    if (filter.productionOrderId && filter.productionOrderId !== 'ALL') {
      where.productionOrderId = filter.productionOrderId;
    }

    if (filter.startDate || filter.endDate) {
      where.outputDate = {};
      if (filter.startDate) {
        where.outputDate.gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        where.outputDate.lte = new Date(`${filter.endDate}T23:59:59.999Z`);
      }
    }

    const outputs = await this.prisma.productionOutput.findMany({
      where,
      include: {
        product: true,
        recordedBy: { select: { firstName: true, lastName: true, email: true } },
        deliveries: {
          include: { party: true },
        },
        productionOrder: {
          include: {
            party: true,
            productionTeam: true,
            consumptionRecords: {
              where: { isCorrected: false },
              include: {
                productionTeam: true,
                lot: {
                  include: {
                    yarn: true,
                    supplier: true,
                  },
                },
              },
              orderBy: { consumptionDate: 'asc' },
            },
          },
        },
      },
      orderBy: { outputDate: 'desc' },
    });

    // Map outputs to computed genealogy objects
    const computedBatches: OutputBatchComputed[] = outputs.map((out) => {
      const order = out.productionOrder;
      const product = out.product;
      const outKg = Number(out.outputQuantityKg);

      // Aggregated yarn consumption for the work order
      const consumptions = order.consumptionRecords || [];
      const totalConsumedKg = consumptions.reduce(
        (sum, c) => sum + Number(c.consumedKg),
        0,
      );
      const totalWasteKg = consumptions.reduce(
        (sum, c) => sum + Number(c.wasteKg || 0),
        0,
      );

      // List of consumed yarn lots
      const yarnLots: ConsumedYarnLotInfo[] = consumptions.map((c) => ({
        lotId: c.lotId,
        lotNumber: c.lot?.lotNumber || 'N/A',
        yarnCount: c.yarnCount || c.lot?.yarnCount || c.lot?.yarn?.yarnCount || 'N/A',
        supplierName: c.lot?.supplier?.name || 'Unknown Supplier',
        consumedKg: Number(c.consumedKg),
        wasteKg: Number(c.wasteKg || 0),
        wasteCategory: c.wasteCategory,
        consumptionDate: c.consumptionDate,
        teamName: c.productionTeam?.name || order.productionTeam?.name || 'Floor Team',
      }));

      // Deliveries calculations
      const dispatchedKg = (out.deliveries || []).reduce(
        (sum, d) => sum + Number(d.dispatchedKg),
        0,
      );
      const availableKg = Math.max(0, outKg - dispatchedKg);

      // Yield calculation: (Output KG / Consumed KG) * 100
      const yieldPercentage =
        totalConsumedKg > 0
          ? Number(((outKg / totalConsumedKg) * 100).toFixed(2))
          : 0;
      const yieldVarianceKg = Number((outKg - totalConsumedKg).toFixed(4));

      // Resolve effective batch number & product code
      const batchNumber =
        out.batchNumber ||
        `OUT-${new Date(out.outputDate).getFullYear()}-${out.id.substring(0, 4).toUpperCase()}`;
      const productCode =
        out.productCode ||
        product?.productCode ||
        `PROD-${out.id.substring(0, 4).toUpperCase()}`;
      const productType =
        out.productType ||
        product?.category ||
        order.productType ||
        'FABRIC_ROLL';

      return {
        id: out.id,
        batchNumber,
        productId: out.productId,
        productCode,
        productName: out.productName || product?.name || order.productName || 'Finished Product',
        productType,
        outputQuantityKg: Number(outKg.toFixed(4)),
        unit: out.unit || 'KG',
        status: out.status || 'PRODUCED',
        outputDate: out.outputDate,
        remarks: out.remarks,
        createdAt: out.createdAt,
        updatedAt: out.updatedAt,
        recordedByName: out.recordedBy
          ? `${out.recordedBy.firstName} ${out.recordedBy.lastName}`
          : null,
        productionOrderId: out.productionOrderId,
        productionOrder: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          targetQuantity: Number(order.targetQuantity),
          unit: order.unit,
          purpose: order.purpose,
          priority: order.priority,
          startDate: order.startDate,
          targetDate: order.targetDate,
          completedDate: order.completedDate,
        },
        productionTeam: order.productionTeam
          ? {
              id: order.productionTeam.id,
              name: order.productionTeam.name,
              department: order.productionTeam.department,
              teamLead: order.productionTeam.teamLead,
            }
          : null,
        party: order.party
          ? {
              id: order.party.id,
              name: order.party.name,
              code: order.party.code,
              type: order.party.type,
              contactPerson: order.party.contactPerson,
              phone: order.party.phone,
              email: order.party.email,
              gstNumber: order.party.gstNumber,
            }
          : null,
        consumedYarnKg: Number(totalConsumedKg.toFixed(4)),
        totalWasteKg: Number(totalWasteKg.toFixed(4)),
        yarnLots,
        yieldPercentage,
        yieldVarianceKg,
        deliveriesCount: out.deliveries?.length || 0,
        dispatchedKg: Number(dispatchedKg.toFixed(4)),
        availableKg: Number(availableKg.toFixed(4)),
      };
    });

    // Summary Metrics across active batches
    const activeBatches = computedBatches.filter((b) => b.status !== 'CANCELLED');
    const totalOutputKg = activeBatches.reduce(
      (sum, b) => sum + b.outputQuantityKg,
      0,
    );
    const totalConsumedYarnKg = activeBatches.reduce(
      (sum, b) => sum + b.consumedYarnKg,
      0,
    );
    const averageYieldPct =
      totalConsumedYarnKg > 0
        ? Number(((totalOutputKg / totalConsumedYarnKg) * 100).toFixed(2))
        : 0;

    const summary: ProductsSummaryMetrics = {
      totalBatches: computedBatches.length,
      totalOutputKg: Number(totalOutputKg.toFixed(4)),
      readyBatchesCount: computedBatches.filter((b) => b.status === 'READY' || b.status === 'PRODUCED').length,
      deliveredBatchesCount: computedBatches.filter((b) => b.status === 'DELIVERED').length,
      cancelledBatchesCount: computedBatches.filter((b) => b.status === 'CANCELLED').length,
      totalConsumedYarnKg: Number(totalConsumedYarnKg.toFixed(4)),
      averageYieldPct,
    };

        return {
          outputBatches: computedBatches,
          summary,
        };
      },
      30,
    );
  }

  // ---------------------------------------------------------------------------
  // 4. FIND SINGLE OUTPUT BATCH OR PRODUCT BY ID / BATCH NUMBER
  // ---------------------------------------------------------------------------
  async findById(idOrBatchNumber: string): Promise<OutputBatchComputed> {
    const trimmed = idOrBatchNumber.trim();
    const cacheKey = `products:detail:${trimmed.toLowerCase()}`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const out = await this.prisma.productionOutput.findFirst({
      where: {
        OR: [
          { id: trimmed },
          { batchNumber: { equals: trimmed, mode: 'insensitive' } },
          { productCode: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
      include: {
        product: true,
        recordedBy: { select: { firstName: true, lastName: true, email: true } },
        deliveries: {
          include: { party: true },
          orderBy: { dispatchDate: 'desc' },
        },
        productionOrder: {
          include: {
            party: true,
            productionTeam: true,
            consumptionRecords: {
              where: { isCorrected: false },
              include: {
                productionTeam: true,
                recordedBy: { select: { firstName: true, lastName: true } },
                lot: {
                  include: {
                    yarn: true,
                    supplier: true,
                  },
                },
              },
              orderBy: { consumptionDate: 'asc' },
            },
          },
        },
      },
    });

    if (!out) {
      throw new NotFoundException(
        `Finished Product / Output Batch "${idOrBatchNumber}" not found`,
      );
    }

    const order = out.productionOrder;
    const product = out.product;
    const outKg = Number(out.outputQuantityKg);

    const consumptions = order.consumptionRecords || [];
    const totalConsumedKg = consumptions.reduce(
      (sum, c) => sum + Number(c.consumedKg),
      0,
    );
    const totalWasteKg = consumptions.reduce(
      (sum, c) => sum + Number(c.wasteKg || 0),
      0,
    );

    const yarnLots: ConsumedYarnLotInfo[] = consumptions.map((c) => ({
      lotId: c.lotId,
      lotNumber: c.lot?.lotNumber || 'N/A',
      yarnCount: c.yarnCount || c.lot?.yarnCount || c.lot?.yarn?.yarnCount || 'N/A',
      supplierName: c.lot?.supplier?.name || 'Unknown Supplier',
      consumedKg: Number(c.consumedKg),
      wasteKg: Number(c.wasteKg || 0),
      wasteCategory: c.wasteCategory,
      consumptionDate: c.consumptionDate,
      teamName: c.productionTeam?.name || order.productionTeam?.name || 'Floor Team',
    }));

    const dispatchedKg = (out.deliveries || []).reduce(
      (sum, d) => sum + Number(d.dispatchedKg),
      0,
    );
    const availableKg = Math.max(0, outKg - dispatchedKg);

    const yieldPercentage =
      totalConsumedKg > 0
        ? Number(((outKg / totalConsumedKg) * 100).toFixed(2))
        : 0;
    const yieldVarianceKg = Number((outKg - totalConsumedKg).toFixed(4));

    const batchNumber =
      out.batchNumber ||
      `OUT-${new Date(out.outputDate).getFullYear()}-${out.id.substring(0, 4).toUpperCase()}`;
    const productCode =
      out.productCode ||
      product?.productCode ||
      `PROD-${out.id.substring(0, 4).toUpperCase()}`;
    const productType =
      out.productType || product?.category || order.productType || 'FABRIC_ROLL';

    return {
      id: out.id,
      batchNumber,
      productId: out.productId,
      productCode,
      productName: out.productName || product?.name || order.productName || 'Finished Product',
      productType,
      outputQuantityKg: Number(outKg.toFixed(4)),
      unit: out.unit || 'KG',
      status: out.status || 'PRODUCED',
      outputDate: out.outputDate,
      remarks: out.remarks,
      createdAt: out.createdAt,
      updatedAt: out.updatedAt,
      recordedByName: out.recordedBy
        ? `${out.recordedBy.firstName} ${out.recordedBy.lastName}`
        : null,
      productionOrderId: out.productionOrderId,
      productionOrder: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        targetQuantity: Number(order.targetQuantity),
        unit: order.unit,
        purpose: order.purpose,
        priority: order.priority,
        startDate: order.startDate,
        targetDate: order.targetDate,
        completedDate: order.completedDate,
      },
      productionTeam: order.productionTeam
        ? {
            id: order.productionTeam.id,
            name: order.productionTeam.name,
            department: order.productionTeam.department,
            teamLead: order.productionTeam.teamLead,
          }
        : null,
      party: order.party
        ? {
            id: order.party.id,
            name: order.party.name,
            code: order.party.code,
            type: order.party.type,
            contactPerson: order.party.contactPerson,
            phone: order.party.phone,
            email: order.party.email,
            gstNumber: order.party.gstNumber,
          }
        : null,
      consumedYarnKg: Number(totalConsumedKg.toFixed(4)),
      totalWasteKg: Number(totalWasteKg.toFixed(4)),
      yarnLots,
      yieldPercentage,
      yieldVarianceKg,
      deliveriesCount: out.deliveries?.length || 0,
      dispatchedKg: Number(dispatchedKg.toFixed(4)),
      availableKg: Number(availableKg.toFixed(4)),
    };
  },
  30,
);
  }

  // ---------------------------------------------------------------------------
  // 5. GET ELIGIBLE PRODUCTION ORDERS (FOR MODAL DROPDOWN CONTEXT)
  // ---------------------------------------------------------------------------
  async getEligibleOrders() {
    const cacheKey = 'products:eligible-orders';
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const orders = await this.prisma.productionOrder.findMany({
          where: {
            status: { not: 'CANCELLED' as any },
          },
          include: {
            party: true,
            productionTeam: true,
            outputs: true,
            consumptionRecords: { where: { isCorrected: false } },
          },
          orderBy: { createdAt: 'desc' },
        });

        return orders.map((o) => {
          const targetKg = Number(o.targetQuantity);
          const existingOutputKg = o.outputs.reduce(
            (sum, out) => sum + Number(out.outputQuantityKg),
            0,
          );
          const consumedKg = o.consumptionRecords.reduce(
            (sum, c) => sum + Number(c.consumedKg),
            0,
          );
          const remainingPlannedKg = Math.max(0, targetKg - existingOutputKg);

          return {
            id: o.id,
            orderNumber: o.orderNumber,
            productName: o.productName || 'Finished Goods',
            productType: o.productType || 'FABRIC_ROLL',
            status: o.status,
            targetQuantity: targetKg,
            unit: o.unit || 'KG',
            partyName: o.party?.name || 'Internal / Stock',
            partyId: o.partyId,
            teamName: o.productionTeam?.name || 'Production Floor',
            teamDepartment: o.productionTeam?.department || 'MANUFACTURING',
            existingOutputKg: Number(existingOutputKg.toFixed(4)),
            consumedKg: Number(consumedKg.toFixed(4)),
            remainingPlannedKg: Number(remainingPlannedKg.toFixed(4)),
          };
        });
      },
      30,
    );
  }

  // ---------------------------------------------------------------------------
  // 6. REGISTER OUTPUT BATCH (CREATES PRODUCTION OUTPUT & UPDATES PRODUCT)
  // ---------------------------------------------------------------------------
  async registerOutputBatch(
    dto: RegisterOutputBatchDto,
    userId?: string,
  ): Promise<OutputBatchComputed> {
    // 1. Verify Production Order exists
    const order = await this.prisma.productionOrder.findUnique({
      where: { id: dto.productionOrderId },
      include: {
        party: true,
        productionTeam: true,
        consumptionRecords: { where: { isCorrected: false } },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `Production Order with ID "${dto.productionOrderId}" not found`,
      );
    }

    if (order.status === ('CANCELLED' as any)) {
      throw new BadRequestException(
        `Cannot register output for CANCELLED Production Order "${order.orderNumber}"`,
      );
    }

    // 2. Generate unique Batch Number and Product Code if not provided
    const batchNumber = dto.batchNumber?.trim()
      ? dto.batchNumber.trim().toUpperCase()
      : await this.generateBatchNumber();

    // Check duplicate batchNumber
    const existingBatch = await this.prisma.productionOutput.findFirst({
      where: { batchNumber },
    });
    if (existingBatch) {
      throw new ConflictException(
        `Output Batch Number "${batchNumber}" already exists. Please provide a unique batch number.`,
      );
    }

    const cleanProductName = dto.productName.trim();
    const productType =
      dto.productType?.trim().toUpperCase() ||
      order.productType ||
      'FABRIC_ROLL';
    const productCode = dto.productCode?.trim()
      ? dto.productCode.trim().toUpperCase()
      : order.productName === cleanProductName && order.poNumber
      ? `PROD-${order.orderNumber}`
      : await this.generateProductCode();

    const outputKg = new Prisma.Decimal(dto.outputQuantityKg);
    const outputDate = dto.outputDate ? new Date(dto.outputDate) : new Date();
    const unit = dto.unit?.trim().toUpperCase() || 'KG';
    const status = dto.status?.trim().toUpperCase() || 'READY';

    // 3. Resolve or Create Product Master entry
    let productId = dto.productId || null;
    if (!productId) {
      const existingProduct = await this.prisma.product.findFirst({
        where: {
          OR: [{ productCode }, { name: cleanProductName }],
        },
      });

      if (existingProduct) {
        productId = existingProduct.id;
        // Increment Product total and available KG
        await this.prisma.product.update({
          where: { id: existingProduct.id },
          data: {
            totalQuantityKg: { increment: outputKg },
            availableKg: { increment: outputKg },
          },
        });
      } else {
        const newProduct = await this.prisma.product.create({
          data: {
            productCode,
            name: cleanProductName,
            category: productType,
            productionOrderId: order.id,
            totalQuantityKg: outputKg,
            availableKg: outputKg,
            unit,
            status,
            isActive: true,
          },
        });
        productId = newProduct.id;
      }
    }

    // 4. Create ProductionOutput record
    const output = await this.prisma.productionOutput.create({
      data: {
        batchNumber,
        productionOrderId: order.id,
        productId,
        productName: cleanProductName,
        productCode,
        productType,
        outputQuantityKg: outputKg,
        unit,
        status,
        outputDate,
        remarks: dto.remarks?.trim() || null,
        recordedById: userId || null,
      },
    });

    // 5. Audit Log
    const totalConsumed = order.consumptionRecords.reduce(
      (sum, c) => sum + Number(c.consumedKg),
      0,
    );
    const yieldPct =
      totalConsumed > 0
        ? Number(((dto.outputQuantityKg / totalConsumed) * 100).toFixed(2))
        : 0;

    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'REGISTER_OUTPUT_BATCH',
        module: 'PRODUCTION',
        entityType: 'ProductionOutput',
        entityId: output.id,
        newValue: {
          batchNumber,
          productName: cleanProductName,
          productCode,
          workOrder: order.orderNumber,
          outputKg: dto.outputQuantityKg,
          unit,
          yieldPercentage: yieldPct,
        },
        metadata: {
          orderId: order.id,
          batchNumber,
          productId,
        },
      },
    });

    this.cacheService.delPattern('^products:');
    this.cacheService.delPattern('^production:');
    this.cacheService.delPattern('^dashboard:');

    return this.findById(output.id);
  }

  // ---------------------------------------------------------------------------
  // 7. UPDATE OUTPUT BATCH
  // ---------------------------------------------------------------------------
  async update(
    id: string,
    dto: UpdateOutputBatchDto,
    userId?: string,
  ): Promise<OutputBatchComputed> {
    const existing = await this.prisma.productionOutput.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!existing) {
      throw new NotFoundException(`Output Batch with ID "${id}" not found`);
    }

    if (existing.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot edit Output Batch "${existing.batchNumber}" because it is CANCELLED`,
      );
    }

    const updateData: Prisma.ProductionOutputUpdateInput = {};

    if (dto.productName) updateData.productName = dto.productName.trim();
    if (dto.productCode) updateData.productCode = dto.productCode.trim().toUpperCase();
    if (dto.productType) updateData.productType = dto.productType.trim().toUpperCase();
    if (dto.outputDate) updateData.outputDate = new Date(dto.outputDate);
    if (dto.unit) updateData.unit = dto.unit.trim().toUpperCase();
    if (dto.remarks !== undefined) updateData.remarks = dto.remarks?.trim() || null;
    if (dto.status) updateData.status = dto.status.trim().toUpperCase();

    if (dto.outputQuantityKg !== undefined) {
      const oldKg = Number(existing.outputQuantityKg);
      const newKg = dto.outputQuantityKg;
      const diffKg = new Prisma.Decimal(newKg - oldKg);

      updateData.outputQuantityKg = new Prisma.Decimal(newKg);

      // Adjust linked product stock if linked
      if (existing.productId) {
        await this.prisma.product.update({
          where: { id: existing.productId },
          data: {
            totalQuantityKg: { increment: diffKg },
            availableKg: { increment: diffKg },
          },
        });
      }
    }

    await this.prisma.productionOutput.update({
      where: { id },
      data: updateData,
    });

    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'UPDATE_OUTPUT_BATCH',
        module: 'PRODUCTION',
        entityType: 'ProductionOutput',
        entityId: id,
        oldValue: {
          productName: existing.productName,
          outputQuantityKg: Number(existing.outputQuantityKg),
          status: existing.status,
        },
        newValue: { ...dto },
        metadata: { batchNumber: existing.batchNumber },
      },
    });

    this.cacheService.delPattern('^products:');
    this.cacheService.delPattern('^production:');
    this.cacheService.delPattern('^dashboard:');

    return this.findById(id);
  }

  // ---------------------------------------------------------------------------
  // 8. CANCEL OUTPUT BATCH (SOFT CANCELLATION)
  // ---------------------------------------------------------------------------
  async cancel(
    id: string,
    dto: CancelOutputBatchDto = {},
    userId?: string,
  ): Promise<OutputBatchComputed> {
    const existing = await this.prisma.productionOutput.findUnique({
      where: { id },
      include: { deliveries: true },
    });

    if (!existing) {
      throw new NotFoundException(`Output Batch with ID "${id}" not found`);
    }

    if (existing.status === 'CANCELLED') {
      return this.findById(id);
    }

    if (existing.deliveries && existing.deliveries.length > 0) {
      throw new BadRequestException(
        `Cannot cancel Output Batch "${existing.batchNumber}" because ${existing.deliveries.length} delivery records are linked to it.`,
      );
    }

    const cancelReason = dto.reason?.trim() || 'Cancelled / quarantined by authorized user';
    const updatedRemarks = existing.remarks
      ? `${existing.remarks}\n[CANCELLED: ${cancelReason}]`
      : `[CANCELLED: ${cancelReason}]`;

    // Deduct available KG from Product Master if linked
    if (existing.productId) {
      await this.prisma.product.update({
        where: { id: existing.productId },
        data: {
          totalQuantityKg: { decrement: existing.outputQuantityKg },
          availableKg: { decrement: existing.outputQuantityKg },
        },
      });
    }

    await this.prisma.productionOutput.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        remarks: updatedRemarks,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'CANCEL_OUTPUT_BATCH',
        module: 'PRODUCTION',
        entityType: 'ProductionOutput',
        entityId: id,
        oldValue: { status: existing.status },
        newValue: { status: 'CANCELLED', reason: cancelReason },
        metadata: { batchNumber: existing.batchNumber },
      },
    });

    this.cacheService.delPattern('^products:');
    this.cacheService.delPattern('^production:');
    this.cacheService.delPattern('^dashboard:');

    return this.findById(id);
  }

  // ---------------------------------------------------------------------------
  // 9. GET YARN CONSUMPTION DETAILS FOR A GIVEN PRODUCT / BATCH
  // ---------------------------------------------------------------------------
  async getYarnConsumption(idOrBatchNumber: string) {
    const batch = await this.findById(idOrBatchNumber);
    return {
      batchNumber: batch.batchNumber,
      productName: batch.productName,
      productCode: batch.productCode,
      workOrderNumber: batch.productionOrder.orderNumber,
      outputQuantityKg: batch.outputQuantityKg,
      consumedYarnKg: batch.consumedYarnKg,
      totalWasteKg: batch.totalWasteKg,
      yieldPercentage: batch.yieldPercentage,
      yarnLots: batch.yarnLots,
    };
  }

  // ---------------------------------------------------------------------------
  // 10. EXPORT DATA (CSV FORMAT)
  // ---------------------------------------------------------------------------
  async exportData(filter: ProductFilterDto = {}) {
    const { outputBatches } = await this.findAll(filter);

    const headers = [
      'Batch Number',
      'Product Code',
      'Product Name',
      'Category / Type',
      'Work Order',
      'Customer / Buyer',
      'Production Team',
      'Production Date',
      'Output Quantity (KG)',
      'Consumed Yarn (KG)',
      'Yield (%)',
      'Status',
      'Remarks',
    ];

    const rows = outputBatches.map((b) => [
      `"${b.batchNumber}"`,
      `"${b.productCode}"`,
      `"${b.productName.replace(/"/g, '""')}"`,
      `"${b.productType}"`,
      `"${b.productionOrder.orderNumber}"`,
      `"${b.party?.name || 'Internal / Stock'}"`,
      `"${b.productionTeam?.name || '—'}"`,
      `"${new Date(b.outputDate).toISOString().split('T')[0]}"`,
      b.outputQuantityKg.toFixed(2),
      b.consumedYarnKg.toFixed(2),
      `${b.yieldPercentage.toFixed(1)}%`,
      `"${b.status}"`,
      `"${(b.remarks || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join(
      '\n',
    );

    return {
      csv: csvContent,
      filename: `YarnTrace-Finished-Products-${new Date().toISOString().split('T')[0]}.csv`,
    };
  }
}
