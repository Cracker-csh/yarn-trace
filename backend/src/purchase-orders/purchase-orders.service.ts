import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, POStatus, TransactionType } from '@prisma/client';
import {
  CreatePurchaseOrderDto,
  CreatePORequirementDto,
} from './dto/create-purchase-order.dto';
import {
  UpdatePurchaseOrderDto,
  CancelPurchaseOrderDto,
  PurchaseOrderFilterDto,
} from './dto/update-purchase-order.dto';
import { AppCacheService } from '../common/cache/app-cache.service';

export interface PORequirementComputed {
  id: string;
  purchaseOrderId: string | null;
  poNumber: string | null;
  yarnCount: string | null;
  quality: string | null;
  size: string | null;
  useFor: string | null;
  purpose: string | null;
  pcs: number | null;
  qty: number | null;
  requiredKg: number;
  issuedKg: number;
  remainingKg: number;
  fulfillmentPct: number;
  status: 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'N/A' | 'CANCELLED';
  isActive: boolean;
  isArchived: boolean;
  archivedAt: Date | null;
  archivedById: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  transactions?: Array<{
    id: string;
    transactionNumber: string;
    transactionDate: Date;
    type: string;
    kilos: number;
    bags: number;
    lotNumber?: string | null;
    createdByName?: string | null;
  }>;
}

