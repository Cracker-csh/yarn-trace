/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ProductionService } from './production.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../common/cache/app-cache.service';
import { BadRequestException } from '@nestjs/common';
import { ProductionOrderStatus, YarnAllocationStatus, TransactionType } from '@prisma/client';
import { Prisma } from '@prisma/client';

describe('ProductionService End-to-End Logic Tests', () => {
  let service: ProductionService;
  let mockPrismaService: any;

  beforeEach(async () => {
    mockPrismaService = {
      productionTeam: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      productionOrder: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      yarnAllocation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      consumptionRecord: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      productionReturn: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      productionOutput: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      lot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      stockLocation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'loc-1', code: 'MAIN_WH' }),
        create: jest.fn(),
      },
      stockBalance: {
        upsert: jest.fn(),
      },
      pORequirement: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      party: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (cb: (prismaClient: any) => Promise<any>) => cb(mockPrismaService)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionService,
        AppCacheService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ProductionService>(ProductionService);
    jest.clearAllMocks();
  });

  describe('1. Production Teams Master', () => {
    it('should create a production team successfully', async () => {
      mockPrismaService.productionTeam.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.productionTeam.create.mockResolvedValueOnce({
        id: 'team-1',
        code: 'SPIN-A',
        name: 'Spinning Team Alpha',
        department: 'SPINNING',
        teamLead: 'Mahesh Patel',
        isActive: true,
      });

      const team = await service.createTeam({
        code: 'SPIN-A',
        name: 'Spinning Team Alpha',
        department: 'SPINNING',
        teamLead: 'Mahesh Patel',
      });

      expect(team.code).toBe('SPIN-A');
      expect(mockPrismaService.productionTeam.create).toHaveBeenCalled();
      expect(mockPrismaService.auditLog.create).toHaveBeenCalled();
    });

    it('should reject duplicate team code', async () => {
      mockPrismaService.productionTeam.findUnique.mockResolvedValueOnce({ id: 'team-1', code: 'SPIN-A' });

      await expect(
        service.createTeam({ code: 'SPIN-A', name: 'Spinning Team', department: 'SPINNING' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Work Orders Management', () => {
    it('should create a work order with auto-generated WO number', async () => {
      mockPrismaService.productionOrder.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.productionOrder.create.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
        targetQuantity: new Prisma.Decimal(1000),
        status: ProductionOrderStatus.PLANNED,
        unit: 'KG',
      });

      const order = await service.createOrder({
        targetQuantity: 1000,
        purpose: 'WEAVING',
        productName: 'Terry Towel Fabric',
      });

      expect(order.orderNumber).toBe('WO-2026-0001');
      expect(mockPrismaService.productionOrder.create).toHaveBeenCalled();
    });

    it('should reject invalid status transition from COMPLETED', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
        status: ProductionOrderStatus.COMPLETED,
        consumptionRecords: [],
      });

      await expect(
        service.updateOrder('wo-1', { status: ProductionOrderStatus.IN_PROGRESS }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Yarn Allocation & Limit Enforcement', () => {
    it('should allocate issued yarn to work order and production team', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
        status: ProductionOrderStatus.PLANNED,
      });

      mockPrismaService.productionTeam.findUnique.mockResolvedValueOnce({
        id: 'team-1',
        name: 'Spinning Team Alpha',
        isActive: true,
      });

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-issue-1',
        transactionNumber: 'TXN-ISS-001',
        type: TransactionType.ISSUED,
        lotId: 'lot-1',
        yarnCount: '10/1 KW',
        kilos: new Prisma.Decimal(500),
        allocations: [],
        lot: { id: 'lot-1', lotNumber: 'LOT-1014', yarnCount: '10/1 KW' },
      });

      mockPrismaService.yarnAllocation.create.mockResolvedValueOnce({
        id: 'alloc-1',
        productionOrderId: 'wo-1',
        productionTeamId: 'team-1',
        lotId: 'lot-1',
        yarnCount: '10/1 KW',
        allocatedKg: new Prisma.Decimal(300),
        status: YarnAllocationStatus.ALLOCATED,
      });

      const allocation = await service.allocateYarn('wo-1', {
        inventoryTransactionId: 'tx-issue-1',
        productionTeamId: 'team-1',
        allocatedKg: 300,
        bags: 3,
      });

      expect(allocation.allocatedKg.toString()).toBe('300');
      expect(mockPrismaService.yarnAllocation.create).toHaveBeenCalled();
      expect(mockPrismaService.productionOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wo-1' },
          data: expect.objectContaining({ status: ProductionOrderStatus.IN_PROGRESS }),
        }),
      );
    });

    it('should reject allocation greater than unallocated issued quantity', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        status: ProductionOrderStatus.PLANNED,
      });
      mockPrismaService.productionTeam.findUnique.mockResolvedValueOnce({
        id: 'team-1',
        isActive: true,
      });
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-issue-1',
        transactionNumber: 'TXN-ISS-001',
        type: TransactionType.ISSUED,
        lotId: 'lot-1',
        kilos: new Prisma.Decimal(500),
        allocations: [{ allocatedKg: new Prisma.Decimal(300) }], // 200 remaining
      });

      await expect(
        service.allocateYarn('wo-1', {
          inventoryTransactionId: 'tx-issue-1',
          productionTeamId: 'team-1',
          allocatedKg: 250, // Exceeds 200 KG unallocated
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Actual Consumption & Balance Validation', () => {
    it('should record consumption within allocated balance', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
        status: ProductionOrderStatus.IN_PROGRESS,
      });

      mockPrismaService.yarnAllocation.findUnique.mockResolvedValueOnce({
        id: 'alloc-1',
        productionOrderId: 'wo-1',
        productionTeamId: 'team-1',
        lotId: 'lot-1',
        yarnCount: '10/1 KW',
        allocatedKg: new Prisma.Decimal(300),
        consumptionRecords: [],
        returns: [],
        lot: { id: 'lot-1', lotNumber: 'LOT-1014' },
        productionTeam: { id: 'team-1', name: 'Spinning Team Alpha' },
      });

      mockPrismaService.consumptionRecord.create.mockResolvedValueOnce({
        id: 'cons-1',
        consumedKg: new Prisma.Decimal(100),
        wasteKg: new Prisma.Decimal(2),
      });

      const consumption = await service.recordConsumption('wo-1', {
        yarnAllocationId: 'alloc-1',
        consumedKg: 100,
        wasteKg: 2,
        wasteCategory: 'HARD_WASTE',
      });

      expect(consumption.consumedKg.toString()).toBe('100');
      expect(mockPrismaService.consumptionRecord.create).toHaveBeenCalled();
    });

    it('should reject consumption exceeding available team allocation', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
        status: ProductionOrderStatus.IN_PROGRESS,
      });

      mockPrismaService.yarnAllocation.findUnique.mockResolvedValueOnce({
        id: 'alloc-1',
        productionOrderId: 'wo-1',
        productionTeamId: 'team-1',
        lotId: 'lot-1',
        yarnCount: '10/1 KW',
        allocatedKg: new Prisma.Decimal(300),
        consumptionRecords: [{ consumedKg: new Prisma.Decimal(250), wasteKg: new Prisma.Decimal(0) }],
        returns: [],
        lot: { id: 'lot-1', lotNumber: 'LOT-1014' },
        productionTeam: { id: 'team-1', name: 'Spinning Team Alpha' },
      });

      // Available is 50 KG, trying to consume 60 KG
      await expect(
        service.recordConsumption('wo-1', {
          yarnAllocationId: 'alloc-1',
          consumedKg: 60,
          wasteKg: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('5. Unused Yarn Returns Synchronized with Inventory', () => {
    it('should return unused yarn from team and create inventory RETURN transaction', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
      });

      mockPrismaService.yarnAllocation.findUnique.mockResolvedValueOnce({
        id: 'alloc-1',
        productionOrderId: 'wo-1',
        productionTeamId: 'team-1',
        lotId: 'lot-1',
        yarnCount: '10/1 KW',
        allocatedKg: new Prisma.Decimal(300),
        consumptionRecords: [{ consumedKg: new Prisma.Decimal(100), wasteKg: new Prisma.Decimal(0) }],
        returns: [],
        lot: { id: 'lot-1', lotNumber: 'LOT-1014' },
        productionTeam: { id: 'team-1', name: 'Spinning Team Alpha' },
        inventoryTransaction: { id: 'tx-issue-1', partyId: 'p-1', poNumber: 'PO-001', poRequirementId: null },
      });

      mockPrismaService.lot.findUnique.mockResolvedValueOnce({
        id: 'lot-1',
        lotNumber: 'LOT-1014',
        currentWeightKg: new Prisma.Decimal(200),
        currentBags: 2,
      });

      mockPrismaService.lot.update.mockResolvedValueOnce({
        id: 'lot-1',
        lotNumber: 'LOT-1014',
        currentWeightKg: new Prisma.Decimal(250), // 200 + 50
        currentBags: 3,
      });

      mockPrismaService.transaction.create.mockResolvedValueOnce({
        id: 'tx-ret-1',
        transactionNumber: 'TXN-RET-123456',
        type: TransactionType.RETURN,
        kilos: new Prisma.Decimal(50),
      });

      mockPrismaService.productionReturn.create.mockResolvedValueOnce({
        id: 'ret-1',
        returnedKg: new Prisma.Decimal(50),
      });

      const result = await service.recordReturn('wo-1', {
        yarnAllocationId: 'alloc-1',
        returnedKg: 50,
        returnedBags: 1,
        reason: 'Surplus yarn return',
      });

      expect(result.lotStock.currentWeightKg).toBe(250);
      expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: TransactionType.RETURN,
            referenceTransactionId: 'tx-issue-1',
          }),
        }),
      );
    });
  });

  describe('6. Production Output & Yield', () => {
    it('should record output and compute batch yield percentage', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
        consumptionRecords: [{ consumedKg: new Prisma.Decimal(100), wasteKg: new Prisma.Decimal(0) }],
        outputs: [],
      });

      mockPrismaService.productionOutput.create.mockResolvedValueOnce({
        id: 'out-1',
        productName: 'Grey Terry Fabric',
        outputQuantityKg: new Prisma.Decimal(96),
        unit: 'KG',
      });

      const result = await service.recordOutput('wo-1', {
        productName: 'Grey Terry Fabric',
        outputQuantityKg: 96,
      });

      expect(result.productionYield.yieldPercentage).toBe(96);
      expect(result.productionYield.totalConsumedKg).toBe(100);
      expect(result.productionYield.totalOutputKg).toBe(96);
    });
  });

  describe('7. Work Order Completion & Cancellation Lifecycle', () => {
    it('should complete work order and calculate final metrics', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
        status: ProductionOrderStatus.IN_PROGRESS,
        allocations: [],
        consumptionRecords: [{ consumedKg: new Prisma.Decimal(100), wasteKg: new Prisma.Decimal(0) }],
        outputs: [{ outputQuantityKg: new Prisma.Decimal(96) }],
      });

      mockPrismaService.productionOrder.update.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
        status: ProductionOrderStatus.COMPLETED,
        completedAt: new Date(),
      });

      const result = await service.completeOrder('wo-1');
      expect(result.order.status).toBe(ProductionOrderStatus.COMPLETED);
      expect(mockPrismaService.auditLog.create).toHaveBeenCalled();
    });

    it('should reject cancelling a work order with active consumption', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        status: ProductionOrderStatus.IN_PROGRESS,
        consumptionRecords: [{ consumedKg: new Prisma.Decimal(50) }],
      });

      await expect(service.cancelOrder('wo-1')).rejects.toThrow(BadRequestException);
    });

    it('should cancel an order with zero consumption', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
        status: ProductionOrderStatus.PLANNED,
        consumptionRecords: [],
      });

      mockPrismaService.productionOrder.update.mockResolvedValueOnce({
        id: 'wo-1',
        status: ProductionOrderStatus.CANCELLED,
      });

      const result = await service.cancelOrder('wo-1');
      expect(result.status).toBe(ProductionOrderStatus.CANCELLED);
    });
  });

  describe('8. Consumption Correction with Audit Preservation', () => {
    it('should correct consumption, record previous value and reason without deleting history', async () => {
      mockPrismaService.consumptionRecord.findUnique.mockResolvedValueOnce({
        id: 'cons-1',
        productionOrderId: 'wo-1',
        yarnAllocationId: 'alloc-1',
        consumedKg: new Prisma.Decimal(100),
        wasteKg: new Prisma.Decimal(2),
        remarks: 'Initial shift consumption',
        productionOrder: { id: 'wo-1', status: ProductionOrderStatus.IN_PROGRESS },
        yarnAllocation: {
          id: 'alloc-1',
          allocatedKg: new Prisma.Decimal(300),
          consumptionRecords: [{ id: 'cons-1', consumedKg: new Prisma.Decimal(100), wasteKg: new Prisma.Decimal(2) }],
          returns: [],
        },
      });

      mockPrismaService.consumptionRecord.create.mockResolvedValueOnce({
        id: 'cons-correction-1',
        consumedKg: new Prisma.Decimal(90),
        wasteKg: new Prisma.Decimal(1),
        remarks: 'Correction of record cons-1: Adjusted after scale recalibration',
      });

      mockPrismaService.consumptionRecord.update.mockResolvedValueOnce({
        id: 'cons-1',
        consumedKg: new Prisma.Decimal(90),
        wasteKg: new Prisma.Decimal(1),
        remarks: 'Shift correction: Adjusted after scale recalibration [Old: 100 kg, Waste: 2 kg]',
      });

      const updated = await service.correctConsumption('cons-1', {
        newConsumedKg: 90,
        newWasteKg: 1,
        reason: 'Adjusted after scale recalibration',
      });

      expect(updated.consumedKg.toString()).toBe('90');
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CORRECT_CONSUMPTION_RECORD',
            entityId: 'cons-1',
          }),
        }),
      );
    });
  });

  describe('9. Complete Traceability Chain', () => {
    it('should assemble forward and backward traceability chain for production order', async () => {
      mockPrismaService.productionOrder.findUnique.mockResolvedValueOnce({
        id: 'wo-1',
        orderNumber: 'WO-2026-0001',
        status: ProductionOrderStatus.IN_PROGRESS,
        party: { id: 'p-1', name: 'Vardhman Textiles', code: 'VARD' },
        productionTeam: { id: 'team-1', name: 'Spinning Team Alpha', department: 'SPINNING' },
        allocations: [
          {
            id: 'alloc-1',
            yarnCount: '10/1 KW',
            allocatedKg: new Prisma.Decimal(300),
            allocatedDate: new Date(),
            lot: {
              id: 'lot-1',
              lotNumber: 'LOT-1014',
              yarnCount: '10/1 KW',
              supplier: 'Vardhman',
              receivedDate: new Date(),
              initialWeightKg: new Prisma.Decimal(1000),
              currentWeightKg: new Prisma.Decimal(700),
              transactions: [{ transactionNumber: 'TXN-REC-001' }],
            },
            inventoryTransaction: { id: 'tx-1', transactionNumber: 'TXN-ISS-001' },
          },
        ],
        consumptionRecords: [
          {
            id: 'cons-1',
            yarnCount: '10/1 KW',
            consumedKg: new Prisma.Decimal(100),
            wasteKg: new Prisma.Decimal(2),
            wasteCategory: 'HARD_WASTE',
            consumptionDate: new Date(),
            lot: { id: 'lot-1', lotNumber: 'LOT-1014' },
          },
        ],
        returns: [
          {
            id: 'ret-1',
            returnedKg: new Prisma.Decimal(50),
            returnDate: new Date(),
            lot: { id: 'lot-1', lotNumber: 'LOT-1014' },
            inventoryTransaction: { id: 'tx-ret-1', transactionNumber: 'TXN-RET-001' },
          },
        ],
        outputs: [
          {
            id: 'out-1',
            productName: 'Grey Terry Fabric',
            productCode: 'FAB-001',
            outputQuantityKg: new Prisma.Decimal(96),
            unit: 'KG',
            outputDate: new Date(),
          },
        ],
      });

      const trace = await service.getOrderTraceability('wo-1');
      expect(trace.orderNumber).toBe('WO-2026-0001');
      expect(trace.customerParty?.name).toBe('Vardhman Textiles');
      expect(trace.allocations).toHaveLength(1);
      expect(trace.consumption).toHaveLength(1);
      expect(trace.returns).toHaveLength(1);
      expect(trace.outputs).toHaveLength(1);
      expect(trace.sourceLots).toHaveLength(1);
    });
  });
});
