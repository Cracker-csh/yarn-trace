import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  ProductionOrderStatus,
  YarnAllocationStatus,
  TransactionType,
  LotStatus,
} from '@prisma/client';
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
import { AppCacheService } from '../common/cache/app-cache.service';

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: AppCacheService,
  ) {}

  public invalidateProductionCaches() {
    this.cacheService.delPattern(/^production/);
    this.cacheService.delPattern(/^dashboard/);
    this.cacheService.delPattern(/^reports/);
    this.cacheService.delPattern(/^inventory/);
  }

  private async executeProductionTx<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn, {
      maxWait: 15000,
      timeout: 60000,
    });
  }

  // Helper to generate unique sequential Work Order numbers (e.g., WO-2026-0001)
  private async generateWorkOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `WO-${year}-`;

    const latestOrder = await tx.productionOrder.findFirst({
      where: {
        orderNumber: { startsWith: prefix },
      },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    let seq = 1;
    if (latestOrder && latestOrder.orderNumber) {
      const parts = latestOrder.orderNumber.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) {
          seq = parsed + 1;
        }
      }
    }

    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  // Helper to generate transaction numbers
  private generateTxNumber(typePrefix: string): string {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `TXN-${typePrefix}-${timestamp}-${random}`;
  }

  // Ensure default main warehouse location exists
  private async getOrCreateDefaultLocation(tx: Prisma.TransactionClient) {
    let location = await tx.stockLocation.findFirst({
      where: { code: 'MAIN_WH' },
    });

    if (!location) {
      location = await tx.stockLocation.create({
        data: {
          code: 'MAIN_WH',
          name: 'Main Yarn Warehouse',
          type: 'WAREHOUSE',
          description: 'Primary yarn storage warehouse and staging area',
          isActive: true,
        },
      });
    }

    return location;
  }

  // ===========================================================================
  // 1. PRODUCTION TEAMS MASTER
  // ===========================================================================

  async getTeams(includeInactive = false) {
    const cacheKey = `production:teams:${includeInactive}`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const where: Prisma.ProductionTeamWhereInput = includeInactive ? {} : { isActive: true };

        const teams = await this.prisma.productionTeam.findMany({
          where,
          include: {
            orders: {
              select: { id: true, status: true },
            },
            allocations: {
              select: { allocatedKg: true },
            },
            consumptionRecords: {
              where: { isCorrected: false },
              select: { consumedKg: true, wasteKg: true },
            },
            returns: {
              select: { returnedKg: true },
            },
          },
          orderBy: { name: 'asc' },
        });

        return teams.map((team) => {
          const activeOrdersCount = team.orders.filter(
            (o) => o.status === ProductionOrderStatus.PLANNED || o.status === ProductionOrderStatus.IN_PROGRESS,
          ).length;

          const totalAllocatedKg = team.allocations.reduce((acc, a) => acc + Number(a.allocatedKg), 0);
          const totalConsumedKg = team.consumptionRecords.reduce(
            (acc, c) => acc + Number(c.consumedKg) + Number(c.wasteKg),
            0,
          );
          const totalReturnedKg = team.returns.reduce((acc, r) => acc + Number(r.returnedKg), 0);
          const currentStockKg = Math.max(0, totalAllocatedKg - totalConsumedKg - totalReturnedKg);

          return {
            id: team.id,
            code: team.code,
            name: team.name,
            department: team.department,
            teamLead: team.teamLead,
            remarks: team.remarks,
            isActive: team.isActive,
            activeOrdersCount,
            totalAllocatedKg: Number(totalAllocatedKg.toFixed(4)),
            totalConsumedKg: Number(totalConsumedKg.toFixed(4)),
            totalReturnedKg: Number(totalReturnedKg.toFixed(4)),
            currentStockKg: Number(currentStockKg.toFixed(4)),
            createdAt: team.createdAt,
            updatedAt: team.updatedAt,
          };
        });
      },
      30,
    );
  }

  async getTeamById(id: string) {
    const team = await this.prisma.productionTeam.findUnique({
      where: { id },
      include: {
        orders: {
          include: {
            party: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        allocations: {
          include: {
            lot: true,
            productionOrder: true,
          },
          orderBy: { allocatedDate: 'desc' },
        },
        consumptionRecords: {
          where: { isCorrected: false },
          include: {
            lot: true,
            productionOrder: true,
          },
          orderBy: { consumptionDate: 'desc' },
        },
        returns: {
          include: {
            lot: true,
            productionOrder: true,
          },
          orderBy: { returnDate: 'desc' },
        },
      },
    });

    if (!team) {
      throw new NotFoundException(`Production Team with ID "${id}" not found`);
    }

    // Calculate itemized inventory balances for this team by Lot + Count
    const lotBalancesMap = new Map<string, {
      lotId: string;
      lotNumber: string;
      yarnCount: string;
      allocatedKg: number;
      consumedKg: number;
      wasteKg: number;
      returnedKg: number;
      availableBalanceKg: number;
    }>();

    for (const alloc of team.allocations) {
      const key = `${alloc.lotId}-${alloc.yarnCount || 'DEFAULT'}`;
      const existing = lotBalancesMap.get(key) || {
        lotId: alloc.lotId,
        lotNumber: alloc.lot.lotNumber,
        yarnCount: alloc.yarnCount || alloc.lot.yarnCount || '—',
        allocatedKg: 0,
        consumedKg: 0,
        wasteKg: 0,
        returnedKg: 0,
        availableBalanceKg: 0,
      };
      existing.allocatedKg += Number(alloc.allocatedKg);
      lotBalancesMap.set(key, existing);
    }

    for (const cons of team.consumptionRecords) {
      const key = `${cons.lotId}-${cons.yarnCount || 'DEFAULT'}`;
      const existing = lotBalancesMap.get(key);
      if (existing) {
        existing.consumedKg += Number(cons.consumedKg);
        existing.wasteKg += Number(cons.wasteKg);
      }
    }

    for (const ret of team.returns) {
      const key = `${ret.lotId}-${ret.yarnCount || 'DEFAULT'}`;
      const existing = lotBalancesMap.get(key);
      if (existing) {
        existing.returnedKg += Number(ret.returnedKg);
      }
    }

    const inventoryBreakdown = Array.from(lotBalancesMap.values()).map((item) => ({
      ...item,
      allocatedKg: Number(item.allocatedKg.toFixed(4)),
      consumedKg: Number(item.consumedKg.toFixed(4)),
      wasteKg: Number(item.wasteKg.toFixed(4)),
      returnedKg: Number(item.returnedKg.toFixed(4)),
      availableBalanceKg: Number(
        Math.max(0, item.allocatedKg - item.consumedKg - item.wasteKg - item.returnedKg).toFixed(4),
      ),
    }));

    return {
      ...team,
      inventoryBreakdown,
    };
  }

  async createTeam(dto: CreateProductionTeamDto, userId?: string) {
    const existing = await this.prisma.productionTeam.findUnique({
      where: { code: dto.code.trim().toUpperCase() },
    });

    if (existing) {
      throw new BadRequestException(`Production Team code "${dto.code}" already exists.`);
    }

    const team = await this.prisma.productionTeam.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        department: dto.department.trim().toUpperCase(),
        teamLead: dto.teamLead?.trim() || null,
        remarks: dto.remarks?.trim() || null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'CREATE_PRODUCTION_TEAM',
        module: 'PRODUCTION',
        entityType: 'ProductionTeam',
        entityId: team.id,
        newValue: team,
      },
    });

    return team;
  }

  async updateTeam(id: string, dto: UpdateProductionTeamDto, userId?: string) {
    const existing = await this.prisma.productionTeam.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Production Team with ID "${id}" not found`);
    }

    const team = await this.prisma.productionTeam.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        department: dto.department !== undefined ? dto.department.trim().toUpperCase() : undefined,
        teamLead: dto.teamLead !== undefined ? (dto.teamLead ? dto.teamLead.trim() : null) : undefined,
        remarks: dto.remarks !== undefined ? (dto.remarks ? dto.remarks.trim() : null) : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'UPDATE_PRODUCTION_TEAM',
        module: 'PRODUCTION',
        entityType: 'ProductionTeam',
        entityId: team.id,
        oldValue: existing,
        newValue: team,
      },
    });

    return team;
  }

  async deleteTeam(id: string, userId?: string) {
    const team = await this.prisma.productionTeam.findUnique({
      where: { id },
      include: {
        orders: { where: { status: { in: [ProductionOrderStatus.PLANNED, ProductionOrderStatus.IN_PROGRESS] } } },
        allocations: true,
      },
    });

    if (!team) {
      throw new NotFoundException(`Production Team with ID "${id}" not found`);
    }

    if (team.orders.length > 0 || team.allocations.length > 0) {
      // Soft-deactivate if has history
      const updated = await this.prisma.productionTeam.update({
        where: { id },
        data: { isActive: false },
      });

      await this.prisma.auditLog.create({
        data: {
          userId: userId || null,
          action: 'DEACTIVATE_PRODUCTION_TEAM',
          module: 'PRODUCTION',
          entityType: 'ProductionTeam',
          entityId: team.id,
          oldValue: { isActive: true },
          newValue: { isActive: false },
        },
      });

      return { message: 'Production team has active history and has been deactivated.', team: updated };
    }

    await this.prisma.productionTeam.delete({ where: { id } });

    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'DELETE_PRODUCTION_TEAM',
        module: 'PRODUCTION',
        entityType: 'ProductionTeam',
        entityId: id,
        oldValue: team,
      },
    });

    return { message: 'Production team deleted successfully.' };
  }

  // ===========================================================================
  // 2. ELIGIBLE INVENTORY ISSUES (FOR YARN ALLOCATION)
  // ===========================================================================

  async getEligibleIssues(query?: { count?: string; lotId?: string; partyId?: string; search?: string }) {
    const cacheKey = `production:eligible-issues:${JSON.stringify(query || {})}`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const where: Prisma.TransactionWhereInput = {
          type: TransactionType.ISSUED,
        };

        if (query?.lotId) {
          where.lotId = query.lotId;
        }

        if (query?.partyId) {
          where.partyId = query.partyId;
        }

        if (query?.count) {
          where.yarnCount = { contains: query.count, mode: 'insensitive' };
        }

        if (query?.search) {
          const term = query.search.trim();
          where.OR = [
            { transactionNumber: { contains: term, mode: 'insensitive' } },
            { poNumber: { contains: term, mode: 'insensitive' } },
            { yarnCount: { contains: term, mode: 'insensitive' } },
            { lot: { lotNumber: { contains: term, mode: 'insensitive' } } },
            { party: { name: { contains: term, mode: 'insensitive' } } },
          ];
        }

        const issuedTransactions = await this.prisma.transaction.findMany({
          where,
          include: {
            lot: true,
            party: true,
            allocations: {
              select: { id: true, allocatedKg: true, productionOrderId: true, status: true },
            },
          },
          orderBy: { transactionDate: 'desc' },
        });

        // Calculate unallocated quantity for each issue transaction
        const eligible = issuedTransactions
          .map((tx) => {
            const totalIssuedKg = Number(tx.kilos);
            const totalAllocatedKg = tx.allocations.reduce((sum, a) => sum + Number(a.allocatedKg), 0);
            const unallocatedKg = Math.max(0, totalIssuedKg - totalAllocatedKg);

            return {
              id: tx.id,
              transactionNumber: tx.transactionNumber,
              transactionDate: tx.transactionDate,
              lotId: tx.lotId,
              lotNumber: tx.lot?.lotNumber || '—',
              yarnCount: tx.yarnCount || tx.lot?.yarnCount || '—',
              partyId: tx.partyId,
              partyName: tx.party?.name || '—',
              poNumber: tx.poNumber || null,
              purpose: tx.purpose || 'GENERAL',
              issuedBags: tx.bags,
              totalIssuedKg: Number(totalIssuedKg.toFixed(4)),
              totalAllocatedKg: Number(totalAllocatedKg.toFixed(4)),
              unallocatedKg: Number(unallocatedKg.toFixed(4)),
              allocationsCount: tx.allocations.length,
            };
          })
          .filter((item) => item.unallocatedKg > 0.0001);

        return eligible;
      },
      20,
    );
  }

  // ===========================================================================
  // 3. PRODUCTION ORDERS / WORK ORDERS
  // ===========================================================================

  async getOrders(filterDto: ProductionFilterDto) {
    const cacheKey = `production:orders:${JSON.stringify(filterDto)}`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const page = filterDto.page || 1;
        const limit = filterDto.limit || 20;
        const skip = (page - 1) * limit;

        const where: Prisma.ProductionOrderWhereInput = {};

        if (filterDto.status) {
          where.status = filterDto.status;
        }

        if (filterDto.productionTeamId) {
          where.productionTeamId = filterDto.productionTeamId;
        }

        if (filterDto.partyId) {
          where.partyId = filterDto.partyId;
        }

        if (filterDto.poNumber) {
          where.poNumber = { contains: filterDto.poNumber.trim(), mode: 'insensitive' };
        }

        if (filterDto.startDate || filterDto.endDate) {
          where.createdAt = {};
          if (filterDto.startDate) {
            where.createdAt.gte = new Date(filterDto.startDate);
          }
          if (filterDto.endDate) {
            where.createdAt.lte = new Date(filterDto.endDate);
          }
        }

        if (filterDto.search) {
          const term = filterDto.search.trim();
          where.OR = [
            { orderNumber: { contains: term, mode: 'insensitive' } },
            { productName: { contains: term, mode: 'insensitive' } },
            { poNumber: { contains: term, mode: 'insensitive' } },
            { purpose: { contains: term, mode: 'insensitive' } },
            { party: { name: { contains: term, mode: 'insensitive' } } },
            { productionTeam: { name: { contains: term, mode: 'insensitive' } } },
            {
              allocations: {
                some: {
                  OR: [
                    { yarnCount: { contains: term, mode: 'insensitive' } },
                    { lot: { lotNumber: { contains: term, mode: 'insensitive' } } },
                  ],
                },
              },
            },
          ];
        }

        const [total, orders] = await Promise.all([
          this.prisma.productionOrder.count({ where }),
          this.prisma.productionOrder.findMany({
            where,
            skip,
            take: limit,
            include: {
              party: { select: { id: true, name: true, code: true } },
              productionTeam: { select: { id: true, name: true, code: true, department: true } },
              allocations: {
                include: {
                  lot: { select: { id: true, lotNumber: true, yarnCount: true } },
                },
              },
              consumptionRecords: {
                where: { isCorrected: false },
                select: { consumedKg: true, wasteKg: true },
              },
              returns: {
                select: { returnedKg: true, returnedBags: true },
              },
              outputs: {
                select: { id: true, productName: true, outputQuantityKg: true, unit: true, outputDate: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          }),
        ]);

        const formattedOrders = orders.map((order) => {
          const targetQuantity = Number(order.targetQuantity);
          const totalAllocatedKg = order.allocations.reduce((sum, a) => sum + Number(a.allocatedKg), 0);
          const totalConsumedKg = order.consumptionRecords.reduce((sum, c) => sum + Number(c.consumedKg), 0);
          const totalWasteKg = order.consumptionRecords.reduce((sum, c) => sum + Number(c.wasteKg), 0);
          const totalReturnedKg = order.returns.reduce((sum, r) => sum + Number(r.returnedKg), 0);
          const remainingTeamBalanceKg = Math.max(0, totalAllocatedKg - totalConsumedKg - totalWasteKg - totalReturnedKg);
          const totalOutputKg = order.outputs.reduce((sum, o) => sum + Number(o.outputQuantityKg), 0);

          const yieldPercentage = totalConsumedKg > 0 ? Number(((totalOutputKg / totalConsumedKg) * 100).toFixed(2)) : 0;

          return {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            targetQuantity: Number(targetQuantity.toFixed(4)),
            unit: order.unit,
            priority: order.priority,
            purpose: order.purpose,
            productName: order.productName,
            productType: order.productType,
            poNumber: order.poNumber,
            party: order.party,
            productionTeam: order.productionTeam,
            startDate: order.startDate,
            targetDate: order.targetDate,
            completedDate: order.completedDate,
            remarks: order.remarks,
            allocationsCount: order.allocations.length,
            totalAllocatedKg: Number(totalAllocatedKg.toFixed(4)),
            totalConsumedKg: Number(totalConsumedKg.toFixed(4)),
            totalWasteKg: Number(totalWasteKg.toFixed(4)),
            totalReturnedKg: Number(totalReturnedKg.toFixed(4)),
            remainingTeamBalanceKg: Number(remainingTeamBalanceKg.toFixed(4)),
            totalOutputKg: Number(totalOutputKg.toFixed(4)),
            yieldPercentage,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          };
        });

        return {
          data: formattedOrders,
          meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
          },
        };
      },
      20,
    );
  }

  async getOrderById(id: string) {
    const cacheKey = `production:order:${id}`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const order = await this.prisma.productionOrder.findUnique({
          where: { id },
          include: {
            party: true,
            productionTeam: true,
            createdBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            allocations: {
              include: {
                lot: {
                  include: {
                    supplier: true,
                  },
                },
                productionTeam: true,
                inventoryTransaction: true,
                consumptionRecords: {
                  where: { isCorrected: false },
                  select: { consumedKg: true, wasteKg: true },
                },
                returns: {
                  select: { returnedKg: true },
                },
              },
              orderBy: { allocatedDate: 'desc' },
            },
            consumptionRecords: {
              include: {
                lot: true,
                productionTeam: true,
                recordedBy: {
                  select: { id: true, firstName: true, lastName: true, email: true },
                },
              },
              orderBy: { consumptionDate: 'desc' },
            },
            returns: {
              include: {
                lot: true,
                productionTeam: true,
                inventoryTransaction: true,
                recordedBy: {
                  select: { id: true, firstName: true, lastName: true, email: true },
                },
              },
              orderBy: { returnDate: 'desc' },
            },
            outputs: {
              include: {
                recordedBy: {
                  select: { id: true, firstName: true, lastName: true, email: true },
                },
              },
              orderBy: { outputDate: 'desc' },
            },
          },
        });

        if (!order) {
          throw new NotFoundException(`Production Work Order with ID "${id}" not found`);
        }

        // Process itemized allocations with line balance
        const itemizedAllocations = order.allocations.map((alloc) => {
          const allocatedKg = Number(alloc.allocatedKg);
          const consumedKg = alloc.consumptionRecords.reduce((sum, c) => sum + Number(c.consumedKg), 0);
          const wasteKg = alloc.consumptionRecords.reduce((sum, c) => sum + Number(c.wasteKg), 0);
          const returnedKg = alloc.returns.reduce((sum, r) => sum + Number(r.returnedKg), 0);
          const balanceKg = Math.max(0, allocatedKg - consumedKg - wasteKg - returnedKg);

          return {
            id: alloc.id,
            lotId: alloc.lotId,
            lotNumber: alloc.lot.lotNumber,
            yarnCount: alloc.yarnCount || alloc.lot.yarnCount || '—',
            supplierName: alloc.lot.supplier?.name || '—',
            teamId: alloc.productionTeamId,
            teamName: alloc.productionTeam.name,
            inventoryTransactionId: alloc.inventoryTransactionId,
            sourceTxNumber: alloc.inventoryTransaction?.transactionNumber || '—',
            bags: alloc.bags,
            allocatedKg: Number(allocatedKg.toFixed(4)),
            consumedKg: Number(consumedKg.toFixed(4)),
            wasteKg: Number(wasteKg.toFixed(4)),
            returnedKg: Number(returnedKg.toFixed(4)),
            balanceKg: Number(balanceKg.toFixed(4)),
            allocatedDate: alloc.allocatedDate,
            status: alloc.status,
            remarks: alloc.remarks,
          };
        });

        const totalAllocatedKg = itemizedAllocations.reduce((sum, a) => sum + a.allocatedKg, 0);
        const totalConsumedKg = itemizedAllocations.reduce((sum, a) => sum + a.consumedKg, 0);
        const totalWasteKg = itemizedAllocations.reduce((sum, a) => sum + a.wasteKg, 0);
        const totalReturnedKg = itemizedAllocations.reduce((sum, a) => sum + a.returnedKg, 0);
        const remainingTeamBalanceKg = Math.max(0, totalAllocatedKg - totalConsumedKg - totalWasteKg - totalReturnedKg);
        const totalOutputKg = order.outputs.reduce((sum, o) => sum + Number(o.outputQuantityKg), 0);
        const yieldPercentage = totalConsumedKg > 0 ? Number(((totalOutputKg / totalConsumedKg) * 100).toFixed(2)) : 0;

        // Fetch audit logs for this order
        const auditLogs = await this.prisma.auditLog.findMany({
          where: {
            module: 'PRODUCTION',
            entityId: order.id,
          },
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: { timestamp: 'desc' },
          take: 20,
        });

        return {
          ...order,
          targetQuantity: Number(order.targetQuantity),
          itemizedAllocations,
          totalAllocatedKg: Number(totalAllocatedKg.toFixed(4)),
          totalConsumedKg: Number(totalConsumedKg.toFixed(4)),
          totalWasteKg: Number(totalWasteKg.toFixed(4)),
          totalReturnedKg: Number(totalReturnedKg.toFixed(4)),
          remainingTeamBalanceKg: Number(remainingTeamBalanceKg.toFixed(4)),
          totalOutputKg: Number(totalOutputKg.toFixed(4)),
          yieldPercentage,
          auditLogs,
        };
      },
      30,
    );
  }

  async createOrder(dto: CreateProductionOrderDto, userId?: string) {
    if (dto.partyId) {
      const party = await this.prisma.party.findUnique({ where: { id: dto.partyId } });
      if (!party) {
        throw new NotFoundException(`Party with ID "${dto.partyId}" not found in Party Master`);
      }
      if (!party.isActive) {
        throw new BadRequestException(`Party "${party.name}" is inactive.`);
      }
    }

    if (dto.productionTeamId) {
      const team = await this.prisma.productionTeam.findUnique({ where: { id: dto.productionTeamId } });
      if (!team) {
        throw new NotFoundException(`Production Team with ID "${dto.productionTeamId}" not found`);
      }
      if (!team.isActive) {
        throw new BadRequestException(`Production Team "${team.name}" is inactive.`);
      }
    }

    return this.executeProductionTx(async (tx) => {
      let orderNumber = dto.orderNumber?.trim();
      if (!orderNumber) {
        orderNumber = await this.generateWorkOrderNumber(tx);
      } else {
        const existing = await tx.productionOrder.findUnique({ where: { orderNumber } });
        if (existing) {
          throw new BadRequestException(`Work Order number "${orderNumber}" already exists`);
        }
      }

      const order = await tx.productionOrder.create({
        data: {
          orderNumber,
          targetQuantity: new Prisma.Decimal(dto.targetQuantity),
          unit: dto.unit?.trim().toUpperCase() || 'KG',
          priority: dto.priority?.trim().toUpperCase() || 'MEDIUM',
          purpose: dto.purpose?.trim() || null,
          productName: dto.productName?.trim() || null,
          productType: dto.productType?.trim() || null,
          poNumber: dto.poNumber?.trim() || null,
          partyId: dto.partyId || null,
          productionTeamId: dto.productionTeamId || null,
          startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
          targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
          status: dto.status || ProductionOrderStatus.PLANNED,
          remarks: dto.remarks?.trim() || null,
          createdById: userId || null,
        },
        include: {
          party: true,
          productionTeam: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'CREATE_WORK_ORDER',
          module: 'PRODUCTION',
          entityType: 'ProductionOrder',
          entityId: order.id,
          newValue: {
            orderNumber: order.orderNumber,
            targetQuantity: dto.targetQuantity,
            status: order.status,
            party: order.party?.name || null,
            team: order.productionTeam?.name || null,
          },
        },
      });

      return order;
    });
  }

  async updateOrder(id: string, dto: UpdateProductionOrderDto, userId?: string) {
    const existing = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: {
        allocations: true,
        consumptionRecords: { where: { isCorrected: false } },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Production Work Order with ID "${id}" not found`);
    }

    // Validate lifecycle status transitions
    if (dto.status && dto.status !== existing.status) {
      const from = existing.status;
      const to = dto.status;

      const allowedTransitions: Record<ProductionOrderStatus, ProductionOrderStatus[]> = {
        [ProductionOrderStatus.DRAFT]: [
          ProductionOrderStatus.PLANNED,
          ProductionOrderStatus.IN_PROGRESS,
          ProductionOrderStatus.CANCELLED,
        ],
        [ProductionOrderStatus.PLANNED]: [
          ProductionOrderStatus.IN_PROGRESS,
          ProductionOrderStatus.ON_HOLD,
          ProductionOrderStatus.CANCELLED,
        ],
        [ProductionOrderStatus.IN_PROGRESS]: [
          ProductionOrderStatus.COMPLETED,
          ProductionOrderStatus.ON_HOLD,
          ProductionOrderStatus.CANCELLED,
        ],
        [ProductionOrderStatus.ON_HOLD]: [
          ProductionOrderStatus.IN_PROGRESS,
          ProductionOrderStatus.CANCELLED,
        ],
        [ProductionOrderStatus.COMPLETED]: [], // Terminal
        [ProductionOrderStatus.CANCELLED]: [], // Terminal
      };

      if (!allowedTransitions[from]?.includes(to)) {
        throw new BadRequestException(
          `Invalid status transition from "${from}" to "${to}". Allowed targets: ${
            allowedTransitions[from]?.join(', ') || 'None (terminal status)'
          }`,
        );
      }

      // If cancelling, ensure that yarn hasn't been consumed or advise return
      if (to === ProductionOrderStatus.CANCELLED && existing.consumptionRecords.length > 0) {
        throw new BadRequestException(
          `Cannot cancel Work Order "${existing.orderNumber}" because yarn consumption has already been recorded. Unused yarn must be returned and corrections recorded first.`,
        );
      }
    }

    return this.executeProductionTx(async (tx) => {
      const order = await tx.productionOrder.update({
        where: { id },
        data: {
          targetQuantity: dto.targetQuantity ? new Prisma.Decimal(dto.targetQuantity) : undefined,
          unit: dto.unit ? dto.unit.trim().toUpperCase() : undefined,
          priority: dto.priority ? dto.priority.trim().toUpperCase() : undefined,
          purpose: dto.purpose !== undefined ? (dto.purpose ? dto.purpose.trim() : null) : undefined,
          productName: dto.productName !== undefined ? (dto.productName ? dto.productName.trim() : null) : undefined,
          productType: dto.productType !== undefined ? (dto.productType ? dto.productType.trim() : null) : undefined,
          poNumber: dto.poNumber !== undefined ? (dto.poNumber ? dto.poNumber.trim() : null) : undefined,
          partyId: dto.partyId !== undefined ? dto.partyId : undefined,
          productionTeamId: dto.productionTeamId !== undefined ? dto.productionTeamId : undefined,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
          status: dto.status !== undefined ? dto.status : undefined,
          completedDate: dto.status === ProductionOrderStatus.COMPLETED ? new Date() : undefined,
          remarks: dto.remarks !== undefined ? (dto.remarks ? dto.remarks.trim() : null) : undefined,
        },
        include: {
          party: true,
          productionTeam: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'UPDATE_WORK_ORDER',
          module: 'PRODUCTION',
          entityType: 'ProductionOrder',
          entityId: order.id,
          oldValue: { status: existing.status, targetQuantity: existing.targetQuantity },
          newValue: { status: order.status, targetQuantity: order.targetQuantity },
        },
      });

      return order;
    });
  }

  // ===========================================================================
  // 4. ALLOCATE ISSUED YARN TO PRODUCTION WORK ORDER & TEAM
  // ===========================================================================

  async allocateYarn(orderId: string, dto: AllocateYarnDto, userId?: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Production Work Order with ID "${orderId}" not found`);
    }

    if (
      order.status === ProductionOrderStatus.COMPLETED ||
      order.status === ProductionOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot allocate yarn to Work Order in "${order.status}" status.`,
      );
    }

    const team = await this.prisma.productionTeam.findUnique({
      where: { id: dto.productionTeamId },
    });

    if (!team) {
      throw new NotFoundException(`Production Team with ID "${dto.productionTeamId}" not found`);
    }

    if (!team.isActive) {
      throw new BadRequestException(`Production Team "${team.name}" is inactive.`);
    }

    const allocDate = dto.allocatedDate ? new Date(dto.allocatedDate) : new Date();
    const allocKg = dto.allocatedKg;

    return this.executeProductionTx(async (tx) => {
      // 1. Verify source ISSUED transaction
      const sourceTx = await tx.transaction.findUnique({
        where: { id: dto.inventoryTransactionId },
        include: {
          lot: true,
          party: true,
          allocations: true,
        },
      });

      if (!sourceTx) {
        throw new NotFoundException(
          `Source inventory transaction with ID "${dto.inventoryTransactionId}" not found`,
        );
      }

      if (sourceTx.type !== TransactionType.ISSUED) {
        throw new BadRequestException(
          `Cannot allocate against transaction "${sourceTx.transactionNumber}" of type "${sourceTx.type}". Allocations must reference an ISSUED transaction.`,
        );
      }

      if (!sourceTx.lotId) {
        throw new BadRequestException(`Source issue transaction "${sourceTx.transactionNumber}" has no associated lot.`);
      }

      // 2. Validate unallocated issued balance
      const totalIssuedKg = Number(sourceTx.kilos);
      const alreadyAllocatedKg = sourceTx.allocations.reduce((sum, a) => sum + Number(a.allocatedKg), 0);
      const unallocatedKg = totalIssuedKg - alreadyAllocatedKg;

      if (allocKg > unallocatedKg + 0.0001) {
        throw new BadRequestException(
          `Allocation quantity (${allocKg.toFixed(2)} KG) exceeds unallocated issued quantity (${unallocatedKg.toFixed(2)} KG) for transaction "${sourceTx.transactionNumber}". Total Issued: ${totalIssuedKg.toFixed(2)} KG, Already Allocated: ${alreadyAllocatedKg.toFixed(2)} KG.`,
        );
      }

      // 3. Create YarnAllocation record
      const allocation = await tx.yarnAllocation.create({
        data: {
          productionOrderId: order.id,
          productionTeamId: team.id,
          lotId: sourceTx.lotId,
          inventoryTransactionId: sourceTx.id,
          yarnCount: sourceTx.yarnCount || sourceTx.lot?.yarnCount || '—',
          bags: dto.bags || 0,
          allocatedKg: new Prisma.Decimal(allocKg),
          issuedKg: new Prisma.Decimal(totalIssuedKg),
          status: YarnAllocationStatus.ALLOCATED,
          allocatedDate: allocDate,
          allocatedById: userId || null,
          remarks: dto.remarks?.trim() || null,
        },
        include: {
          lot: true,
          productionTeam: true,
          productionOrder: true,
        },
      });

      // 4. Update Order status to IN_PROGRESS if DRAFT or PLANNED
      if (order.status === ProductionOrderStatus.DRAFT || order.status === ProductionOrderStatus.PLANNED) {
        await tx.productionOrder.update({
          where: { id: order.id },
          data: {
            status: ProductionOrderStatus.IN_PROGRESS,
            productionTeamId: team.id,
          },
        });
      }

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'ALLOCATE_YARN_TO_PRODUCTION',
          module: 'PRODUCTION',
          entityType: 'YarnAllocation',
          entityId: allocation.id,
          newValue: {
            workOrder: order.orderNumber,
            team: team.name,
            lotNumber: sourceTx.lot?.lotNumber,
            yarnCount: allocation.yarnCount,
            allocatedKg: allocKg,
            sourceTransaction: sourceTx.transactionNumber,
          },
          metadata: {
            orderId: order.id,
            teamId: team.id,
            lotId: sourceTx.lotId,
            txId: sourceTx.id,
          },
        },
      });

      return allocation;
    });
  }

  // ===========================================================================
  // 5. RECORD ACTUAL YARN CONSUMPTION
  // ===========================================================================

  async recordConsumption(orderId: string, dto: RecordConsumptionDto, userId?: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Production Work Order with ID "${orderId}" not found`);
    }

    if (
      order.status === ProductionOrderStatus.COMPLETED ||
      order.status === ProductionOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot record consumption for Work Order in "${order.status}" status.`,
      );
    }

    const consDate = dto.consumptionDate ? new Date(dto.consumptionDate) : new Date();
    const consumedKg = dto.consumedKg;
    const wasteKg = dto.wasteKg || 0;
    const totalSessionKg = consumedKg + wasteKg;

    return this.executeProductionTx(async (tx) => {
      // 1. Verify Allocation
      const allocation = await tx.yarnAllocation.findUnique({
        where: { id: dto.yarnAllocationId },
        include: {
          lot: true,
          productionTeam: true,
          consumptionRecords: {
            where: { isCorrected: false },
          },
          returns: true,
        },
      });

      if (!allocation) {
        throw new NotFoundException(`Yarn Allocation with ID "${dto.yarnAllocationId}" not found`);
      }

      if (allocation.productionOrderId !== order.id) {
        throw new BadRequestException(`Allocation does not belong to Work Order "${order.orderNumber}"`);
      }

      // 2. Validate Available Team Allocation Balance
      const totalAllocatedKg = Number(allocation.allocatedKg);
      const alreadyConsumedKg = allocation.consumptionRecords.reduce(
        (sum, c) => sum + Number(c.consumedKg) + Number(c.wasteKg),
        0,
      );
      const alreadyReturnedKg = allocation.returns.reduce((sum, r) => sum + Number(r.returnedKg), 0);
      const availableToConsumeKg = totalAllocatedKg - alreadyConsumedKg - alreadyReturnedKg;

      if (totalSessionKg > availableToConsumeKg + 0.0001) {
        throw new BadRequestException(
          `Requested consumption (${totalSessionKg.toFixed(2)} KG = ${consumedKg.toFixed(2)} KG consumed + ${wasteKg.toFixed(2)} KG waste) exceeds available team allocation balance (${availableToConsumeKg.toFixed(2)} KG) for Lot "${allocation.lot.lotNumber}", Count "${allocation.yarnCount}". Total Allocated: ${totalAllocatedKg.toFixed(2)} KG, Already Consumed: ${alreadyConsumedKg.toFixed(2)} KG, Already Returned: ${alreadyReturnedKg.toFixed(2)} KG.`,
        );
      }

      // 3. Create ConsumptionRecord
      const consumption = await tx.consumptionRecord.create({
        data: {
          productionOrderId: order.id,
          productionTeamId: allocation.productionTeamId,
          lotId: allocation.lotId,
          yarnAllocationId: allocation.id,
          yarnCount: allocation.yarnCount || allocation.lot.yarnCount || '—',
          consumedKg: new Prisma.Decimal(consumedKg),
          wasteKg: new Prisma.Decimal(wasteKg),
          wasteCategory: dto.wasteCategory?.trim().toUpperCase() || null,
          bags: dto.bags || 0,
          netProducedKg: dto.netProducedKg ? new Prisma.Decimal(dto.netProducedKg) : null,
          purpose: dto.purpose?.trim() || null,
          consumptionDate: consDate,
          recordedById: userId || null,
          remarks: dto.remarks?.trim() || null,
        },
        include: {
          lot: true,
          productionTeam: true,
          productionOrder: true,
        },
      });

      // 4. Update Order status to IN_PROGRESS if PLANNED
      if (order.status === ProductionOrderStatus.PLANNED) {
        await tx.productionOrder.update({
          where: { id: order.id },
          data: { status: ProductionOrderStatus.IN_PROGRESS },
        });
      }

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'RECORD_YARN_CONSUMPTION',
          module: 'PRODUCTION',
          entityType: 'ConsumptionRecord',
          entityId: consumption.id,
          newValue: {
            workOrder: order.orderNumber,
            team: allocation.productionTeam.name,
            lotNumber: allocation.lot.lotNumber,
            yarnCount: allocation.yarnCount,
            consumedKg,
            wasteKg,
            wasteCategory: dto.wasteCategory || 'NONE',
            remainingAllocationBalanceKg: Number((availableToConsumeKg - totalSessionKg).toFixed(4)),
          },
          metadata: {
            orderId: order.id,
            allocationId: allocation.id,
            lotId: allocation.lotId,
            teamId: allocation.productionTeamId,
          },
        },
      });

      return consumption;
    });
  }

  // ===========================================================================
  // 6. CONSUMPTION RECORD CORRECTION
  // ===========================================================================

  async correctConsumption(consumptionId: string, dto: CorrectConsumptionDto, userId?: string) {
    const originalRecord = await this.prisma.consumptionRecord.findUnique({
      where: { id: consumptionId },
      include: {
        productionOrder: true,
        productionTeam: true,
        lot: true,
        yarnAllocation: {
          include: {
            consumptionRecords: { where: { isCorrected: false } },
            returns: true,
          },
        },
      },
    });

    if (!originalRecord) {
      throw new NotFoundException(`Consumption record with ID "${consumptionId}" not found`);
    }

    if (originalRecord.isCorrected) {
      throw new BadRequestException(`Consumption record is already marked as corrected.`);
    }

    return this.executeProductionTx(async (tx) => {
      // 1. Calculate projected allocation balance with corrected values
      if (originalRecord.yarnAllocation) {
        const alloc = originalRecord.yarnAllocation;
        const totalAllocatedKg = Number(alloc.allocatedKg);
        const otherConsumedKg = alloc.consumptionRecords
          .filter((c) => c.id !== originalRecord.id)
          .reduce((sum, c) => sum + Number(c.consumedKg) + Number(c.wasteKg), 0);
        const returnedKg = alloc.returns.reduce((sum, r) => sum + Number(r.returnedKg), 0);

        const newSessionKg = dto.newConsumedKg + (dto.newWasteKg || 0);
        const projectedTotalUsed = otherConsumedKg + returnedKg + newSessionKg;

        if (projectedTotalUsed > totalAllocatedKg + 0.0001) {
          throw new BadRequestException(
            `Correction rejected: New consumption values would exceed allocated yarn balance (${totalAllocatedKg.toFixed(2)} KG). Total required: ${projectedTotalUsed.toFixed(2)} KG.`,
          );
        }
      }

      // 2. Mark original record as corrected
      await tx.consumptionRecord.update({
        where: { id: originalRecord.id },
        data: {
          isCorrected: true,
          correctionReason: dto.reason.trim(),
          correctedById: userId || null,
        },
      });

      // 3. Create new replacement/correction record
      const correctionRecord = await tx.consumptionRecord.create({
        data: {
          productionOrderId: originalRecord.productionOrderId,
          productionTeamId: originalRecord.productionTeamId,
          lotId: originalRecord.lotId,
          yarnAllocationId: originalRecord.yarnAllocationId,
          yarnCount: originalRecord.yarnCount,
          consumedKg: new Prisma.Decimal(dto.newConsumedKg),
          wasteKg: new Prisma.Decimal(dto.newWasteKg || 0),
          wasteCategory: originalRecord.wasteCategory,
          bags: dto.newBags || 0,
          netProducedKg: originalRecord.netProducedKg,
          purpose: originalRecord.purpose,
          consumptionDate: originalRecord.consumptionDate,
          recordedById: userId || null,
          originalConsumptionId: originalRecord.id,
          remarks: `Corrected record: ${dto.reason.trim()} ${dto.remarks ? `— ${dto.remarks.trim()}` : ''}`,
        },
        include: {
          lot: true,
          productionTeam: true,
          productionOrder: true,
        },
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'CORRECT_CONSUMPTION_RECORD',
          module: 'PRODUCTION',
          entityType: 'ConsumptionRecord',
          entityId: originalRecord.id,
          oldValue: {
            consumedKg: originalRecord.consumedKg,
            wasteKg: originalRecord.wasteKg,
            bags: originalRecord.bags,
          },
          newValue: {
            newConsumedKg: dto.newConsumedKg,
            newWasteKg: dto.newWasteKg || 0,
            newBags: dto.newBags || 0,
            correctionReason: dto.reason,
            replacementId: correctionRecord.id,
          },
        },
      });

      return correctionRecord;
    });
  }

  // ===========================================================================
  // 7. RECORD RETURN OF UNUSED YARN TO MAIN STOCK (SYNCHRONIZED WITH INVENTORY)
  // ===========================================================================

  async recordReturn(orderId: string, dto: RecordProductionReturnDto, userId?: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Production Work Order with ID "${orderId}" not found`);
    }

    const retDate = dto.returnDate ? new Date(dto.returnDate) : new Date();
    const retKg = dto.returnedKg;
    const retBags = dto.returnedBags || 0;

    return this.executeProductionTx(async (tx) => {
      const defaultLoc = await this.getOrCreateDefaultLocation(tx);

      // 1. Verify Allocation
      const allocation = await tx.yarnAllocation.findUnique({
        where: { id: dto.yarnAllocationId },
        include: {
          lot: true,
          productionTeam: true,
          inventoryTransaction: true,
          consumptionRecords: { where: { isCorrected: false } },
          returns: true,
        },
      });

      if (!allocation) {
        throw new NotFoundException(`Yarn Allocation with ID "${dto.yarnAllocationId}" not found`);
      }

      if (allocation.productionOrderId !== order.id) {
        throw new BadRequestException(`Allocation does not belong to Work Order "${order.orderNumber}"`);
      }

      // 2. Validate unconsumed team balance
      const totalAllocatedKg = Number(allocation.allocatedKg);
      const totalConsumedKg = allocation.consumptionRecords.reduce(
        (sum, c) => sum + Number(c.consumedKg) + Number(c.wasteKg),
        0,
      );
      const alreadyReturnedKg = allocation.returns.reduce((sum, r) => sum + Number(r.returnedKg), 0);
      const unconsumedBalanceKg = totalAllocatedKg - totalConsumedKg - alreadyReturnedKg;

      if (retKg > unconsumedBalanceKg + 0.0001) {
        throw new BadRequestException(
          `Return quantity (${retKg.toFixed(2)} KG) exceeds available unconsumed team balance (${unconsumedBalanceKg.toFixed(2)} KG) for Lot "${allocation.lot.lotNumber}". Total Allocated: ${totalAllocatedKg.toFixed(2)} KG, Consumed: ${totalConsumedKg.toFixed(2)} KG, Already Returned: ${alreadyReturnedKg.toFixed(2)} KG.`,
        );
      }

      // 3. Increment Main Stock in Lot Master
      const lot = await tx.lot.findUnique({ where: { id: allocation.lotId } });
      if (!lot) {
        throw new NotFoundException(`Lot with ID "${allocation.lotId}" not found`);
      }

      const retDecimal = new Prisma.Decimal(retKg);
      const updatedLot = await tx.lot.update({
        where: { id: lot.id },
        data: {
          currentWeightKg: Prisma.Decimal.add(lot.currentWeightKg, retDecimal),
          currentBags: lot.currentBags + retBags,
          status: LotStatus.APPROVED,
        },
      });

      // 4. Update StockBalance in Main Warehouse
      await tx.stockBalance.upsert({
        where: {
          lotId_locationId: {
            lotId: lot.id,
            locationId: defaultLoc.id,
          },
        },
        update: {
          quantityKg: updatedLot.currentWeightKg,
          bagsCount: updatedLot.currentBags,
        },
        create: {
          lotId: lot.id,
          locationId: defaultLoc.id,
          quantityKg: updatedLot.currentWeightKg,
          bagsCount: updatedLot.currentBags,
        },
      });

      // 5. Create Inventory RETURN Transaction (Synchronized)
      const origTx = allocation.inventoryTransaction;
      const invReturnTx = await tx.transaction.create({
        data: {
          transactionNumber: this.generateTxNumber('RET'),
          type: TransactionType.RETURN,
          transactionDate: retDate,
          yarnCount: allocation.yarnCount || lot.yarnCount || '—',
          partyId: origTx?.partyId || null,
          lotId: lot.id,
          bags: retBags,
          kilos: retDecimal,
          poNumber: origTx?.poNumber || order.poNumber || null,
          poRequirementId: origTx?.poRequirementId || null,
          purpose: origTx?.purpose || 'FLOOR_SURPLUS_RETURN',
          referenceTransactionId: origTx?.id || null,
          notes: `Floor return from ${allocation.productionTeam.name} on ${order.orderNumber}. Reason: ${dto.reason || 'Surplus unused yarn'}. ${dto.remarks || ''}`.trim(),
          createdById: userId || null,
        },
      });

      // If tied to a PO requirement, decrement requirement issuedKg
      if (origTx?.poRequirementId) {
        const poReq = await tx.pORequirement.findUnique({ where: { id: origTx.poRequirementId } });
        if (poReq) {
          const newIssued = Prisma.Decimal.sub(poReq.issuedKg, retDecimal);
          await tx.pORequirement.update({
            where: { id: poReq.id },
            data: {
              issuedKg: newIssued.isNegative() ? new Prisma.Decimal(0) : newIssued,
            },
          });
        }
      }

      // 6. Create ProductionReturn record
      const prodReturn = await tx.productionReturn.create({
        data: {
          productionOrderId: order.id,
          productionTeamId: allocation.productionTeamId,
          lotId: allocation.lotId,
          yarnAllocationId: allocation.id,
          inventoryTransactionId: invReturnTx.id,
          yarnCount: allocation.yarnCount || lot.yarnCount || '—',
          returnedKg: retDecimal,
          returnedBags: retBags,
          returnDate: retDate,
          reason: dto.reason?.trim() || null,
          remarks: dto.remarks?.trim() || null,
          recordedById: userId || null,
        },
        include: {
          lot: true,
          productionTeam: true,
          productionOrder: true,
          inventoryTransaction: true,
        },
      });

      // 7. Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'RETURN_YARN_FROM_PRODUCTION',
          module: 'PRODUCTION',
          entityType: 'ProductionReturn',
          entityId: prodReturn.id,
          newValue: {
            workOrder: order.orderNumber,
            team: allocation.productionTeam.name,
            lotNumber: lot.lotNumber,
            returnedKg: retKg,
            returnedBags: retBags,
            inventoryTransactionNumber: invReturnTx.transactionNumber,
            mainStockNewBalanceKg: Number(updatedLot.currentWeightKg.toFixed(4)),
            teamRemainingBalanceKg: Number((unconsumedBalanceKg - retKg).toFixed(4)),
          },
          metadata: {
            orderId: order.id,
            allocationId: allocation.id,
            inventoryTxId: invReturnTx.id,
          },
        },
      });

      return {
        productionReturn: prodReturn,
        inventoryTransaction: invReturnTx,
        lotStock: {
          lotNumber: updatedLot.lotNumber,
          currentWeightKg: Number(updatedLot.currentWeightKg.toFixed(4)),
          currentBags: updatedLot.currentBags,
        },
      };
    });
  }

  // ===========================================================================
  // 8. RECORD PRODUCTION OUTPUT & YIELD
  // ===========================================================================

  async recordOutput(orderId: string, dto: RecordProductionOutputDto, userId?: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        consumptionRecords: { where: { isCorrected: false } },
        outputs: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Production Work Order with ID "${orderId}" not found`);
    }

    const outDate = dto.outputDate ? new Date(dto.outputDate) : new Date();
    const outputKg = dto.outputQuantityKg;

    return this.executeProductionTx(async (tx) => {
      const output = await tx.productionOutput.create({
        data: {
          productionOrderId: order.id,
          productName: dto.productName.trim(),
          productCode: dto.productCode?.trim() || null,
          outputQuantityKg: new Prisma.Decimal(outputKg),
          unit: dto.unit?.trim().toUpperCase() || 'KG',
          outputDate: outDate,
          remarks: dto.remarks?.trim() || null,
          recordedById: userId || null,
        },
        include: {
          productionOrder: true,
        },
      });

      // Calculate total consumption and cumulative yield
      const totalConsumedKg = order.consumptionRecords.reduce((sum, c) => sum + Number(c.consumedKg), 0);
      const totalOutputKg = order.outputs.reduce((sum, o) => sum + Number(o.outputQuantityKg), 0) + outputKg;
      const yieldPercentage = totalConsumedKg > 0 ? Number(((totalOutputKg / totalConsumedKg) * 100).toFixed(2)) : 0;

      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'RECORD_PRODUCTION_OUTPUT',
          module: 'PRODUCTION',
          entityType: 'ProductionOutput',
          entityId: output.id,
          newValue: {
            workOrder: order.orderNumber,
            productName: dto.productName,
            outputKg,
            totalOutputKg: Number(totalOutputKg.toFixed(4)),
            totalConsumedKg: Number(totalConsumedKg.toFixed(4)),
            yieldPercentage,
          },
          metadata: {
            orderId: order.id,
          },
        },
      });

      return {
        output,
        productionYield: {
          totalConsumedKg: Number(totalConsumedKg.toFixed(4)),
          totalOutputKg: Number(totalOutputKg.toFixed(4)),
          yieldPercentage,
          varianceNotice: yieldPercentage < 85 || yieldPercentage > 105 ? 'High yield variance detected for review' : 'Normal yield',
        },
      };
    });
  }

  // ===========================================================================
  // 9. COMPLETE / CANCEL WORK ORDER
  // ===========================================================================

  async completeOrder(orderId: string, userId?: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        allocations: {
          include: {
            consumptionRecords: { where: { isCorrected: false } },
            returns: true,
          },
        },
        outputs: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Production Work Order with ID "${orderId}" not found`);
    }

    if (order.status === ProductionOrderStatus.COMPLETED) {
      throw new BadRequestException(`Work Order "${order.orderNumber}" is already completed.`);
    }

    if (order.status === ProductionOrderStatus.CANCELLED) {
      throw new BadRequestException(`Cannot complete a cancelled Work Order.`);
    }

    // Check if unconsumed yarn is still allocated
    let totalUnconsumedKg = 0;
    for (const alloc of order.allocations) {
      const allocKg = Number(alloc.allocatedKg);
      const consumedKg = alloc.consumptionRecords.reduce((sum, c) => sum + Number(c.consumedKg) + Number(c.wasteKg), 0);
      const returnedKg = alloc.returns.reduce((sum, r) => sum + Number(r.returnedKg), 0);
      totalUnconsumedKg += Math.max(0, allocKg - consumedKg - returnedKg);
    }

    const updated = await this.prisma.productionOrder.update({
      where: { id: order.id },
      data: {
        status: ProductionOrderStatus.COMPLETED,
        completedDate: new Date(),
      },
      include: {
        party: true,
        productionTeam: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'COMPLETE_WORK_ORDER',
        module: 'PRODUCTION',
        entityType: 'ProductionOrder',
        entityId: order.id,
        newValue: {
          orderNumber: order.orderNumber,
          status: ProductionOrderStatus.COMPLETED,
          completedDate: updated.completedDate,
          unconsumedTeamBalanceKg: Number(totalUnconsumedKg.toFixed(4)),
        },
      },
    });

    return {
      order: updated,
      unconsumedWarning: totalUnconsumedKg > 0.0001 ? `${totalUnconsumedKg.toFixed(2)} KG unconsumed yarn remains allocated to team. Please record floor return to sync Main Stock.` : null,
    };
  }

  async cancelOrder(orderId: string, reason?: string, userId?: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        consumptionRecords: { where: { isCorrected: false } },
        allocations: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Production Work Order with ID "${orderId}" not found`);
    }

    if (order.status === ProductionOrderStatus.COMPLETED) {
      throw new BadRequestException(`Cannot cancel a COMPLETED Work Order.`);
    }

    if (order.status === ProductionOrderStatus.CANCELLED) {
      throw new BadRequestException(`Work Order is already CANCELLED.`);
    }

    if (order.consumptionRecords.length > 0) {
      throw new BadRequestException(
        `Cannot cancel Work Order "${order.orderNumber}" because actual yarn consumption has already been recorded. Unused yarn must be returned and consumption reversed before cancellation.`,
      );
    }

    const updated = await this.prisma.productionOrder.update({
      where: { id: order.id },
      data: {
        status: ProductionOrderStatus.CANCELLED,
        remarks: reason ? `Cancelled: ${reason.trim()} ${order.remarks ? `| ${order.remarks}` : ''}` : order.remarks,
      },
      include: {
        party: true,
        productionTeam: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'CANCEL_WORK_ORDER',
        module: 'PRODUCTION',
        entityType: 'ProductionOrder',
        entityId: order.id,
        newValue: {
          orderNumber: order.orderNumber,
          status: ProductionOrderStatus.CANCELLED,
          cancellationReason: reason || null,
        },
      },
    });

    return updated;
  }

  // ===========================================================================
  // 10. PRODUCTION OVERVIEW & KPI SUMMARY
  // ===========================================================================

  async getProductionSummary() {
    return this.cacheService.getOrSet(
      'production:summary',
      async () => {
        const [
          activeOrdersCount,
          activeTeamsCount,
          allocationsAgg,
          consumptionAgg,
          returnsAgg,
          outputsAgg,
        ] = await Promise.all([
          this.prisma.productionOrder.count({
            where: {
              status: { in: [ProductionOrderStatus.PLANNED, ProductionOrderStatus.IN_PROGRESS] },
            },
          }),
          this.prisma.productionTeam.count({
            where: { isActive: true },
          }),
          this.prisma.yarnAllocation.aggregate({
            _sum: { allocatedKg: true, bags: true },
          }),
          this.prisma.consumptionRecord.aggregate({
            where: { isCorrected: false },
            _sum: { consumedKg: true, wasteKg: true, bags: true },
          }),
          this.prisma.productionReturn.aggregate({
            _sum: { returnedKg: true, returnedBags: true },
          }),
          this.prisma.productionOutput.aggregate({
            _sum: { outputQuantityKg: true },
          }),
        ]);

        const totalAllocatedKg = Number(allocationsAgg._sum.allocatedKg || 0);
        const totalAllocatedBags = allocationsAgg._sum.bags || 0;

        const totalConsumedKg = Number(consumptionAgg._sum.consumedKg || 0);
        const totalWasteKg = Number(consumptionAgg._sum.wasteKg || 0);
        const totalConsumedBags = consumptionAgg._sum.bags || 0;

        const totalReturnedKg = Number(returnsAgg._sum.returnedKg || 0);
        const totalReturnedBags = returnsAgg._sum.returnedBags || 0;

        const currentTeamStockKg = Math.max(0, totalAllocatedKg - totalConsumedKg - totalWasteKg - totalReturnedKg);
        const currentTeamStockBags = Math.max(0, totalAllocatedBags - totalConsumedBags - totalReturnedBags);

        const totalOutputKg = Number(outputsAgg._sum.outputQuantityKg || 0);
        const averageYieldPercentage = totalConsumedKg > 0 ? Number(((totalOutputKg / totalConsumedKg) * 100).toFixed(2)) : 0;

        return {
          activeOrdersCount,
          activeTeamsCount,
          totalAllocatedKg: Number(totalAllocatedKg.toFixed(4)),
          totalAllocatedBags,
          totalConsumedKg: Number(totalConsumedKg.toFixed(4)),
          totalWasteKg: Number(totalWasteKg.toFixed(4)),
          totalConsumedBags,
          totalReturnedKg: Number(totalReturnedKg.toFixed(4)),
          totalReturnedBags,
          currentTeamStockKg: Number(currentTeamStockKg.toFixed(4)),
          currentTeamStockBags,
          totalOutputKg: Number(totalOutputKg.toFixed(4)),
          averageYieldPercentage,
        };
      },
      30,
    );
  }

  // ===========================================================================
  // 11. WORK ORDER TRACEABILITY CHAIN
  // ===========================================================================

  async getOrderTraceability(orderId: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        party: true,
        productionTeam: true,
        allocations: {
          include: {
            lot: {
              include: {
                supplier: true,
                transactions: {
                  where: { type: { in: [TransactionType.OPENING, TransactionType.RECEIVED] } },
                  take: 1,
                  orderBy: { transactionDate: 'asc' },
                },
              },
            },
            inventoryTransaction: true,
          },
        },
        consumptionRecords: {
          where: { isCorrected: false },
          include: { lot: true, productionTeam: true },
        },
        returns: {
          include: { lot: true, inventoryTransaction: true },
        },
        outputs: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Production Work Order with ID "${orderId}" not found`);
    }

    const sourceLots = Array.from(
      new Map(
        order.allocations.map((a) => [
          a.lot.id,
          {
            lotId: a.lot.id,
            lotNumber: a.lot.lotNumber,
            yarnCount: a.yarnCount || a.lot.yarnCount,
            supplier: a.lot.supplier?.name || '—',
            receivedDate: a.lot.receivedDate,
            initialWeightKg: Number(a.lot.initialWeightKg),
            currentMainStockKg: Number(a.lot.currentWeightKg),
            receiptTransactionNumber: a.lot.transactions[0]?.transactionNumber || '—',
          },
        ]),
      ).values(),
    );

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      customerParty: order.party ? { id: order.party.id, name: order.party.name, code: order.party.code } : null,
      poNumber: order.poNumber,
      productionTeam: order.productionTeam ? { id: order.productionTeam.id, name: order.productionTeam.name, department: order.productionTeam.department } : null,
      sourceLots,
      allocations: order.allocations.map((a) => ({
        id: a.id,
        lotNumber: a.lot.lotNumber,
        yarnCount: a.yarnCount,
        allocatedKg: Number(a.allocatedKg),
        allocatedDate: a.allocatedDate,
        sourceIssueTx: a.inventoryTransaction?.transactionNumber || '—',
      })),
      consumption: order.consumptionRecords.map((c) => ({
        id: c.id,
        lotNumber: c.lot.lotNumber,
        yarnCount: c.yarnCount,
        consumedKg: Number(c.consumedKg),
        wasteKg: Number(c.wasteKg),
        wasteCategory: c.wasteCategory,
        consumptionDate: c.consumptionDate,
      })),
      returns: order.returns.map((r) => ({
        id: r.id,
        lotNumber: r.lot.lotNumber,
        returnedKg: Number(r.returnedKg),
        returnDate: r.returnDate,
        inventoryReturnTx: r.inventoryTransaction?.transactionNumber || '—',
      })),
      outputs: order.outputs.map((o) => ({
        id: o.id,
        productName: o.productName,
        productCode: o.productCode,
        outputQuantityKg: Number(o.outputQuantityKg),
        unit: o.unit,
        outputDate: o.outputDate,
      })),
    };
  }
}
