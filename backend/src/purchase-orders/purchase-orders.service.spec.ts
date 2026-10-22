import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../common/cache/app-cache.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { POStatus, TransactionType } from '@prisma/client';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let prisma: PrismaService;

  const mockParty = {
    id: 'party-uuid-1',
    name: 'ABC Textiles Mill',
    code: 'ABC-001',
    type: 'CUSTOMER',
    contactPerson: 'Mr. Sharma',
    phone: '+919876543210',
    email: 'sharma@abctextiles.com',
    gstNumber: '27AAAAA0000A1Z5',
    address: 'Surat, Gujarat',
  };

  const mockRequirements = [
    {
      id: 'req-uuid-1',
      purchaseOrderId: 'po-uuid-1',
      poNumber: 'PO-TEST-001',
      yarnCount: '1/10 KW',
      quality: 'Cotton',
      size: '30x60',
      useFor: 'Bath Towel',
      purpose: 'PILE',
      pcs: 1000,
      qty: 100,
      requiredKg: 500,
      issuedKg: 200,
      notes: 'Line 1 Pile',
      createdAt: new Date(),
      updatedAt: new Date(),
      transactions: [
        {
          id: 'tx-1',
          transactionNumber: 'TX-ISS-001',
          transactionDate: new Date(),
          type: TransactionType.ISSUED,
          kilos: 200,
          bags: 4,
          lot: { lotNumber: 'LOT-CTN-01' },
          createdBy: { firstName: 'Admin', lastName: 'User' },
        },
      ],
    },
    {
      id: 'req-uuid-2',
      purchaseOrderId: 'po-uuid-1',
      poNumber: 'PO-TEST-001',
      yarnCount: '1/10 KW',
      quality: 'Cotton',
      size: '30x60',
      useFor: 'Bath Towel',
      purpose: 'GROUND',
      pcs: 1000,
      qty: 100,
      requiredKg: 300,
      issuedKg: 300,
      notes: 'Line 2 Ground',
      createdAt: new Date(),
      updatedAt: new Date(),
      transactions: [
        {
          id: 'tx-2',
          transactionNumber: 'TX-ISS-002',
          transactionDate: new Date(),
          type: TransactionType.ISSUED,
          kilos: 300,
          bags: 6,
          lot: { lotNumber: 'LOT-CTN-01' },
          createdBy: { firstName: 'Admin', lastName: 'User' },
        },
      ],
    },
    {
      id: 'req-uuid-3',
      purchaseOrderId: 'po-uuid-1',
      poNumber: 'PO-TEST-001',
      yarnCount: '1/10 OE',
      quality: 'Cotton',
      size: '30x60',
      useFor: 'Weft Line',
      purpose: 'WEFT',
      pcs: 500,
      qty: 50,
      requiredKg: 200,
      issuedKg: 0,
      notes: 'Line 3 Weft',
      createdAt: new Date(),
      updatedAt: new Date(),
      transactions: [],
    },
  ];

  const mockPO = {
    id: 'po-uuid-1',
    poNumber: 'PO-TEST-001',
    partyId: 'party-uuid-1',
    party: mockParty,
    status: POStatus.CONFIRMED,
    orderDate: new Date('2026-10-01'),
    deliveryDue: new Date('2026-10-30'),
    totalAmount: 150000,
    remarks: 'Customer priority PO',
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    requirements: mockRequirements,
  };

  const mockPrismaService: any = {
    purchaseOrder: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pORequirement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    party: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    $transaction: jest.fn((callback: (tx: any) => any) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        AppCacheService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('1. should return all purchase orders with calculated requirement metrics', async () => {
      mockPrismaService.purchaseOrder.findMany.mockResolvedValue([mockPO]);

      const result = await service.findAll({});

      expect(result.purchaseOrders).toHaveLength(1);
      const po = result.purchaseOrders[0];
      expect(po.poNumber).toBe('PO-TEST-001');
      expect(po.totalRequiredKg).toBe(1000);
      expect(po.totalIssuedKg).toBe(500);
      expect(po.totalRemainingKg).toBe(500);
      expect(po.overallFulfillmentPct).toBe(50);
      expect(po.status).toBe('PARTIALLY_FULFILLED');

      expect(po.requirements).toHaveLength(3);
      // Line 1: 500 req, 200 issued -> PARTIAL
      expect(po.requirements[0].status).toBe('PARTIAL');
      expect(po.requirements[0].remainingKg).toBe(300);

      // Line 2: 300 req, 300 issued -> COMPLETED
      expect(po.requirements[1].status).toBe('COMPLETED');
      expect(po.requirements[1].remainingKg).toBe(0);

      // Line 3: 200 req, 0 issued -> PENDING
      expect(po.requirements[2].status).toBe('PENDING');
      expect(po.requirements[2].remainingKg).toBe(200);

      expect(result.summary.totalPOs).toBe(1);
      expect(result.summary.totalRequiredKg).toBe(1000);
    });
  });

  describe('findById', () => {
    it('2. should find PO by ID or PO Number and throw NotFoundException if missing', async () => {
      mockPrismaService.purchaseOrder.findFirst.mockResolvedValue(mockPO);

      const result = await service.findById('PO-TEST-001');
      expect(result.poNumber).toBe('PO-TEST-001');

      mockPrismaService.purchaseOrder.findFirst.mockResolvedValue(null);
      await expect(service.findById('NON_EXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('3. should create a PO with multiple distinct requirements and audit log', async () => {
      mockPrismaService.purchaseOrder.findUnique.mockResolvedValue(null);
      mockPrismaService.party.findUnique.mockResolvedValue(mockParty);
      mockPrismaService.purchaseOrder.create.mockResolvedValue(mockPO);
      mockPrismaService.pORequirement.create.mockResolvedValue(mockRequirements[0]);
      mockPrismaService.purchaseOrder.findFirst.mockResolvedValue(mockPO);

      const dto = {
        poNumber: 'PO-NEW-001',
        partyId: 'party-uuid-1',
        requirements: [
          {
            yarnCount: '1/10 KW',
            purpose: 'PILE',
            quality: 'Cotton',
            size: '30x60',
            requiredKg: 500,
          },
          {
            yarnCount: '1/10 KW',
            purpose: 'GROUND',
            quality: 'Cotton',
            size: '30x60',
            requiredKg: 300,
          },
          {
            yarnCount: '1/10 KW',
            purpose: 'PILE',
            quality: 'Cotton',
            size: '30x30', // Same Count & Purpose but different size
            requiredKg: 200,
          },
        ],
      };

      const result = await service.create(dto as any, 'user-admin');
      expect(result.poNumber).toBe('PO-TEST-001');
      expect(mockPrismaService.purchaseOrder.create).toHaveBeenCalled();
      expect(mockPrismaService.pORequirement.create).toHaveBeenCalledTimes(3);
      expect(mockPrismaService.auditLog.create).toHaveBeenCalled();
    });

    it('4. should reject duplicate PO number with ConflictException', async () => {
      mockPrismaService.purchaseOrder.findUnique.mockResolvedValue(mockPO);

      await expect(
        service.create(
          {
            poNumber: 'PO-TEST-001',
            partyId: 'party-uuid-1',
            requirements: [{ yarnCount: '1/10 KW', purpose: 'PILE', requiredKg: 100 }],
          } as any,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel', () => {
    it('5. should cancel PO and update requirements without hard deleting records', async () => {
      mockPrismaService.purchaseOrder.findUnique.mockResolvedValue(mockPO);
      mockPrismaService.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: POStatus.CANCELLED,
      });
      mockPrismaService.purchaseOrder.findFirst.mockResolvedValue({
        ...mockPO,
        status: POStatus.CANCELLED,
      });

      const result = await service.cancel('po-uuid-1', { reason: 'Client requested hold' }, 'admin-id');
      expect(mockPrismaService.purchaseOrder.update).toHaveBeenCalled();
      expect(mockPrismaService.pORequirement.updateMany).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-uuid-1' },
        data: { status: 'CANCELLED' },
      });
      expect(mockPrismaService.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('getRequirements', () => {
    it('6. should return requirements with 103% ceiling for inventory issue selection', async () => {
      mockPrismaService.pORequirement.findMany.mockResolvedValue([
        {
          id: 'req-uuid-1',
          poNumber: 'PO-TEST-001',
          yarnCount: '1/10 KW',
          purpose: 'PILE',
          requiredKg: 500,
          issuedKg: 200,
          purchaseOrder: { party: mockParty, partyId: 'party-uuid-1', poNumber: 'PO-TEST-001' },
          transactions: [{ kilos: 200 }],
        },
      ]);

      const result = await service.getRequirements({ poNumber: 'PO-TEST-001' });
      expect(result).toHaveLength(1);
      expect(result[0].requiredKg).toBe(500);
      expect(result[0].issuedKg).toBe(200);
      expect(result[0].remainingKg).toBe(300);
      expect(result[0].ceiling103Kg).toBe(515); // 500 * 1.03 = 515 KG
      expect(result[0].status).toBe('PARTIAL');
    });
  });
});
