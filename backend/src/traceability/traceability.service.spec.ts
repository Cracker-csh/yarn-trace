/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { TraceabilityService } from './traceability.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { TransactionType, LotStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

describe('TraceabilityService End-to-End Unit & Integration Tests', () => {
  let service: TraceabilityService;
  let mockPrismaService: any;

  beforeEach(async () => {
    mockPrismaService = {
      lot: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      productionOrder: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TraceabilityService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TraceabilityService>(TraceabilityService);
  });

  describe('traceForwardByLot', () => {
    it('should throw NotFoundException when lot does not exist', async () => {
      mockPrismaService.lot.findFirst.mockResolvedValue(null);

      await expect(service.traceForwardByLot('NON-EXISTENT-LOT')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.lot.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { lotNumber: { equals: 'NON-EXISTENT-LOT', mode: 'insensitive' } },
            { id: 'NON-EXISTENT-LOT' },
          ],
        },
        include: expect.any(Object),
      });
    });

    it('should trace forward for a complete lifecycle lot and reconcile quantities', async () => {
      const mockLot = {
        id: 'lot-uuid-1',
        lotNumber: 'LOT-2026-001',
        yarnCount: '20/1 KW',
        status: LotStatus.IN_PRODUCTION,
        receivedDate: new Date('2026-09-01T10:00:00Z'),
        initialBags: 20,
        initialWeightKg: new Prisma.Decimal(1000),
        currentBags: 14,
        currentWeightKg: new Prisma.Decimal(700),
        yarn: { id: 'y-1', code: 'Y-201', name: 'Cotton Carded 20/1', yarnCount: '20/1 KW' },
        supplier: { id: 'sup-1', name: 'Vardhman Spinning', code: 'VARD' },
        parentLot: null,
        childLots: [],
        stockBalances: [{ quantityKg: new Prisma.Decimal(700), location: { name: 'Main Silo' } }],
        transactions: [
          {
            id: 'tx-1',
            transactionNumber: 'REC-001',
            type: TransactionType.RECEIVED,
            status: 'COMPLETED',
            transactionDate: new Date('2026-09-01T10:00:00Z'),
            kilos: new Prisma.Decimal(1000),
            bags: 20,
            party: { name: 'Vardhman Spinning', code: 'VARD' },
            poNumber: 'PO-991',
            purpose: 'WEAVING',
            createdBy: { firstName: 'Admin', lastName: 'User' },
          },
          {
            id: 'tx-2',
            transactionNumber: 'ISS-001',
            type: TransactionType.ISSUED,
            status: 'COMPLETED',
            transactionDate: new Date('2026-09-02T11:00:00Z'),
            kilos: new Prisma.Decimal(300),
            bags: 6,
            party: null,
            poNumber: 'PO-991',
            purpose: 'WEAVING',
            createdBy: { firstName: 'Stock', lastName: 'Head' },
          },
        ],
        yarnAllocations: [
          {
            id: 'alloc-1',
            allocatedKg: new Prisma.Decimal(300),
            bags: 6,
            status: 'ALLOCATED',
            allocatedDate: new Date('2026-09-03T09:00:00Z'),
            productionTeam: {
              id: 'team-1',
              code: 'WEAVE-1',
              name: 'Weaving Team Alpha',
              department: 'WEAVING',
              teamLead: 'Ramesh Kumar',
            },
            productionOrder: {
              id: 'wo-1',
              orderNumber: 'WO-2026-001',
              status: 'IN_PROGRESS',
              priority: 'HIGH',
              purpose: 'WEAVING',
              productName: 'Grey Fabric Roll',
              targetQuantity: new Prisma.Decimal(500),
              unit: 'KG',
              party: { name: 'Apex Textiles', code: 'APEX' },
              outputs: [
                {
                  id: 'out-1',
                  productName: 'Grey Fabric Roll Grade A',
                  productCode: 'FAB-001',
                  outputQuantityKg: new Prisma.Decimal(195),
                  unit: 'KG',
                  outputDate: new Date('2026-09-05T16:00:00Z'),
                  recordedBy: { firstName: 'Production', lastName: 'Head' },
                },
              ],
              products: [
                {
                  id: 'prod-1',
                  productCode: 'FAB-001',
                  name: 'Grey Fabric Roll Grade A',
                  totalQuantityKg: new Prisma.Decimal(195),
                  availableKg: new Prisma.Decimal(95),
                  deliveries: [
                    {
                      id: 'del-1',
                      deliveryNumber: 'DC-2026-001',
                      party: { name: 'Apex Textiles', code: 'APEX' },
                      dispatchedKg: new Prisma.Decimal(100),
                      status: 'DELIVERED',
                      dispatchDate: new Date('2026-09-06T10:00:00Z'),
                      vehicleNumber: 'MH-12-AB-1234',
                    },
                  ],
                },
              ],
            },
            consumptionRecords: [],
            returns: [],
          },
        ],
        consumptionRecords: [
          {
            id: 'cons-1',
            consumedKg: new Prisma.Decimal(200),
            wasteKg: new Prisma.Decimal(10),
            wasteCategory: 'FLY_WASTE',
            netProducedKg: new Prisma.Decimal(190),
            purpose: 'WEAVING',
            consumptionDate: new Date('2026-09-04T14:00:00Z'),
            isCorrected: false,
            productionTeamId: 'team-1',
            productionTeam: { name: 'Weaving Team Alpha' },
            productionOrderId: 'wo-1',
            productionOrder: { orderNumber: 'WO-2026-001' },
            recordedBy: { firstName: 'Production', lastName: 'Head' },
          },
        ],
        productionReturns: [
          {
            id: 'ret-1',
            returnedKg: new Prisma.Decimal(50),
            returnedBags: 1,
            returnDate: new Date('2026-09-05T10:00:00Z'),
            reason: 'Surplus yarn left on floor',
            productionTeamId: 'team-1',
            productionTeam: { name: 'Weaving Team Alpha' },
            productionOrderId: 'wo-1',
            productionOrder: { orderNumber: 'WO-2026-001' },
            inventoryTransaction: { transactionNumber: 'RET-001' },
            recordedBy: { firstName: 'Stock', lastName: 'Head' },
          },
        ],
        dyeingMovements: [],
      };

      mockPrismaService.lot.findFirst.mockResolvedValue(mockLot);

      const result = await service.traceForwardByLot('LOT-2026-001');

      expect(result).toBeDefined();
      expect(result.root.lotNumber).toBe('LOT-2026-001');
      expect(result.summary.sourceKg).toBe(1000);
      expect(result.summary.receivedKg).toBe(1000);
      expect(result.summary.issuedKg).toBe(300);
      expect(result.summary.allocatedKg).toBe(300);
      expect(result.summary.consumedKg).toBe(200);
      expect(result.summary.wasteKg).toBe(10);
      expect(result.summary.productionReturnedKg).toBe(50);
      expect(result.summary.currentMainStockKg).toBe(700);
      // Floor balance: 300 - 200 - 10 - 50 = 40 KG
      expect(result.summary.currentTeamStockKg).toBe(40);
      expect(result.summary.totalOutputKg).toBe(195);
      expect(result.summary.statusBadge).toBe('PARTIALLY CONSUMED');

      // Check timeline has all steps
      expect(result.timeline.length).toBeGreaterThanOrEqual(6);
      const types = result.timeline.map((t: any) => t.type);
      expect(types).toContain('RECEIVED');
      expect(types).toContain('ISSUED');
      expect(types).toContain('ALLOCATED');
      expect(types).toContain('CONSUMED');
      expect(types).toContain('RETURNED');
      expect(types).toContain('PRODUCTION_OUTPUT');
      expect(types).toContain('DELIVERED');
    });

    it('should support parent-child dyed lot lineage', async () => {
      const mockChildLot = {
        id: 'child-lot-1',
        lotNumber: 'LOT-1014-DYED-01',
        yarnCount: '10/1 KW DYED',
        status: LotStatus.APPROVED,
        receivedDate: new Date('2026-09-10T10:00:00Z'),
        initialBags: 10,
        initialWeightKg: new Prisma.Decimal(500),
        currentBags: 10,
        currentWeightKg: new Prisma.Decimal(500),
        yarn: { id: 'y-2', name: 'Dyed Cotton Navy', yarnCount: '10/1 KW' },
        supplier: { id: 'dye-1', name: 'Aura Dyeing Mill', code: 'AURA' },
        parentLot: {
          id: 'parent-lot-1',
          lotNumber: 'LOT-1014',
          yarnCount: '10/1 KW',
          receivedDate: new Date('2026-08-20T10:00:00Z'),
          initialWeightKg: new Prisma.Decimal(1000),
          currentWeightKg: new Prisma.Decimal(500),
          supplier: { name: 'Trident Mills' },
          transactions: [],
        },
        childLots: [],
        stockBalances: [],
        transactions: [
          {
            id: 'tx-dye-rec',
            transactionNumber: 'REC-DYE-01',
            type: TransactionType.RECEIVED,
            status: 'COMPLETED',
            transactionDate: new Date('2026-09-10T10:00:00Z'),
            kilos: new Prisma.Decimal(500),
            bags: 10,
            party: { name: 'Aura Dyeing Mill' },
            purpose: 'DYED_INWARD',
          },
        ],
        yarnAllocations: [],
        consumptionRecords: [],
        productionReturns: [],
        dyeingMovements: [],
      };

      mockPrismaService.lot.findFirst.mockResolvedValue(mockChildLot);

      const result = await service.traceForwardByLot('LOT-1014-DYED-01');

      expect(result.parentLot).toBeDefined();
      expect(result.parentLot?.lotNumber).toBe('LOT-1014');
      const parentNode = result.timeline.find((t: any) => t.type === 'PARENT_LOT');
      expect(parentNode).toBeDefined();
      expect(parentNode?.title).toContain('LOT-1014');
    });

    it('should track partial genealogy when lot has only been received', async () => {
      const mockFreshLot = {
        id: 'lot-fresh-1',
        lotNumber: 'LOT-FRESH-001',
        yarnCount: '30/1 Combed',
        status: LotStatus.RECEIVED,
        receivedDate: new Date('2026-09-15T10:00:00Z'),
        initialBags: 50,
        initialWeightKg: new Prisma.Decimal(2500),
        currentBags: 50,
        currentWeightKg: new Prisma.Decimal(2500),
        yarn: null,
        supplier: { name: 'Nahar Mills' },
        parentLot: null,
        childLots: [],
        stockBalances: [],
        transactions: [
          {
            id: 'tx-fresh',
            transactionNumber: 'REC-FRESH',
            type: TransactionType.RECEIVED,
            status: 'COMPLETED',
            transactionDate: new Date('2026-09-15T10:00:00Z'),
            kilos: new Prisma.Decimal(2500),
            bags: 50,
            party: { name: 'Nahar Mills' },
          },
        ],
        yarnAllocations: [],
        consumptionRecords: [],
        productionReturns: [],
        dyeingMovements: [],
      };

      mockPrismaService.lot.findFirst.mockResolvedValue(mockFreshLot);

      const result = await service.traceForwardByLot('LOT-FRESH-001');

      expect(result.summary.sourceKg).toBe(2500);
      expect(result.summary.issuedKg).toBe(0);
      expect(result.summary.allocatedKg).toBe(0);
      expect(result.summary.consumedKg).toBe(0);
      expect(result.summary.currentMainStockKg).toBe(2500);
      expect(result.summary.statusBadge).toBe('RECEIVED');
    });
  });

  describe('traceBackwardByProduct', () => {
    it('should throw NotFoundException when neither product nor order exists', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(null);
      mockPrismaService.productionOrder.findFirst.mockResolvedValue(null);

      await expect(service.traceBackwardByProduct('UNKNOWN-PROD')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should trace backward from finished product to raw yarn lots and inward receipts', async () => {
      const mockProduct = {
        id: 'prod-101',
        productCode: 'PROD-FAB-101',
        name: 'Terry Towel White 400GSM',
        category: 'FINISHED_GOOD',
        totalQuantityKg: new Prisma.Decimal(600),
        availableKg: new Prisma.Decimal(200),
        unit: 'KG',
        deliveries: [
          {
            id: 'del-101',
            deliveryNumber: 'DEL-2026-99',
            party: { name: 'Global Home Living', code: 'GHL' },
            dispatchedKg: new Prisma.Decimal(400),
            status: 'DELIVERED',
            dispatchDate: new Date('2026-09-20T10:00:00Z'),
            vehicleNumber: 'KA-01-9999',
          },
        ],
        productionOrder: {
          id: 'wo-101',
          orderNumber: 'WO-2026-101',
          status: 'COMPLETED',
          priority: 'MEDIUM',
          purpose: 'WEAVING',
          targetQuantity: new Prisma.Decimal(600),
          unit: 'KG',
          party: { name: 'Global Home Living' },
          productionTeam: { name: 'Weaving Unit 2' },
          outputs: [
            {
              id: 'out-101',
              productName: 'Terry Towel White 400GSM',
              productCode: 'PROD-FAB-101',
              outputQuantityKg: new Prisma.Decimal(600),
              unit: 'KG',
              outputDate: new Date('2026-09-18T15:00:00Z'),
              recordedBy: { firstName: 'Production', lastName: 'Lead' },
            },
          ],
          consumptionRecords: [
            {
              id: 'cons-101',
              consumedKg: new Prisma.Decimal(620),
              wasteKg: new Prisma.Decimal(20),
              wasteCategory: 'HARD_WASTE',
              consumptionDate: new Date('2026-09-17T12:00:00Z'),
              productionTeam: { name: 'Weaving Unit 2' },
              recordedBy: { firstName: 'Production', lastName: 'Lead' },
              lot: {
                id: 'lot-raw-101',
                lotNumber: 'LOT-COTTON-88',
                yarnCount: '2/20 Towel',
                initialWeightKg: new Prisma.Decimal(2000),
                currentWeightKg: new Prisma.Decimal(1380),
                receivedDate: new Date('2026-09-01T09:00:00Z'),
                yarn: { name: 'Ring Spun 2/20', type: 'COMBED' },
                supplier: { name: 'Trident Group' },
                parentLot: null,
                transactions: [
                  {
                    transactionNumber: 'REC-TRIDENT-01',
                    transactionDate: new Date('2026-09-01T09:00:00Z'),
                    party: { name: 'Trident Group' },
                  },
                ],
              },
            },
          ],
          allocations: [
            {
              id: 'alloc-101',
              allocatedKg: new Prisma.Decimal(650),
              allocatedDate: new Date('2026-09-16T10:00:00Z'),
              productionTeam: { name: 'Weaving Unit 2', department: 'WEAVING' },
              lot: {
                id: 'lot-raw-101',
                lotNumber: 'LOT-COTTON-88',
                yarnCount: '2/20 Towel',
                initialWeightKg: new Prisma.Decimal(2000),
                currentWeightKg: new Prisma.Decimal(1380),
                receivedDate: new Date('2026-09-01T09:00:00Z'),
                yarn: { name: 'Ring Spun 2/20', type: 'COMBED' },
                supplier: { name: 'Trident Group' },
                transactions: [],
              },
            },
          ],
        },
      };

      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);

      const result = await service.traceBackwardByProduct('PROD-FAB-101');

      expect(result).toBeDefined();
      expect(result.root.productCode).toBe('PROD-FAB-101');
      expect(result.summary.totalConsumedKg).toBe(620);
      expect(result.summary.totalOutputKg).toBe(600);
      expect(result.summary.totalDispatchedKg).toBe(400);
      expect(result.summary.consumedLotsCount).toBe(1);
      expect(result.consumedLots[0].lotNumber).toBe('LOT-COTTON-88');
      expect(result.consumedLots[0].supplierName).toBe('Trident Group');
      expect(result.timeline.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('getActiveLots', () => {
    it('should return active lots from the database', async () => {
      mockPrismaService.lot.findMany.mockResolvedValue([
        {
          id: 'l-1',
          lotNumber: 'LOT-1014',
          yarnCount: '10/1 KW',
          currentWeightKg: new Prisma.Decimal(450.5),
          currentBags: 9,
          supplier: { name: 'Vardhman' },
          yarn: { yarnCount: '10/1 KW' },
          status: 'APPROVED',
        },
      ]);

      const data = await service.getActiveLots(5);
      expect(data.length).toBe(1);
      expect(data[0].lotNumber).toBe('LOT-1014');
      expect(data[0].currentWeightKg).toBe(450.5);
    });
  });

  describe('exportTraceCsv', () => {
    it('should generate CSV report for forward trace', async () => {
      mockPrismaService.lot.findFirst.mockResolvedValue({
        id: 'lot-exp-1',
        lotNumber: 'LOT-EXP-001',
        yarnCount: '20/1',
        status: 'APPROVED',
        receivedDate: new Date('2026-09-01'),
        initialBags: 10,
        initialWeightKg: new Prisma.Decimal(500),
        currentBags: 10,
        currentWeightKg: new Prisma.Decimal(500),
        yarn: null,
        supplier: { name: 'Vardhman' },
        parentLot: null,
        childLots: [],
        stockBalances: [],
        transactions: [],
        yarnAllocations: [],
        consumptionRecords: [],
        productionReturns: [],
        dyeingMovements: [],
      });

      const exportResult = await service.exportTraceCsv('forward', 'LOT-EXP-001');
      expect(exportResult.contentType).toBe('text/csv');
      expect(exportResult.filename).toContain('LOT-EXP-001');
      expect(exportResult.buffer.toString('utf-8')).toContain('YARNTRACE END-TO-END GENEALOGICAL TRACE REPORT');
      expect(exportResult.buffer.toString('utf-8')).toContain('LOT-EXP-001');
    });
  });
});
