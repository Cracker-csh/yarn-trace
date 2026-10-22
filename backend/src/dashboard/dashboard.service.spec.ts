/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AppCacheService } from '../common/cache/app-cache.service';
import { TransactionType, LotStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

describe('DashboardService', () => {
  let service: DashboardService;
  let mockPrismaService: any;
  let mockInventoryService: any;

  beforeEach(async () => {
    mockInventoryService = {
      getStockSummary: jest.fn().mockResolvedValue({
        totalWeightKg: 100243.25,
        totalBags: 1301,
        activeLotsCount: 12,
        totalParties: 8,
        totalTransactions: 24,
      }),
    };

    mockPrismaService = {
      transaction: {
        aggregate: jest.fn().mockImplementation(({ where }) => {
          if (where?.type === TransactionType.RECEIVED) {
            return Promise.resolve({
              _sum: { kilos: new Prisma.Decimal(25000), bags: 300 },
              _count: { id: 5 },
            });
          }
          if (where?.type === TransactionType.ISSUED) {
            return Promise.resolve({
              _sum: { kilos: new Prisma.Decimal(18000), bags: 220 },
              _count: { id: 4 },
            });
          }
          return Promise.resolve({
            _sum: { kilos: new Prisma.Decimal(0), bags: 0 },
            _count: { id: 0 },
          });
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tx-1',
            transactionNumber: 'TXN-RCV-1001',
            type: TransactionType.RECEIVED,
            transactionDate: new Date('2026-09-28T03:00:00.000Z'),
            yarnCount: '1/10 KW',
            party: { name: 'Vardhman Textiles Ltd' },
            lot: { lotNumber: 'LOT-2026-001' },
            kilos: new Prisma.Decimal(5000),
            bags: 60,
            createdBy: {
              firstName: 'Admin',
              lastName: 'User',
              email: 'admin@yarntrace.com',
            },
          },
        ]),
      },
      pORequirement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'req-1',
            purchaseOrderId: 'po-1',
            requiredKg: new Prisma.Decimal(10000),
            issuedKg: new Prisma.Decimal(4000), // Pending / Partial (6000 remaining)
            purchaseOrder: {
              id: 'po-1',
              poNumber: 'PO-8801',
              status: 'IN_PRODUCTION',
            },
          },
          {
            id: 'req-2',
            purchaseOrderId: 'po-2',
            requiredKg: new Prisma.Decimal(5000),
            issuedKg: new Prisma.Decimal(5000), // Fully fulfilled
            purchaseOrder: {
              id: 'po-2',
              poNumber: 'PO-8802',
              status: 'FULFILLED',
            },
          },
        ]),
      },
      yarnAllocation: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { allocatedKg: new Prisma.Decimal(0), bags: 0 },
        }),
      },
      consumptionRecord: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { consumedKg: new Prisma.Decimal(0), wasteKg: new Prisma.Decimal(0), bags: 0 },
        }),
      },
      productionReturn: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { returnedKg: new Prisma.Decimal(0), returnedBags: 0 },
        }),
      },
      productionOutput: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { outputQuantityKg: new Prisma.Decimal(0) },
        }),
      },
      lot: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'lot-1',
            lotNumber: 'LOT-2026-001',
            yarnCount: '1/10 KW',
            supplier: {
              id: 'p-1',
              name: 'Vardhman Textiles Ltd',
              code: 'VARDHMAN',
            },
            currentWeightKg: new Prisma.Decimal(5000),
            currentBags: 60,
            status: LotStatus.APPROVED,
            receivedDate: new Date('2026-09-28T02:00:00.000Z'),
            transactions: [
              {
                type: TransactionType.RECEIVED,
                transactionDate: new Date('2026-09-28T03:00:00.000Z'),
                transactionNumber: 'TXN-RCV-1001',
              },
            ],
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        AppCacheService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: InventoryService, useValue: mockInventoryService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should accurately calculate total stock from InventoryService single source of truth', async () => {
    const overview = await service.getOverview();

    expect(overview.totalStockKg).toBe(100243.25);
    expect(overview.totalStockBags).toBe(1301);
    expect(overview.activeLotsCount).toBe(12);
    expect(overview.totalPartiesCount).toBe(8);
  });

  it('should aggregate only RECEIVED transactions for Received KPI', async () => {
    const overview = await service.getOverview();

    expect(mockPrismaService.transaction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: TransactionType.RECEIVED },
      }),
    );
    expect(overview.receivedKg).toBe(25000);
    expect(overview.receivedBags).toBe(300);
    expect(overview.receivedLotsCount).toBe(5);
  });

  it('should aggregate only ISSUED transactions for Issued KPI (excluding SOLD/RETIRED)', async () => {
    const overview = await service.getOverview();

    expect(mockPrismaService.transaction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: TransactionType.ISSUED },
      }),
    );
    expect(overview.issuedKg).toBe(18000);
    expect(overview.issuedBags).toBe(220);
  });

  it('should return 0 for unreleased future production scope metrics', async () => {
    const overview = await service.getOverview();

    expect(overview.productionTeamKg).toBe(0);
    expect(overview.consumedKg).toBe(0);
    expect(overview.finalOutputKg).toBe(0);
  });

  it('should calculate pending PO requirements correctly (issuedKg < requiredKg)', async () => {
    const overview = await service.getOverview();

    expect(overview.pendingPurchaseOrders).toBe(1);
    expect(overview.pendingRequirementsCount).toBe(1);
  });

  it('should return live lot records and recent movements with correct formatting', async () => {
    const overview = await service.getOverview();

    expect(overview.liveLots).toHaveLength(1);
    expect(overview.liveLots[0].lotNumber).toBe('LOT-2026-001');
    expect(overview.liveLots[0].party?.name).toBe('Vardhman Textiles Ltd');
    expect(overview.liveLots[0].lastMovementType).toBe(TransactionType.RECEIVED);

    expect(overview.recentMovements).toHaveLength(1);
    expect(overview.recentMovements[0].transactionNumber).toBe('TXN-RCV-1001');
    expect(overview.recentMovements[0].createdByName).toBe('Admin User');
  });
});