export interface PurchaseOrderComputed {
  id: string;
  poNumber: string;
  partyId: string;
  party: {
    id: string;
    name: string;
    code: string;
    type: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    gstNumber?: string | null;
    address?: string | null;
  };
  status: POStatus | string;
  orderDate: Date;
  deliveryDue: Date | null;
  totalAmount: number | null;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalRequiredKg: number;
  totalIssuedKg: number;
  totalRemainingKg: number;
  overallFulfillmentPct: number;
  requirementsCount: number;
  requirements: PORequirementComputed[];
}

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: AppCacheService,
  ) {}

  public invalidatePOCaches() {
    this.cacheService.delPattern(/^po/);
    this.cacheService.delPattern(/^dashboard/);
    this.cacheService.delPattern(/^reports/);
    this.cacheService.delPattern(/^inventory/);
  }

  // ---------------------------------------------------------------------------
  // 1. HELPER: COMPUTE LINE STATUS
  // ---------------------------------------------------------------------------
  private computeRequirementStatus(
    requiredKg: number,
    issuedKg: number,
    isCancelled = false,
  ): 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'N/A' | 'CANCELLED' {
    if (isCancelled) return 'CANCELLED';
    if (requiredKg <= 0.0001) return 'N/A';
    if (issuedKg <= 0.0001) return 'PENDING';
    if (issuedKg >= requiredKg - 0.0001) return 'COMPLETED';
    return 'PARTIAL';
  }

  // ---------------------------------------------------------------------------
  // 2. FIND ALL PURCHASE ORDERS WITH FILTER & DERIVED METRICS
  // ---------------------------------------------------------------------------
  async findAll(filter: PurchaseOrderFilterDto = {}): Promise<{
    purchaseOrders: PurchaseOrderComputed[];
    summary: {
      totalPOs: number;
      activePOs: number;
      partiallyFulfilledPOs: number;
      fulfilledPOs: number;
      cancelledPOs: number;
      totalRequiredKg: number;
      totalIssuedKg: number;
      totalRemainingKg: number;
    };
  }> {
    const cacheKey = `po:all:${JSON.stringify(filter)}`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const where: Prisma.PurchaseOrderWhereInput = {};

        // Search filter
        if (filter.search && filter.search.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { poNumber: { contains: q, mode: 'insensitive' } },
        { party: { name: { contains: q, mode: 'insensitive' } } },
        { party: { code: { contains: q, mode: 'insensitive' } } },
        {
          requirements: {
            some: {
              OR: [
                { yarnCount: { contains: q, mode: 'insensitive' } },
                { purpose: { contains: q, mode: 'insensitive' } },
                { notes: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    if (filter.partyId) {
      where.partyId = filter.partyId;
    }

    if (filter.status) {
      where.status = filter.status.toUpperCase() as POStatus;
    }

    if (filter.startDate || filter.endDate) {
      where.orderDate = {};
      if (filter.startDate) {
        where.orderDate.gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        where.orderDate.lte = new Date(filter.endDate);
      }
    }

    const pos = await this.prisma.purchaseOrder.findMany({
      where,
      include: {
        party: true,
        requirements: {
          include: {
            transactions: {
              where: { type: TransactionType.ISSUED },
              select: {
                id: true,
                transactionNumber: true,
                transactionDate: true,
                type: true,
                kilos: true,
                bags: true,
                lot: { select: { lotNumber: true } },
                createdBy: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { orderDate: 'desc' },
    });

    // Compute derived metrics for all POs
    const computedPOs: PurchaseOrderComputed[] = pos.map((po) => {
      let poRequiredKg = 0;
      let poIssuedKg = 0;

      const isPoCancelled = po.status === POStatus.CANCELLED;

      const computedReqs: PORequirementComputed[] = po.requirements.map((req) => {
        const reqKg = Number(req.requiredKg);

        // Derive issued quantity from actual linked ISSUED transactions
        const actualIssuedFromTx = req.transactions.reduce(
          (acc, tx) => acc + Number(tx.kilos),
          0,
        );
        // Fallback to recorded issuedKg if direct transactions not linked
        const issuedKg = Math.max(actualIssuedFromTx, Number(req.issuedKg));
        const remainingKg = Math.max(0, reqKg - issuedKg);
        const fulfillmentPct =
          reqKg > 0 ? Number(((issuedKg / reqKg) * 100).toFixed(2)) : 0;
        const lineStatus = this.computeRequirementStatus(
          reqKg,
          issuedKg,
          isPoCancelled,
        );

        poRequiredKg += reqKg;
        poIssuedKg += issuedKg;

        return {
          id: req.id,
          purchaseOrderId: req.purchaseOrderId,
          poNumber: req.poNumber || po.poNumber,
          yarnCount: req.yarnCount,
          quality: (req as any).quality || null,
          size: (req as any).size || null,
          useFor: (req as any).useFor || null,
          purpose: req.purpose,
          pcs: (req as any).pcs || null,
          qty: (req as any).qty ? Number((req as any).qty) : null,
          requiredKg: Number(reqKg.toFixed(4)),
          issuedKg: Number(issuedKg.toFixed(4)),
          remainingKg: Number(remainingKg.toFixed(4)),
          fulfillmentPct,
          status: lineStatus,
          isActive: req.isActive ?? true,
          isArchived: req.isArchived ?? false,
          archivedAt: req.archivedAt ?? null,
          archivedById: req.archivedById ?? null,
          notes: req.notes,
          createdAt: req.createdAt,
          updatedAt: req.updatedAt,
          transactions: req.transactions.map((tx) => ({
            id: tx.id,
            transactionNumber: tx.transactionNumber,
            transactionDate: tx.transactionDate,
            type: tx.type,
            kilos: Number(tx.kilos),
            bags: tx.bags,
            lotNumber: tx.lot?.lotNumber || null,
            createdByName: tx.createdBy
              ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}`
              : null,
          })),
        };
      });

      const poRemainingKg = Math.max(0, poRequiredKg - poIssuedKg);
      const overallFulfillmentPct =
        poRequiredKg > 0
          ? Number(((poIssuedKg / poRequiredKg) * 100).toFixed(2))
          : 0;

      // Derived status representation
      let effectiveStatus: POStatus | string = po.status;
      if (po.status !== POStatus.CANCELLED && po.status !== POStatus.DRAFT) {
        if (poIssuedKg >= poRequiredKg && poRequiredKg > 0) {
          effectiveStatus = 'FULFILLED';
        } else if (poIssuedKg > 0) {
          effectiveStatus = 'PARTIALLY_FULFILLED';
        } else {
          effectiveStatus = 'ACTIVE';
        }
      }

      return {
        id: po.id,
        poNumber: po.poNumber,
        partyId: po.partyId,
        party: {
          id: po.party.id,
          name: po.party.name,
          code: po.party.code,
          type: po.party.type,
          contactPerson: po.party.contactPerson,
          phone: po.party.phone,
          email: po.party.email,
          gstNumber: po.party.gstNumber,
          address: po.party.address,
        },
        status: effectiveStatus,
        orderDate: po.orderDate,
        deliveryDue: po.deliveryDue,
        totalAmount: po.totalAmount ? Number(po.totalAmount) : null,
        remarks: po.remarks,
        createdAt: po.createdAt,
        updatedAt: po.updatedAt,
        totalRequiredKg: Number(poRequiredKg.toFixed(4)),
        totalIssuedKg: Number(poIssuedKg.toFixed(4)),
        totalRemainingKg: Number(poRemainingKg.toFixed(4)),
        overallFulfillmentPct,
        requirementsCount: computedReqs.length,
        requirements: computedReqs,
      };
    });

    // Optional fulfillmentStatus filter in memory
    let filteredPOs = computedPOs;
    if (filter.fulfillmentStatus) {
      const fs = filter.fulfillmentStatus.toUpperCase();
      if (fs === 'COMPLETED' || fs === 'FULFILLED') {
        filteredPOs = computedPOs.filter(
          (p) => p.totalIssuedKg >= p.totalRequiredKg && p.totalRequiredKg > 0,
        );
      } else if (fs === 'PARTIAL' || fs === 'PARTIALLY_FULFILLED') {
        filteredPOs = computedPOs.filter(
          (p) =>
            p.totalIssuedKg > 0 && p.totalIssuedKg < p.totalRequiredKg,
        );
      } else if (fs === 'PENDING') {
        filteredPOs = computedPOs.filter(
          (p) => p.totalIssuedKg <= 0.0001 && p.status !== POStatus.CANCELLED,
        );
      }
    }

    // High level summary metrics
    const summary = {
      totalPOs: computedPOs.length,
      activePOs: computedPOs.filter((p) => p.status === 'ACTIVE' || p.status === POStatus.CONFIRMED).length,
      partiallyFulfilledPOs: computedPOs.filter((p) => p.status === 'PARTIALLY_FULFILLED' || p.status === POStatus.PARTIALLY_DELIVERED).length,
      fulfilledPOs: computedPOs.filter((p) => p.status === 'FULFILLED').length,
      cancelledPOs: computedPOs.filter((p) => p.status === POStatus.CANCELLED).length,
      totalRequiredKg: Number(
        computedPOs.reduce((acc, p) => acc + p.totalRequiredKg, 0).toFixed(4),
      ),
      totalIssuedKg: Number(
        computedPOs.reduce((acc, p) => acc + p.totalIssuedKg, 0).toFixed(4),
      ),
      totalRemainingKg: Number(
        computedPOs.reduce((acc, p) => acc + p.totalRemainingKg, 0).toFixed(4),
      ),
    };

        return {
          purchaseOrders: filteredPOs,
          summary,
        };
      },
      30,
    );
  }

  // ---------------------------------------------------------------------------
  // 3. FIND PURCHASE ORDER BY ID OR PO NUMBER
  // ---------------------------------------------------------------------------
  async findById(idOrPoNumber: string): Promise<PurchaseOrderComputed> {
    const cacheKey = `po:detail:${idOrPoNumber.trim().toLowerCase()}`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const po = await this.prisma.purchaseOrder.findFirst({
          where: {
            OR: [
              { id: idOrPoNumber },
              { poNumber: { equals: idOrPoNumber.trim(), mode: 'insensitive' } },
            ],
          },
      include: {
        party: true,
        requirements: {
          include: {
            transactions: {
              where: { type: TransactionType.ISSUED },
              select: {
                id: true,
                transactionNumber: true,
                transactionDate: true,
                type: true,
                kilos: true,
                bags: true,
                lot: { select: { lotNumber: true } },
                createdBy: { select: { firstName: true, lastName: true } },
              },
              orderBy: { transactionDate: 'desc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order "${idOrPoNumber}" not found`);
    }

    let poRequiredKg = 0;
    let poIssuedKg = 0;
    const isPoCancelled = po.status === POStatus.CANCELLED;

    const computedReqs: PORequirementComputed[] = po.requirements.map((req) => {
      const reqKg = Number(req.requiredKg);
      const actualIssuedFromTx = req.transactions.reduce(
        (acc, tx) => acc + Number(tx.kilos),
        0,
      );
      const issuedKg = Math.max(actualIssuedFromTx, Number(req.issuedKg));
      const remainingKg = Math.max(0, reqKg - issuedKg);
      const fulfillmentPct =
        reqKg > 0 ? Number(((issuedKg / reqKg) * 100).toFixed(2)) : 0;
      const lineStatus = this.computeRequirementStatus(
        reqKg,
        issuedKg,
        isPoCancelled,
      );

      poRequiredKg += reqKg;
      poIssuedKg += issuedKg;

      return {
        id: req.id,
        purchaseOrderId: req.purchaseOrderId,
        poNumber: req.poNumber || po.poNumber,
        yarnCount: req.yarnCount,
        quality: (req as any).quality || null,
        size: (req as any).size || null,
        useFor: (req as any).useFor || null,
        purpose: req.purpose,
        pcs: (req as any).pcs || null,
        qty: (req as any).qty ? Number((req as any).qty) : null,
        requiredKg: Number(reqKg.toFixed(4)),
        issuedKg: Number(issuedKg.toFixed(4)),
        remainingKg: Number(remainingKg.toFixed(4)),
        fulfillmentPct,
        status: lineStatus,
        isActive: req.isActive ?? true,
        isArchived: req.isArchived ?? false,
        archivedAt: req.archivedAt ?? null,
        archivedById: req.archivedById ?? null,
        notes: req.notes,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
        transactions: req.transactions.map((tx) => ({
          id: tx.id,
          transactionNumber: tx.transactionNumber,
          transactionDate: tx.transactionDate,
          type: tx.type,
          kilos: Number(tx.kilos),
          bags: tx.bags,
          lotNumber: tx.lot?.lotNumber || null,
          createdByName: tx.createdBy
            ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}`
            : null,
        })),
      };
    });

    const poRemainingKg = Math.max(0, poRequiredKg - poIssuedKg);
    const overallFulfillmentPct =
      poRequiredKg > 0
        ? Number(((poIssuedKg / poRequiredKg) * 100).toFixed(2))
        : 0;

    let effectiveStatus: POStatus | string = po.status;
    if (po.status !== POStatus.CANCELLED && po.status !== POStatus.DRAFT) {
      if (poIssuedKg >= poRequiredKg && poRequiredKg > 0) {
        effectiveStatus = 'FULFILLED';
      } else if (poIssuedKg > 0) {
        effectiveStatus = 'PARTIALLY_FULFILLED';
      } else {
        effectiveStatus = 'ACTIVE';
      }
    }

        return {
          id: po.id,
          poNumber: po.poNumber,
          partyId: po.partyId,
          party: {
            id: po.party.id,
            name: po.party.name,
            code: po.party.code,
            type: po.party.type,
            contactPerson: po.party.contactPerson,
            phone: po.party.phone,
            email: po.party.email,
            gstNumber: po.party.gstNumber,
            address: po.party.address,
          },
          status: effectiveStatus,
          orderDate: po.orderDate,
          deliveryDue: po.deliveryDue,
          totalAmount: po.totalAmount ? Number(po.totalAmount) : null,
          remarks: po.remarks,
          createdAt: po.createdAt,
          updatedAt: po.updatedAt,
          totalRequiredKg: Number(poRequiredKg.toFixed(4)),
          totalIssuedKg: Number(poIssuedKg.toFixed(4)),
          totalRemainingKg: Number(poRemainingKg.toFixed(4)),
          overallFulfillmentPct,
          requirementsCount: computedReqs.length,
          requirements: computedReqs,
        };
      },
      30,
    );
  }

  private mapToPrismaPOStatus(status?: string): POStatus {
    if (!status) return POStatus.CONFIRMED;
    const upper = status.toUpperCase();
    if (upper === 'ACTIVE') return POStatus.CONFIRMED;
    if (upper === 'PARTIALLY_FULFILLED') return POStatus.PARTIALLY_DELIVERED;
    if (upper === 'FULFILLED') return POStatus.FULFILLED;
    if (upper === 'CANCELLED') return POStatus.CANCELLED;
    if (upper === 'DRAFT') return POStatus.DRAFT;
    if (upper === 'IN_PRODUCTION') return POStatus.IN_PRODUCTION;
    return POStatus.CONFIRMED;
  }

  // ---------------------------------------------------------------------------
  // 4. CREATE PURCHASE ORDER WITH MULTIPLE REQUIREMENT LINES
  // ---------------------------------------------------------------------------
  async create(
    dto: CreatePurchaseOrderDto,
    userId?: string,
  ): Promise<PurchaseOrderComputed> {
    const cleanPo = dto.poNumber.trim();

    // 1. Verify unique PO Number
    const existing = await this.prisma.purchaseOrder.findUnique({
      where: { poNumber: cleanPo },
    });
    if (existing) {
      throw new ConflictException(
        `Purchase Order "${cleanPo}" already exists. Please use a unique PO number.`,
      );
    }

    // 2. Verify Party exists in Party Master
    const party = await this.prisma.party.findUnique({
      where: { id: dto.partyId },
    });
    if (!party) {
      throw new NotFoundException(
        `Party with ID "${dto.partyId}" not found in Party Master. Please select an existing party.`,
      );
    }

    // 3. Validate Requirements
    if (!dto.requirements || dto.requirements.length === 0) {
      throw new BadRequestException(
        'A Purchase Order must contain at least one yarn requirement line.',
      );
    }

    const orderDate = dto.orderDate ? new Date(dto.orderDate) : new Date();
    const deliveryDue = dto.deliveryDue ? new Date(dto.deliveryDue) : null;
    const initialStatus = this.mapToPrismaPOStatus(dto.status);

    try {
      // Create PO Header
      const createdPo = await this.prisma.purchaseOrder.create({
        data: {
          poNumber: cleanPo,
          partyId: party.id,
          orderDate,
          deliveryDue,
          totalAmount: dto.totalAmount ? new Prisma.Decimal(dto.totalAmount) : null,
          remarks: dto.remarks?.trim() || null,
          status: initialStatus,
        },
      });

      // Create each requirement line with unique UUID
      for (const req of dto.requirements) {
        const cleanCount = req.yarnCount.trim();
        const cleanPurpose = req.purpose.trim().toUpperCase();
        const reqKg = new Prisma.Decimal(req.requiredKg);

        if (req.requiredKg <= 0) {
          throw new BadRequestException(
            `Requirement line for count "${cleanCount}" must have Required KG > 0. Received: ${req.requiredKg}`,
          );
        }

        await this.prisma.pORequirement.create({
          data: {
            purchaseOrder: { connect: { id: createdPo.id } },
            poNumber: cleanPo,
            yarnCount: cleanCount,
            purpose: cleanPurpose,
            requiredKg: reqKg,
            issuedKg: new Prisma.Decimal(0),
            quality: req.quality?.trim() || null,
            size: req.size?.trim() || null,
            useFor: req.useFor?.trim() || null,
            pcs: req.pcs !== undefined ? req.pcs : null,
            qty: req.qty !== undefined ? new Prisma.Decimal(req.qty) : null,
            notes: req.notes?.trim() || null,
            status: 'PENDING',
          } as any,
        });
      }

      // Audit Log
      await this.prisma.auditLog.create({
        data: {
          userId: userId || null,
          action: 'CREATE_PURCHASE_ORDER',
          module: 'COMMERCIAL',
          entityType: 'PurchaseOrder',
          entityId: createdPo.id,
          newValue: {
            poNumber: cleanPo,
            partyName: party.name,
            requirementsCount: dto.requirements.length,
            totalRequiredKg: dto.requirements.reduce(
              (sum, r) => sum + r.requiredKg,
              0,
            ),
          },
          metadata: { partyId: party.id, poNumber: cleanPo },
        },
      });

      this.invalidatePOCaches();
      return this.findById(createdPo.id);
    } catch (error) {
      this.logger.error(`Failed to create purchase order ${cleanPo}: ${error?.message || error}`, error?.stack);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. UPDATE PURCHASE ORDER & REQUIREMENTS
  // ---------------------------------------------------------------------------
  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    userId?: string,
  ): Promise<PurchaseOrderComputed> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        requirements: {
          include: {
            transactions: { where: { type: TransactionType.ISSUED } },
          },
        },
      },
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order with ID "${id}" not found`);
    }

    if (po.status === POStatus.CANCELLED) {
      throw new BadRequestException(
        `Cannot edit Purchase Order "${po.poNumber}" because it is CANCELLED.`,
      );
    }

    if (dto.partyId && dto.partyId !== po.partyId) {
      const party = await this.prisma.party.findUnique({
        where: { id: dto.partyId },
      });
      if (!party) {
        throw new NotFoundException(`Party "${dto.partyId}" not found in Party Master`);
      }
    }

    const updateData: Prisma.PurchaseOrderUpdateInput = {};

    if (dto.partyId) updateData.party = { connect: { id: dto.partyId } };
    if (dto.orderDate) updateData.orderDate = new Date(dto.orderDate);
    if (dto.deliveryDue !== undefined) {
      updateData.deliveryDue = dto.deliveryDue ? new Date(dto.deliveryDue) : null;
    }
    if (dto.totalAmount !== undefined) {
      updateData.totalAmount = dto.totalAmount !== null ? new Prisma.Decimal(dto.totalAmount) : null;
    }
    if (dto.remarks !== undefined) updateData.remarks = dto.remarks?.trim() || null;
    if (dto.status) updateData.status = this.mapToPrismaPOStatus(dto.status);

    await this.prisma.purchaseOrder.update({
      where: { id: po.id },
      data: updateData,
    });

    // Update / Sync requirement lines if provided
    if (dto.requirements && dto.requirements.length > 0) {
      const incomingReqIds = dto.requirements
        .map((r) => r.id)
        .filter(Boolean) as string[];

      // Check unissued requirements to delete
      for (const existingReq of po.requirements) {
        if (!incomingReqIds.includes(existingReq.id)) {
          const hasIssues =
            existingReq.transactions.length > 0 ||
            Number(existingReq.issuedKg) > 0.0001;

          if (hasIssues) {
            throw new BadRequestException(
              `Cannot remove requirement line for count "${existingReq.yarnCount}" (${existingReq.purpose}) because ${Number(existingReq.issuedKg).toFixed(2)} KG has already been issued against it.`,
            );
          }

          await this.prisma.pORequirement.delete({ where: { id: existingReq.id } });
        }
      }

      // Upsert incoming lines
      for (const req of dto.requirements) {
        const reqKg = new Prisma.Decimal(req.requiredKg);
        const cleanCount = req.yarnCount.trim();
        const cleanPurpose = req.purpose.trim().toUpperCase();

        if (req.id) {
          // Update existing
          const existingLine = po.requirements.find((r) => r.id === req.id);
          if (existingLine) {
            const currentIssued = Number(existingLine.issuedKg);
            if (req.requiredKg < currentIssued) {
              throw new BadRequestException(
                `Cannot reduce Required KG (${req.requiredKg} KG) below already issued quantity (${currentIssued} KG) for requirement "${cleanCount}" (${cleanPurpose}).`,
              );
            }
          }

          await this.prisma.pORequirement.update({
            where: { id: req.id },
            data: {
              yarnCount: cleanCount,
              purpose: cleanPurpose,
              requiredKg: reqKg,
              quality: req.quality?.trim() || null,
              size: req.size?.trim() || null,
              useFor: req.useFor?.trim() || null,
              pcs: req.pcs !== undefined ? req.pcs : null,
              qty: req.qty !== undefined ? new Prisma.Decimal(req.qty) : null,
              notes: req.notes?.trim() || null,
            } as any,
          });
        } else {
          // Create new line
          await this.prisma.pORequirement.create({
            data: {
              purchaseOrder: { connect: { id: po.id } },
              poNumber: po.poNumber,
              yarnCount: cleanCount,
              purpose: cleanPurpose,
              requiredKg: reqKg,
              issuedKg: new Prisma.Decimal(0),
              quality: req.quality?.trim() || null,
              size: req.size?.trim() || null,
              useFor: req.useFor?.trim() || null,
              pcs: req.pcs !== undefined ? req.pcs : null,
              qty: req.qty !== undefined ? new Prisma.Decimal(req.qty) : null,
              notes: req.notes?.trim() || null,
              status: 'PENDING',
            } as any,
          });
        }
      }
    }

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'UPDATE_PURCHASE_ORDER',
        module: 'COMMERCIAL',
        entityType: 'PurchaseOrder',
        entityId: po.id,
        newValue: { poNumber: po.poNumber, updatedFields: Object.keys(dto) },
        metadata: { poNumber: po.poNumber },
      },
    });

    this.invalidatePOCaches();
    return this.findById(po.id);
  }

  // ---------------------------------------------------------------------------
  // 6. CANCEL PURCHASE ORDER (NO HARD DELETE)
  // ---------------------------------------------------------------------------
  async cancel(
    id: string,
    dto: CancelPurchaseOrderDto = {},
    userId?: string,
  ): Promise<PurchaseOrderComputed> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        requirements: {
          include: {
            transactions: { where: { type: TransactionType.ISSUED } },
          },
        },
      },
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order with ID "${id}" not found`);
    }

    if (po.status === POStatus.CANCELLED) {
      return this.findById(po.id);
    }

    const cancelReason = dto.reason?.trim() || 'Cancelled by authorized user';
    const updatedRemarks = po.remarks
      ? `${po.remarks}\n[CANCELLED: ${cancelReason}]`
      : `[CANCELLED: ${cancelReason}]`;

    await this.prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: POStatus.CANCELLED,
        remarks: updatedRemarks,
      },
    });

    // Update requirement line statuses to CANCELLED
    await this.prisma.pORequirement.updateMany({
      where: { purchaseOrderId: po.id },
      data: { status: 'CANCELLED' } as any,
    });

    // Audit Log
    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'CANCEL_PURCHASE_ORDER',
        module: 'COMMERCIAL',
        entityType: 'PurchaseOrder',
        entityId: po.id,
        oldValue: { status: po.status },
        newValue: { status: POStatus.CANCELLED, reason: cancelReason },
        metadata: { poNumber: po.poNumber },
      },
    });

    this.invalidatePOCaches();
    return this.findById(po.id);
  }

  // ---------------------------------------------------------------------------
  // 7. ADD REQUIREMENT LINE TO EXISTING PO
  // ---------------------------------------------------------------------------
  async addRequirement(
    poId: string,
    dto: CreatePORequirementDto,
    userId?: string,
  ): Promise<PORequirementComputed> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: poId },
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order "${poId}" not found`);
    }

    if (po.status === POStatus.CANCELLED) {
      throw new BadRequestException(`Cannot add requirements to CANCELLED PO "${po.poNumber}"`);
    }

    const cleanCount = dto.yarnCount.trim();
    const cleanPurpose = dto.purpose.trim().toUpperCase();
    const reqKg = new Prisma.Decimal(dto.requiredKg);

    const createdReq = await this.prisma.pORequirement.create({
      data: {
        purchaseOrder: { connect: { id: po.id } },
        poNumber: po.poNumber,
        yarnCount: cleanCount,
        purpose: cleanPurpose,
        requiredKg: reqKg,
        issuedKg: new Prisma.Decimal(0),
        quality: dto.quality?.trim() || null,
        size: dto.size?.trim() || null,
        useFor: dto.useFor?.trim() || null,
        pcs: dto.pcs !== undefined ? dto.pcs : null,
        qty: dto.qty !== undefined ? new Prisma.Decimal(dto.qty) : null,
        notes: dto.notes?.trim() || null,
        status: 'PENDING',
        isActive: true,
        isArchived: false,
      } as any,
    });

    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'ADD_PO_REQUIREMENT',
        module: 'COMMERCIAL',
        entityType: 'PORequirement',
        entityId: createdReq.id,
        newValue: {
          poNumber: po.poNumber,
          yarnCount: cleanCount,
          purpose: cleanPurpose,
          requiredKg: dto.requiredKg,
        },
        metadata: { poId: po.id, poNumber: po.poNumber },
      },
    });

    return {
      id: createdReq.id,
      purchaseOrderId: createdReq.purchaseOrderId,
      poNumber: po.poNumber,
      yarnCount: createdReq.yarnCount,
      quality: (createdReq as any).quality || null,
      size: (createdReq as any).size || null,
      useFor: (createdReq as any).useFor || null,
      purpose: createdReq.purpose,
      pcs: (createdReq as any).pcs || null,
      qty: (createdReq as any).qty ? Number((createdReq as any).qty) : null,
      requiredKg: Number(createdReq.requiredKg),
      issuedKg: 0,
      remainingKg: Number(createdReq.requiredKg),
      fulfillmentPct: 0,
      status: 'PENDING',
      isActive: true,
      isArchived: false,
      archivedAt: null,
      archivedById: null,
      notes: createdReq.notes,
      createdAt: createdReq.createdAt,
      updatedAt: createdReq.updatedAt,
      transactions: [],
    };
  }

  // ---------------------------------------------------------------------------
  // 8. GET REQUIREMENTS CATALOG (FOR INVENTORY ISSUE DROPDOWNS & FLOOR SELECTORS)
  // ---------------------------------------------------------------------------
  async getRequirements(filter: {
    poNumber?: string;
    yarnCount?: string;
    purpose?: string;
    partyId?: string;
    includeArchived?: boolean;
  } = {}): Promise<Array<{
    id: string;
    poNumber: string;
    partyName: string;
    partyId: string;
    yarnCount: string;
    quality: string | null;
    size: string | null;
    purpose: string;
    requiredKg: number;
    issuedKg: number;
    remainingKg: number;
    ceiling103Kg: number;
    status: string;
    isActive: boolean;
    isArchived: boolean;
    archivedAt: Date | null;
  }>> {
    const where: Prisma.PORequirementWhereInput = {
      purchaseOrder: {
        status: { not: POStatus.CANCELLED },
      },
    };

    if (!filter.includeArchived) {
      where.isArchived = false;
      where.isActive = true;
    }

    if (filter.poNumber) {
      where.OR = [
        { poNumber: { equals: filter.poNumber.trim(), mode: 'insensitive' } },
        { purchaseOrder: { poNumber: { equals: filter.poNumber.trim(), mode: 'insensitive' } } },
      ];
    }

    if (filter.yarnCount) {
      where.yarnCount = { equals: filter.yarnCount.trim(), mode: 'insensitive' };
    }

    if (filter.purpose) {
      where.purpose = { equals: filter.purpose.trim().toUpperCase(), mode: 'insensitive' };
    }

    if (filter.partyId) {
      where.purchaseOrder = {
        ...(where.purchaseOrder as any),
        partyId: filter.partyId,
      };
    }

    const reqs = await this.prisma.pORequirement.findMany({
      where,
      include: {
        purchaseOrder: {
          include: { party: true },
        },
        transactions: {
          where: { type: TransactionType.ISSUED },
          select: { kilos: true },
        },
      },
      orderBy: [{ poNumber: 'asc' }, { createdAt: 'asc' }],
    });

    return reqs.map((req) => {
      const reqKg = Number(req.requiredKg);
      const actualIssued = req.transactions.reduce(
        (sum, t) => sum + Number(t.kilos),
        0,
      );
      const issuedKg = Math.max(actualIssued, Number(req.issuedKg));
      const remainingKg = Math.max(0, reqKg - issuedKg);
      const ceiling103Kg = Number((reqKg * 1.03).toFixed(4));
      const lineStatus = this.computeRequirementStatus(reqKg, issuedKg);

      return {
        id: req.id,
        poNumber: req.poNumber || req.purchaseOrder?.poNumber || 'UNKNOWN',
        partyName: req.purchaseOrder?.party?.name || 'Unknown Party',
        partyId: req.purchaseOrder?.partyId || '',
        yarnCount: req.yarnCount || 'N/A',
        quality: (req as any).quality || null,
        size: (req as any).size || null,
        purpose: req.purpose || 'GENERAL',
        requiredKg: Number(reqKg.toFixed(4)),
        issuedKg: Number(issuedKg.toFixed(4)),
        remainingKg: Number(remainingKg.toFixed(4)),
        ceiling103Kg,
        status: lineStatus,
        isActive: req.isActive ?? true,
        isArchived: req.isArchived ?? false,
        archivedAt: req.archivedAt ?? null,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 9. GET FULFILLMENT BREAKDOWN FOR A PO
  // ---------------------------------------------------------------------------
  async getFulfillment(idOrPoNumber: string) {
    const po = await this.findById(idOrPoNumber);
    return {
      poNumber: po.poNumber,
      party: po.party,
      orderDate: po.orderDate,
      status: po.status,
      metrics: {
        totalRequiredKg: po.totalRequiredKg,
        totalIssuedKg: po.totalIssuedKg,
        totalRemainingKg: po.totalRemainingKg,
        overallFulfillmentPct: po.overallFulfillmentPct,
      },
      requirements: po.requirements,
    };
  }

  // ---------------------------------------------------------------------------
  // 10. ARCHIVE PO REQUIREMENT (SOFT DELETE)
  // ---------------------------------------------------------------------------
  async archiveRequirement(
    id: string,
    userId?: string,
    reason?: string,
  ): Promise<PORequirementComputed> {
    const req = await this.prisma.pORequirement.findUnique({
      where: { id },
      include: {
        purchaseOrder: { include: { party: true } },
        transactions: {
          where: { type: TransactionType.ISSUED },
          select: {
            id: true,
            transactionNumber: true,
            transactionDate: true,
            type: true,
            kilos: true,
            bags: true,
            lot: { select: { lotNumber: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { transactionDate: 'desc' },
        },
      },
    });

    if (!req) {
      throw new NotFoundException(`PO Requirement with ID "${id}" not found`);
    }

    if (req.isArchived) {
      throw new BadRequestException(
        `PO Requirement for count "${req.yarnCount}" (${req.purpose}) is already archived.`,
      );
    }

    const archivedAt = new Date();
    const updated = await this.prisma.pORequirement.update({
      where: { id },
      data: {
        isArchived: true,
        isActive: false,
        archivedAt,
        archivedById: userId || null,
      },
      include: {
        purchaseOrder: { include: { party: true } },
        transactions: {
          where: { type: TransactionType.ISSUED },
          select: {
            id: true,
            transactionNumber: true,
            transactionDate: true,
            type: true,
            kilos: true,
            bags: true,
            lot: { select: { lotNumber: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { transactionDate: 'desc' },
        },
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'ARCHIVE_PO_REQUIREMENT',
        module: 'COMMERCIAL',
        entityType: 'PORequirement',
        entityId: id,
        oldValue: {
          isArchived: req.isArchived,
          isActive: req.isActive,
          archivedAt: req.archivedAt,
          archivedById: req.archivedById,
        },
        newValue: {
          isArchived: true,
          isActive: false,
          archivedAt,
          archivedById: userId || null,
          reason: reason || 'Archived by user',
        },
        metadata: {
          poNumber: req.poNumber || req.purchaseOrder?.poNumber,
          yarnCount: req.yarnCount,
          purpose: req.purpose,
          reason: reason || null,
        },
      },
    });

    const isPoCancelled = req.purchaseOrder?.status === POStatus.CANCELLED;
    const reqKg = Number(updated.requiredKg);
    const actualIssuedFromTx = updated.transactions.reduce(
      (acc, tx) => acc + Number(tx.kilos),
      0,
    );
    const issuedKg = Math.max(actualIssuedFromTx, Number(updated.issuedKg));
    const remainingKg = Math.max(0, reqKg - issuedKg);
    const fulfillmentPct =
      reqKg > 0 ? Number(((issuedKg / reqKg) * 100).toFixed(2)) : 0;
    const lineStatus = this.computeRequirementStatus(
      reqKg,
      issuedKg,
      isPoCancelled,
    );

    return {
      id: updated.id,
      purchaseOrderId: updated.purchaseOrderId,
      poNumber: updated.poNumber || updated.purchaseOrder?.poNumber || null,
      yarnCount: updated.yarnCount,
      quality: (updated as any).quality || null,
      size: (updated as any).size || null,
      useFor: (updated as any).useFor || null,
      purpose: updated.purpose,
      pcs: (updated as any).pcs || null,
      qty: (updated as any).qty ? Number((updated as any).qty) : null,
      requiredKg: Number(reqKg.toFixed(4)),
      issuedKg: Number(issuedKg.toFixed(4)),
      remainingKg: Number(remainingKg.toFixed(4)),
      fulfillmentPct,
      status: lineStatus,
      isActive: updated.isActive,
      isArchived: updated.isArchived,
      archivedAt: updated.archivedAt,
      archivedById: updated.archivedById,
      notes: updated.notes,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      transactions: updated.transactions.map((tx) => ({
        id: tx.id,
        transactionNumber: tx.transactionNumber,
        transactionDate: tx.transactionDate,
        type: tx.type,
        kilos: Number(tx.kilos),
        bags: tx.bags,
        lotNumber: tx.lot?.lotNumber || null,
        createdByName: tx.createdBy
          ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}`
          : null,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // 11. RESTORE PO REQUIREMENT
  // ---------------------------------------------------------------------------
  async restoreRequirement(
    id: string,
    userId?: string,
  ): Promise<PORequirementComputed> {
    const req = await this.prisma.pORequirement.findUnique({
      where: { id },
      include: {
        purchaseOrder: { include: { party: true } },
        transactions: {
          where: { type: TransactionType.ISSUED },
          select: {
            id: true,
            transactionNumber: true,
            transactionDate: true,
            type: true,
            kilos: true,
            bags: true,
            lot: { select: { lotNumber: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { transactionDate: 'desc' },
        },
      },
    });

    if (!req) {
      throw new NotFoundException(`PO Requirement with ID "${id}" not found`);
    }

    if (!req.isArchived) {
      throw new BadRequestException(
        `PO Requirement for count "${req.yarnCount}" (${req.purpose}) is not archived.`,
      );
    }

    const updated = await this.prisma.pORequirement.update({
      where: { id },
      data: {
        isArchived: false,
        isActive: true,
        archivedAt: null,
        archivedById: null,
      },
      include: {
        purchaseOrder: { include: { party: true } },
        transactions: {
          where: { type: TransactionType.ISSUED },
          select: {
            id: true,
            transactionNumber: true,
            transactionDate: true,
            type: true,
            kilos: true,
            bags: true,
            lot: { select: { lotNumber: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { transactionDate: 'desc' },
        },
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'RESTORE_PO_REQUIREMENT',
        module: 'COMMERCIAL',
        entityType: 'PORequirement',
        entityId: id,
        oldValue: {
          isArchived: true,
          isActive: false,
          archivedAt: req.archivedAt,
          archivedById: req.archivedById,
        },
        newValue: {
          isArchived: false,
          isActive: true,
          archivedAt: null,
          archivedById: null,
        },
        metadata: {
          poNumber: req.poNumber || req.purchaseOrder?.poNumber,
          yarnCount: req.yarnCount,
          purpose: req.purpose,
        },
      },
    });

    const isPoCancelled = req.purchaseOrder?.status === POStatus.CANCELLED;
    const reqKg = Number(updated.requiredKg);
    const actualIssuedFromTx = updated.transactions.reduce(
      (acc, tx) => acc + Number(tx.kilos),
      0,
    );
    const issuedKg = Math.max(actualIssuedFromTx, Number(updated.issuedKg));
    const remainingKg = Math.max(0, reqKg - issuedKg);
    const fulfillmentPct =
      reqKg > 0 ? Number(((issuedKg / reqKg) * 100).toFixed(2)) : 0;
    const lineStatus = this.computeRequirementStatus(
      reqKg,
      issuedKg,
      isPoCancelled,
    );

    return {
      id: updated.id,
      purchaseOrderId: updated.purchaseOrderId,
      poNumber: updated.poNumber || updated.purchaseOrder?.poNumber || null,
      yarnCount: updated.yarnCount,
      quality: (updated as any).quality || null,
      size: (updated as any).size || null,
      useFor: (updated as any).useFor || null,
      purpose: updated.purpose,
      pcs: (updated as any).pcs || null,
      qty: (updated as any).qty ? Number((updated as any).qty) : null,
      requiredKg: Number(reqKg.toFixed(4)),
      issuedKg: Number(issuedKg.toFixed(4)),
      remainingKg: Number(remainingKg.toFixed(4)),
      fulfillmentPct,
      status: lineStatus,
      isActive: updated.isActive,
      isArchived: updated.isArchived,
      archivedAt: updated.archivedAt,
      archivedById: updated.archivedById,
      notes: updated.notes,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      transactions: updated.transactions.map((tx) => ({
        id: tx.id,
        transactionNumber: tx.transactionNumber,
        transactionDate: tx.transactionDate,
        type: tx.type,
        kilos: Number(tx.kilos),
        bags: tx.bags,
        lotNumber: tx.lot?.lotNumber || null,
        createdByName: tx.createdBy
          ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}`
          : null,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // 12. HARD DELETE PO REQUIREMENT (BLOCKED IF TRANSACTIONS EXIST)
  // ---------------------------------------------------------------------------
  async deleteRequirement(
    id: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const req = await this.prisma.pORequirement.findUnique({
      where: { id },
      include: {
        transactions: true,
        purchaseOrder: true,
      },
    });

    if (!req) {
      throw new NotFoundException(`PO Requirement with ID "${id}" not found`);
    }

    const hasTransactions = req.transactions.length > 0;
    const hasIssuedKg = Number(req.issuedKg) > 0.0001;

    if (hasTransactions || hasIssuedKg) {
      throw new BadRequestException(
        `Cannot delete PO Requirement for count "${req.yarnCount}" (${req.purpose}) because it is referenced by ${req.transactions.length} historical stock transaction(s) with ${Number(req.issuedKg).toFixed(2)} KG issued. Archive this requirement instead to preserve historical integrity.`,
      );
    }

    await this.prisma.pORequirement.delete({
      where: { id },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'DELETE_PO_REQUIREMENT',
        module: 'COMMERCIAL',
        entityType: 'PORequirement',
        entityId: id,
        oldValue: {
          poNumber: req.poNumber || req.purchaseOrder?.poNumber,
          yarnCount: req.yarnCount,
          purpose: req.purpose,
          requiredKg: Number(req.requiredKg),
        },
        metadata: {
          poNumber: req.poNumber || req.purchaseOrder?.poNumber,
          yarnCount: req.yarnCount,
          purpose: req.purpose,
        },
      },
    });

    return {
      success: true,
      message: `PO Requirement for count "${req.yarnCount}" (${req.purpose}) has been deleted.`,
    };
  }
}
