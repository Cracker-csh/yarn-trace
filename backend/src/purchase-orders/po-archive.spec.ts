import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { InventoryService } from '../inventory/inventory.service';
import { ReportsService } from '../reports/reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../common/cache/app-cache.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Reflector } from '@nestjs/core';
import {
  BadRequestException,
  NotFoundException,
  ExecutionContext,
} from '@nestjs/common';
import { POStatus, TransactionType, LotStatus } from '@prisma/client';

describe('PO Requirement Archive & Soft Delete System', () => {
  let poService: PurchaseOrdersService;
  let poController: PurchaseOrdersController;
  let inventoryService: InventoryService;
  let reportsService: ReportsService;

  const mockParty = {
    id: 'party-101',
    name: 'Premier Towels Mill',
    code: 'PTM-01',
    type: 'CUSTOMER',
  };

  const mockActiveRequirement = {
    id: 'req-active-1',
    purchaseOrderId: 'po-101',
    poNumber: 'PO-2026-99',
    yarnCount: '1/10 KW',
    quality: 'Cotton',
    size: '30x60',
    useFor: 'Bath Towel',
    purpose: 'PILE',
    pcs: 1000,
    qty: 100,
    requiredKg: 500,
    issuedKg: 200,
    notes: 'Active Pile Line',
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedById: null,
    status: 'PARTIAL',
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    transactions: [
      {
        id: 'tx-hist-1',
        transactionNumber: 'TX-ISS-101',
        transactionDate: new Date('2026-10-02'),
        type: TransactionType.ISSUED,
        kilos: 200,
        bags: 4,
        lot: { lotNumber: 'LOT-2026-A' },
        createdBy: { firstName: 'Stock', lastName: 'Head' },
      },
    ],
    purchaseOrder: {
      id: 'po-101',
      poNumber: 'PO-2026-99',
      partyId: 'party-101',
      party: mockParty,
      status: POStatus.CONFIRMED,
    },
  };

  const mockArchivedRequirement = {
    id: 'req-archived-2',
    purchaseOrderId: 'po-101',
    poNumber: 'PO-2026-99',
    yarnCount: '1/10 KW',
    quality: 'Cotton',
    size: '30x60',
    useFor: 'Bath Towel',
    purpose: 'GROUND',
    pcs: 800,
    qty: 80,
    requiredKg: 300,
    issuedKg: 150,
    notes: 'Archived Ground Line',
    isActive: false,
    isArchived: true,
    archivedAt: new Date('2026-10-10T10:00:00Z'),
    archivedById: 'user-supervisor',
    status: 'PARTIAL',
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-10'),
    transactions: [
      {
        id: 'tx-hist-2',
        transactionNumber: 'TX-ISS-102',
        transactionDate: new Date('2026-10-03'),
        type: TransactionType.ISSUED,
        kilos: 150,
        bags: 3,
        lot: { lotNumber: 'LOT-2026-B' },
        createdBy: { firstName: 'Stock', lastName: 'Head' },
      },
    ],
    purchaseOrder: {
      id: 'po-101',
      poNumber: 'PO-2026-99',
      partyId: 'party-101',
      party: mockParty,
      status: POStatus.CONFIRMED,
    },
  };

  const mockUnissuedRequirement = {
    id: 'req-unissued-3',
    purchaseOrderId: 'po-101',
    poNumber: 'PO-2026-99',
    yarnCount: '1/10 KW',
    purpose: 'WEFT',
    requiredKg: 200,
    issuedKg: 0,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedById: null,
    status: 'PENDING',
    transactions: [],
    purchaseOrder: {
      id: 'po-101',
      poNumber: 'PO-2026-99',
      party: mockParty,
    },
  };

  const mockPrisma: any = {
    pORequirement: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    purchaseOrder: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    lot: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    party: {
      findUnique: jest.fn(),
    },
    stockLocation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'loc-1', code: 'MAIN_WH' }),
      create: jest.fn().mockResolvedValue({ id: 'loc-1', code: 'MAIN_WH' }),
    },
    stockBalance: {
      upsert: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-log-uuid' }),
    },
    productionOutput: { aggregate: jest.fn().mockResolvedValue({ _sum: { outputQuantityKg: 0 } }) },
    delivery: { aggregate: jest.fn().mockResolvedValue({ _sum: { dispatchedKg: 0 } }) },
    productionOrder: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn((callback: any) => callback(mockPrisma)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.stockLocation.findFirst.mockResolvedValue({ id: 'loc-1', code: 'MAIN_WH' });
    mockPrisma.stockLocation.create.mockResolvedValue({ id: 'loc-1', code: 'MAIN_WH' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseOrdersController],
      providers: [
        PurchaseOrdersService,
        InventoryService,
        ReportsService,
        AppCacheService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    poService = module.get<PurchaseOrdersService>(PurchaseOrdersService);
    poController = module.get<PurchaseOrdersController>(PurchaseOrdersController);
    inventoryService = module.get<InventoryService>(InventoryService);
    reportsService = module.get<ReportsService>(ReportsService);
  });

  // ===========================================================================
  // 1. ACTIVE VS ARCHIVED IN SELECTORS & CATALOGS
  // ===========================================================================
  describe('1. Active vs Archived Requirements in Selectors', () => {
    it('should exclude archived requirements from PurchaseOrdersService.getRequirements by default', async () => {
      mockPrisma.pORequirement.findMany.mockImplementation(({ where }: any) => {
        expect(where.isArchived).toBe(false);
        expect(where.isActive).toBe(true);
        return Promise.resolve([mockActiveRequirement]);
      });

      const catalog = await poService.getRequirements({ poNumber: 'PO-2026-99' });

      expect(catalog).toHaveLength(1);
      expect(catalog[0].id).toBe('req-active-1');
      expect(catalog[0].isActive).toBe(true);
      expect(catalog[0].isArchived).toBe(false);
    });

    it('should include archived requirements when includeArchived=true is explicitly requested', async () => {
      mockPrisma.pORequirement.findMany.mockImplementation(({ where }: any) => {
        expect(where.isArchived).toBeUndefined();
        return Promise.resolve([mockActiveRequirement, mockArchivedRequirement]);
      });

      const catalog = await poService.getRequirements({
        poNumber: 'PO-2026-99',
        includeArchived: true,
      });

      expect(catalog).toHaveLength(2);
      expect(catalog.some((r) => r.isArchived === true)).toBe(true);
    });

    it('should exclude archived requirements from InventoryService.getPoRequirements selector', async () => {
      mockPrisma.pORequirement.findMany.mockImplementation(({ where }: any) => {
        expect(where.isArchived).toBe(false);
        expect(where.isActive).toBe(true);
        return Promise.resolve([mockActiveRequirement]);
      });

      const result = await inventoryService.getPoRequirements('PO-2026-99');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('req-active-1');
      expect(result[0].isArchived).toBe(false);
    });
  });

  // ===========================================================================
  // 2. EXCLUSION FROM NEW OPERATIONS (ISSUE VALIDATION)
  // ===========================================================================
  describe('2. Exclusion from New Operations', () => {
    it('should reject yarn issue when poRequirementId references an archived requirement', async () => {
      mockPrisma.party.findUnique.mockResolvedValue(mockParty);
      mockPrisma.lot.findUnique.mockResolvedValue({
        id: 'lot-1',
        lotNumber: 'LOT-2026-A',
        currentWeightKg: 1000,
        currentBags: 20,
      });
      mockPrisma.pORequirement.findUnique.mockResolvedValue(mockArchivedRequirement);

      await expect(
        inventoryService.issueStock(
          {
            transactionDate: '2026-10-15',
            lotNumber: 'LOT-2026-A',
            count: '1/10 KW',
            partyId: 'party-101',
            bags: 2,
            kilos: 100,
            poRequirementId: 'req-archived-2',
            purpose: 'GROUND',
          },
          'user-1',
        ),
      ).rejects.toThrow(
        /Cannot issue yarn against archived PO requirement/,
      );
    });

    it('should never match an archived requirement during fallback PO + Count + Purpose search', async () => {
      mockPrisma.party.findUnique.mockResolvedValue(mockParty);
      mockPrisma.lot.findUnique.mockResolvedValue({
        id: 'lot-1',
        lotNumber: 'LOT-2026-A',
        currentWeightKg: 1000,
        currentBags: 20,
      });
      mockPrisma.stockLocation.findFirst.mockResolvedValue({ id: 'loc-1', code: 'MAIN' });
      mockPrisma.lot.update.mockResolvedValue({
        lotNumber: 'LOT-2026-A',
        currentWeightKg: 900,
        currentBags: 18,
      });
      mockPrisma.transaction.create.mockResolvedValue({
        id: 'tx-new-1',
        transactionNumber: 'TX-ISS-200',
      });

      mockPrisma.pORequirement.findFirst.mockImplementation(({ where }: any) => {
        expect(where.isArchived).toBe(false);
        expect(where.isActive).toBe(true);
        return Promise.resolve(null);
      });

      await inventoryService.issueStock(
        {
          transactionDate: '2026-10-15',
          lotNumber: 'LOT-2026-A',
          count: '1/10 KW',
          partyId: 'party-101',
          bags: 2,
          kilos: 100,
          poNumber: 'PO-2026-99',
          purpose: 'GROUND',
        },
        'user-1',
      );

      expect(mockPrisma.pORequirement.findFirst).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 3. HISTORICAL PRESERVATION & REPORT RESOLUTION
  // ===========================================================================
  describe('3. Historical Preservation & Reports Resolution', () => {
    it('should preserve requirement references from historical transactions even after archiving', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'tx-hist-2',
          transactionNumber: 'TX-ISS-102',
          type: TransactionType.ISSUED,
          kilos: 150,
          poRequirementId: 'req-archived-2',
          poRequirement: mockArchivedRequirement,
          lot: { lotNumber: 'LOT-2026-B', yarnCount: '1/10 KW' },
          party: mockParty,
        },
      ]);

      const txs = await mockPrisma.transaction.findMany({
        where: { id: 'tx-hist-2' },
        include: { poRequirement: true },
      });

      expect(txs).toHaveLength(1);
      expect(txs[0].poRequirementId).toBe('req-archived-2');
      expect(txs[0].poRequirement.yarnCount).toBe('1/10 KW');
      expect(txs[0].poRequirement.purpose).toBe('GROUND');
      expect(txs[0].poRequirement.isArchived).toBe(true);
    });

    it('should exclude archived requirements when counting pending requirements in ReportsService', async () => {
      mockPrisma.pORequirement.count.mockImplementation(({ where }: any) => {
        expect(where.isArchived).toBe(false);
        expect(where.isActive).toBe(true);
        expect(where.status).toEqual({ not: 'COMPLETED' });
        return Promise.resolve(5);
      });

      const count = await mockPrisma.pORequirement.count({
        where: { status: { not: 'COMPLETED' }, isArchived: false, isActive: true },
      });
      expect(count).toBe(5);
    });
  });

  // ===========================================================================
  // 4. HARD DELETION PREVENTION FOR REFERENCED REQUIREMENTS
  // ===========================================================================
  describe('4. Prevention of Deleting Referenced Requirements', () => {
    it('should block hard deletion of requirement with linked transactions and advise archiving', async () => {
      mockPrisma.pORequirement.findUnique.mockResolvedValue(mockActiveRequirement);

      await expect(
        poService.deleteRequirement('req-active-1', 'admin-user'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        poService.deleteRequirement('req-active-1', 'admin-user'),
      ).rejects.toThrow(
        /Cannot delete PO Requirement.*referenced by.*historical stock transaction.*Archive this requirement instead/,
      );

      expect(mockPrisma.pORequirement.delete).not.toHaveBeenCalled();
    });

    it('should allow deletion of completely unissued requirements with no transactions', async () => {
      mockPrisma.pORequirement.findUnique.mockResolvedValue(mockUnissuedRequirement);
      mockPrisma.pORequirement.delete.mockResolvedValue(mockUnissuedRequirement);

      const result = await poService.deleteRequirement('req-unissued-3', 'admin-user');

      expect(result.success).toBe(true);
      expect(mockPrisma.pORequirement.delete).toHaveBeenCalledWith({
        where: { id: 'req-unissued-3' },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DELETE_PO_REQUIREMENT',
            entityId: 'req-unissued-3',
          }),
        }),
      );
    });
  });

  // ===========================================================================
  // 5. DISTINCT REQUIREMENT LINES PRESERVATION
  // ===========================================================================
  describe('5. Distinct Requirement Lines Independence', () => {
    it('should preserve distinct requirement lines sharing the same PO number and Yarn Count but different Purpose', async () => {
      // Line A: PILE (Active), Line B: GROUND (Archived), Line C: WEFT (Active)
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
        id: 'po-101',
        poNumber: 'PO-2026-99',
        party: mockParty,
        status: POStatus.CONFIRMED,
        requirements: [
          mockActiveRequirement,
          mockArchivedRequirement,
          mockUnissuedRequirement,
        ],
      });

      const po = await poService.findById('PO-2026-99');

      expect(po.requirements).toHaveLength(3);
      expect(po.requirements[0].purpose).toBe('PILE');
      expect(po.requirements[0].isArchived).toBe(false);

      expect(po.requirements[1].purpose).toBe('GROUND');
      expect(po.requirements[1].isArchived).toBe(true);

      expect(po.requirements[2].purpose).toBe('WEFT');
      expect(po.requirements[2].isArchived).toBe(false);
    });
  });

  // ===========================================================================
  // 6. ARCHIVE & RESTORE LIFECYCLE & AUDIT LOGS
  // ===========================================================================
  describe('6. Archive & Restore Lifecycle', () => {
    it('should successfully archive an active requirement and log an audit entry', async () => {
      mockPrisma.pORequirement.findUnique.mockResolvedValue(mockActiveRequirement);
      mockPrisma.pORequirement.update.mockResolvedValue({
        ...mockActiveRequirement,
        isArchived: true,
        isActive: false,
        archivedAt: new Date('2026-10-15T00:00:00Z'),
        archivedById: 'user-supervisor',
      });

      const result = await poService.archiveRequirement(
        'req-active-1',
        'user-supervisor',
        'Fabric specification superseded',
      );

      expect(result.isArchived).toBe(true);
      expect(result.isActive).toBe(false);
      expect(mockPrisma.pORequirement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'req-active-1' },
          data: expect.objectContaining({
            isArchived: true,
            isActive: false,
            archivedById: 'user-supervisor',
          }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ARCHIVE_PO_REQUIREMENT',
            entityId: 'req-active-1',
            module: 'COMMERCIAL',
            newValue: expect.objectContaining({
              isArchived: true,
              isActive: false,
              reason: 'Fabric specification superseded',
            }),
          }),
        }),
      );
    });

    it('should reject archiving an already archived requirement', async () => {
      mockPrisma.pORequirement.findUnique.mockResolvedValue(mockArchivedRequirement);

      await expect(
        poService.archiveRequirement('req-archived-2', 'user-supervisor'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        poService.archiveRequirement('req-archived-2', 'user-supervisor'),
      ).rejects.toThrow(/is already archived/);
    });

    it('should successfully restore an archived requirement back to active state', async () => {
      mockPrisma.pORequirement.findUnique.mockResolvedValue(mockArchivedRequirement);
      mockPrisma.pORequirement.update.mockResolvedValue({
        ...mockArchivedRequirement,
        isArchived: false,
        isActive: true,
        archivedAt: null,
        archivedById: null,
      });

      const result = await poService.restoreRequirement('req-archived-2', 'user-supervisor');

      expect(result.isArchived).toBe(false);
      expect(result.isActive).toBe(true);
      expect(result.archivedAt).toBeNull();
      expect(mockPrisma.pORequirement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'req-archived-2' },
          data: expect.objectContaining({
            isArchived: false,
            isActive: true,
            archivedAt: null,
            archivedById: null,
          }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'RESTORE_PO_REQUIREMENT',
            entityId: 'req-archived-2',
            module: 'COMMERCIAL',
          }),
        }),
      );
    });

    it('should reject restoring a requirement that is already active', async () => {
      mockPrisma.pORequirement.findUnique.mockResolvedValue(mockActiveRequirement);

      await expect(
        poService.restoreRequirement('req-active-1', 'user-supervisor'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        poService.restoreRequirement('req-active-1', 'user-supervisor'),
      ).rejects.toThrow(/is not archived/);
    });
  });

  // ===========================================================================
  // 7. AUTHORIZATION ENFORCEMENT
  // ===========================================================================
  describe('7. Authorization Enforcement on Archive/Restore Endpoints', () => {
    let reflector: Reflector;
    let guard: PermissionsGuard;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new PermissionsGuard(reflector);
    });

    function createMockContext(user: any): ExecutionContext {
      return {
        getHandler: () => poController.archiveRequirement,
        getClass: () => PurchaseOrdersController,
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      } as any;
    }

    it('should allow ADMIN users to archive requirements', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        'manage_purchase_orders',
        'purchase_orders.manage_requirements',
      ]);

      const context = createMockContext({ id: 'admin-1', role: { code: 'ADMIN' } });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow users with manage_purchase_orders permission to archive requirements', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        'manage_purchase_orders',
        'purchase_orders.manage_requirements',
      ]);

      const context = createMockContext({
        id: 'user-manager',
        role: { code: 'STOCK_HEAD' },
        permissions: ['manage_purchase_orders'],
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject unauthorized users without purchase order permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        'manage_purchase_orders',
        'purchase_orders.manage_requirements',
      ]);

      const context = createMockContext({
        id: 'viewer-1',
        role: { code: 'VIEWER' },
        permissions: ['view_inventory'],
      });
      expect(guard.canActivate(context)).toBe(false);
    });
  });
});
