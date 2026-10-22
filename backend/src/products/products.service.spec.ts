/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../common/cache/app-cache.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('ProductsService Unit Tests', () => {
  let service: ProductsService;
  let mockPrisma: any;

  const mockOrder = {
    id: 'order-1',
    orderNumber: 'WO-2026-0001',
    productName: '100% Cotton Bath Towel Fabric',
    productType: 'FABRIC_ROLL',
    status: 'IN_PROGRESS',
    targetQuantity: new Prisma.Decimal(500),
    unit: 'KG',
    purpose: 'Towel Weaving',
    priority: 'HIGH',
    startDate: new Date('2026-10-01'),
    targetDate: new Date('2026-10-15'),
    completedDate: null,
    partyId: 'party-1',
    productionTeamId: 'team-1',
    party: {
      id: 'party-1',
      name: 'Vardhman Textiles Ltd',
      code: 'PTY-VARD',
      type: 'CUSTOMER',
      contactPerson: 'Mr. Rajesh',
      phone: '+91 98765 43210',
      email: 'rajesh@vardhman.com',
      gstNumber: '24AAAAA0000A1Z5',
    },
    productionTeam: {
      id: 'team-1',
      name: 'Weaving Unit A',
      department: 'WEAVING',
      teamLead: 'Suresh Patel',
    },
    consumptionRecords: [
      {
        id: 'c-1',
        lotId: 'lot-1',
        yarnCount: '2/20s Carded',
        consumedKg: new Prisma.Decimal(300),
        wasteKg: new Prisma.Decimal(10),
        wasteCategory: 'SPOOL_END',
        consumptionDate: new Date('2026-10-02'),
        isCorrected: false,
        productionTeam: { name: 'Weaving Unit A' },
        lot: {
          lotNumber: 'LOT-2026-001',
          yarnCount: '2/20s Carded',
          supplier: { name: 'Nahar Spinning Mills' },
        },
      },
      {
        id: 'c-2',
        lotId: 'lot-2',
        yarnCount: '1/10s Combed',
        consumedKg: new Prisma.Decimal(200),
        wasteKg: new Prisma.Decimal(5),
        wasteCategory: 'FLY_WASTE',
        consumptionDate: new Date('2026-10-03'),
        isCorrected: false,
        productionTeam: { name: 'Weaving Unit A' },
        lot: {
          lotNumber: 'LOT-2026-002',
          yarnCount: '1/10s Combed',
          supplier: { name: 'Vardhman Yarns' },
        },
      },
    ],
    outputs: [],
  };

  const mockProduct = {
    id: 'prod-1',
    productCode: 'PROD-2026-0001',
    name: '100% Cotton Bath Towel Fabric',
    category: 'FABRIC_ROLL',
    totalQuantityKg: new Prisma.Decimal(450),
    availableKg: new Prisma.Decimal(450),
    unit: 'KG',
    status: 'READY',
  };

  const mockOutputRecord = {
    id: 'out-1',
    batchNumber: 'OUT-2026-0001',
    productId: 'prod-1',
    productName: '100% Cotton Bath Towel Fabric',
    productCode: 'PROD-2026-0001',
    productType: 'FABRIC_ROLL',
    outputQuantityKg: new Prisma.Decimal(450),
    unit: 'KG',
    status: 'READY',
    outputDate: new Date('2026-10-05'),
    remarks: 'Inspected Grade A fabric roll output',
    createdAt: new Date('2026-10-05T10:00:00Z'),
    updatedAt: new Date('2026-10-05T10:00:00Z'),
    recordedById: 'user-1',
    recordedBy: {
      firstName: 'Bhumit',
      lastName: 'Soni',
      email: 'bhumit@yarntrace.com',
    },
    deliveries: [],
    product: mockProduct,
    productionOrder: mockOrder,
    productionOrderId: 'order-1',
  };

  beforeEach(async () => {
    mockPrisma = {
      productionOutput: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      productionOrder: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        AppCacheService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  describe('findAll', () => {
    it('should calculate genealogy, consumed yarn, and yield accurately', async () => {
      mockPrisma.productionOutput.findMany.mockResolvedValue([mockOutputRecord]);

      const result = await service.findAll({});

      expect(result.outputBatches).toHaveLength(1);
      const batch = result.outputBatches[0];

      expect(batch.batchNumber).toBe('OUT-2026-0001');
      expect(batch.productName).toBe('100% Cotton Bath Towel Fabric');
      expect(batch.outputQuantityKg).toBe(450);
      expect(batch.consumedYarnKg).toBe(500); // 300 + 200
      expect(batch.totalWasteKg).toBe(15); // 10 + 5
      expect(batch.yarnLots).toHaveLength(2);
      expect(batch.yarnLots[0].lotNumber).toBe('LOT-2026-001');
      expect(batch.yarnLots[1].lotNumber).toBe('LOT-2026-002');
      // Yield = (450 / 500) * 100 = 90%
      expect(batch.yieldPercentage).toBe(90);

      // Summary KPIs
      expect(result.summary.totalBatches).toBe(1);
      expect(result.summary.totalOutputKg).toBe(450);
      expect(result.summary.totalConsumedYarnKg).toBe(500);
      expect(result.summary.averageYieldPct).toBe(90);
    });

    it('should return empty list and zero metrics when no batches exist', async () => {
      mockPrisma.productionOutput.findMany.mockResolvedValue([]);

      const result = await service.findAll({});

      expect(result.outputBatches).toHaveLength(0);
      expect(result.summary.totalBatches).toBe(0);
      expect(result.summary.totalOutputKg).toBe(0);
      expect(result.summary.averageYieldPct).toBe(0);
    });
  });

  describe('findById', () => {
    it('should return computed batch details by UUID or batchNumber', async () => {
      mockPrisma.productionOutput.findFirst.mockResolvedValue(mockOutputRecord);

      const result = await service.findById('OUT-2026-0001');

      expect(result.id).toBe('out-1');
      expect(result.batchNumber).toBe('OUT-2026-0001');
      expect(result.productionOrder.orderNumber).toBe('WO-2026-0001');
      expect(result.party?.name).toBe('Vardhman Textiles Ltd');
    });

    it('should throw NotFoundException when batch does not exist', async () => {
      mockPrisma.productionOutput.findFirst.mockResolvedValue(null);

      await expect(service.findById('NON_EXISTENT')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEligibleOrders', () => {
    it('should return active production orders with remaining planned output', async () => {
      mockPrisma.productionOrder.findMany.mockResolvedValue([mockOrder]);

      const result = await service.getEligibleOrders();

      expect(result).toHaveLength(1);
      expect(result[0].orderNumber).toBe('WO-2026-0001');
      expect(result[0].targetQuantity).toBe(500);
      expect(result[0].consumedKg).toBe(500);
      expect(result[0].existingOutputKg).toBe(0);
      expect(result[0].remainingPlannedKg).toBe(500);
    });
  });

  describe('registerOutputBatch', () => {
    it('should register a new output batch and update product inventory', async () => {
      mockPrisma.productionOrder.findUnique.mockResolvedValue(mockOrder);
      mockPrisma.productionOutput.findFirst.mockResolvedValue(null); // No duplicates
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);
      mockPrisma.product.update.mockResolvedValue(mockProduct);
      mockPrisma.productionOutput.create.mockResolvedValue({
        ...mockOutputRecord,
        id: 'out-new-1',
      });
      mockPrisma.productionOutput.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        ...mockOutputRecord,
        id: 'out-new-1',
      });

      const result = await service.registerOutputBatch(
        {
          productionOrderId: 'order-1',
          productName: '100% Cotton Bath Towel Fabric',
          outputQuantityKg: 450,
          batchNumber: 'OUT-2026-0001',
          unit: 'KG',
        },
        'user-1',
      );

      expect(result.batchNumber).toBe('OUT-2026-0001');
      expect(mockPrisma.product.update).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REGISTER_OUTPUT_BATCH',
            module: 'PRODUCTION',
          }),
        }),
      );
    });

    it('should throw ConflictException if batchNumber already exists', async () => {
      mockPrisma.productionOrder.findUnique.mockResolvedValue(mockOrder);
      mockPrisma.productionOutput.findFirst.mockResolvedValue(mockOutputRecord);

      await expect(
        service.registerOutputBatch({
          productionOrderId: 'order-1',
          productName: '100% Cotton Bath Towel Fabric',
          outputQuantityKg: 450,
          batchNumber: 'OUT-2026-0001',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if production order is CANCELLED', async () => {
      mockPrisma.productionOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'CANCELLED',
      });

      await expect(
        service.registerOutputBatch({
          productionOrderId: 'order-1',
          productName: 'Test Fabric',
          outputQuantityKg: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should perform soft cancellation and decrease product available stock', async () => {
      mockPrisma.productionOutput.findUnique.mockResolvedValue({
        ...mockOutputRecord,
        deliveries: [],
      });
      mockPrisma.product.update.mockResolvedValue(mockProduct);
      mockPrisma.productionOutput.update.mockResolvedValue({
        ...mockOutputRecord,
        status: 'CANCELLED',
      });
      mockPrisma.productionOutput.findFirst.mockResolvedValue({
        ...mockOutputRecord,
        status: 'CANCELLED',
      });

      const result = await service.cancel('out-1', { reason: 'Defect found' }, 'user-1');

      expect(result.status).toBe('CANCELLED');
      expect(mockPrisma.product.update).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CANCEL_OUTPUT_BATCH',
          }),
        }),
      );
    });

    it('should prevent cancellation if deliveries are attached', async () => {
      mockPrisma.productionOutput.findUnique.mockResolvedValue({
        ...mockOutputRecord,
        deliveries: [{ id: 'del-1', dispatchedKg: new Prisma.Decimal(100) }],
      });

      await expect(service.cancel('out-1', {}, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('exportData', () => {
    it('should return valid CSV structure with headers and rows', async () => {
      mockPrisma.productionOutput.findMany.mockResolvedValue([mockOutputRecord]);

      const result = await service.exportData({});

      expect(result.csv).toContain('Batch Number');
      expect(result.csv).toContain('OUT-2026-0001');
      expect(result.csv).toContain('90.0%');
      expect(result.filename).toMatch(/YarnTrace-Finished-Products/);
    });
  });
});
