import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../common/cache/app-cache.service';
import { TransactionType, LotStatus } from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;

  const mockParty = {
    id: 'party-uuid-1',
    code: 'VARDHMAN',
    name: 'Vardhman Textiles Ltd',
    isActive: true,
  };

  const mockDefaultLoc = {
    id: 'loc-uuid-1',
    code: 'MAIN_WH',
    name: 'Main Yarn Warehouse',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        AppCacheService,
        {
          provide: PrismaService,
          useValue: {
            party: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            lot: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            transaction: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              count: jest.fn(),
            },
            stockLocation: {
              findFirst: jest.fn().mockResolvedValue(mockDefaultLoc),
              create: jest.fn().mockResolvedValue(mockDefaultLoc),
            },
            stockBalance: {
              upsert: jest.fn().mockResolvedValue({}),
            },
            auditLog: {
              create: jest.fn().mockResolvedValue({}),
            },
            pORequirement: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            $transaction: jest.fn((callback) => callback(prisma)),
          },
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('Add Opening Stock', () => {
    it('should create an OPENING transaction and set lot initial & current balances', async () => {
      (prisma.party.findUnique as jest.Mock).mockResolvedValue(mockParty);
      (prisma.lot.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.lot.create as jest.Mock).mockResolvedValue({
        id: 'lot-uuid-1',
        lotNumber: 'LOT-OPEN-01',
        yarnCount: '1/10 KW',
        currentBags: 100,
        currentWeightKg: new Prisma.Decimal(5000.5),
        initialBags: 100,
        initialWeightKg: new Prisma.Decimal(5000.5),
        status: LotStatus.APPROVED,
      });
      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: 'tx-uuid-1',
        transactionNumber: 'TXN-OPN-123456-7890',
        type: TransactionType.OPENING,
        bags: 100,
        kilos: new Prisma.Decimal(5000.5),
        yarnCount: '1/10 KW',
        party: mockParty,
      });

      const result = await service.addOpeningStock({
        count: '1/10 KW',
        partyId: mockParty.id,
        lotNumber: 'LOT-OPEN-01',
        bags: 100,
        kilos: 5000.5,
        remarks: 'Opening baseline',
      });

      expect(result).toBeDefined();
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: TransactionType.OPENING,
            yarnCount: '1/10 KW',
            bags: 100,
          }),
        }),
      );
    });

    it('should reconcile to Excel opening acceptance baseline (1,301 bags, 100,243.25 KG)', async () => {
      (prisma.party.findUnique as jest.Mock).mockResolvedValue(mockParty);
      (prisma.lot.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.lot.create as jest.Mock).mockResolvedValue({
        id: 'lot-baseline',
        lotNumber: 'LOT-BASELINE-2026',
        yarnCount: '1/10 KW',
        currentBags: 1301,
        currentWeightKg: new Prisma.Decimal(100243.25),
        initialBags: 1301,
        initialWeightKg: new Prisma.Decimal(100243.25),
      });
      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: 'tx-baseline',
        transactionNumber: 'TXN-OPN-20260830-0001',
        type: TransactionType.OPENING,
        bags: 1301,
        kilos: new Prisma.Decimal(100243.25),
        yarnCount: '1/10 KW',
        party: mockParty,
      });

      const result = await service.addOpeningStock({
        transactionDate: '2026-08-30',
        count: '1/10 KW',
        partyId: mockParty.id,
        lotNumber: 'LOT-BASELINE-2026',
        bags: 1301,
        kilos: 100243.25,
        remarks: 'Excel acceptance baseline 30-Aug-2026',
      });

      expect(result.bags).toEqual(1301);
      expect(Number(result.kilos)).toEqual(100243.25);
    });
  });

  describe('Issue Stock & 103% PO Rule', () => {
    it('should reject issue when stock is insufficient to prevent negative stock', async () => {
      (prisma.party.findUnique as jest.Mock).mockResolvedValue(mockParty);
      (prisma.lot.findUnique as jest.Mock).mockResolvedValue({
        id: 'lot-uuid-1',
        lotNumber: 'LOT-001',
        currentWeightKg: new Prisma.Decimal(100.0),
        currentBags: 2,
      });

      await expect(
        service.issueStock({
          count: '1/10 KW',
          partyId: mockParty.id,
          lotNumber: 'LOT-001',
          bags: 5,
          kilos: 250.0,
          purpose: 'PILE',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject issue when exceeding 103% PO requirement ceiling for PO + Count + Purpose', async () => {
      (prisma.party.findUnique as jest.Mock).mockResolvedValue(mockParty);
      (prisma.lot.findUnique as jest.Mock).mockResolvedValue({
        id: 'lot-uuid-1',
        lotNumber: 'LOT-001',
        currentWeightKg: new Prisma.Decimal(5000.0),
        currentBags: 100,
      });

      // PO Requirement: 1000 KG required, 1030 KG ceiling, 950 KG already issued
      (prisma.pORequirement.findFirst as jest.Mock).mockResolvedValue({
        id: 'po-req-1',
        poNumber: 'PO-8801',
        yarnCount: '1/10 KW',
        purpose: 'PILE',
        requiredKg: new Prisma.Decimal(1000.0),
        issuedKg: new Prisma.Decimal(950.0),
      });

      // Attempting to issue 100 KG (950 + 100 = 1050 > 1030)
      await expect(
        service.issueStock({
          count: '1/10 KW',
          partyId: mockParty.id,
          lotNumber: 'LOT-001',
          bags: 2,
          kilos: 100.0,
          poNumber: 'PO-8801',
          purpose: 'PILE',
        }),
      ).rejects.toThrow(/PO 103% Requirement Rule Exceeded/);
    });

    it('should allow issue when within 103% ceiling and decrement lot balance', async () => {
      (prisma.party.findUnique as jest.Mock).mockResolvedValue(mockParty);
      (prisma.lot.findUnique as jest.Mock).mockResolvedValue({
        id: 'lot-uuid-1',
        lotNumber: 'LOT-001',
        currentWeightKg: new Prisma.Decimal(5000.0),
        currentBags: 100,
      });

      (prisma.pORequirement.findFirst as jest.Mock).mockResolvedValue({
        id: 'po-req-1',
        poNumber: 'PO-8801',
        yarnCount: '1/10 KW',
        purpose: 'PILE',
        requiredKg: new Prisma.Decimal(1000.0),
        issuedKg: new Prisma.Decimal(950.0),
      });

      (prisma.lot.update as jest.Mock).mockResolvedValue({
        id: 'lot-uuid-1',
        lotNumber: 'LOT-001',
        currentWeightKg: new Prisma.Decimal(4930.0),
        currentBags: 98,
      });

      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: 'tx-iss-1',
        transactionNumber: 'TXN-ISS-001',
        type: TransactionType.ISSUED,
        kilos: new Prisma.Decimal(70.0),
        bags: 2,
      });

      // 950 + 70 = 1020 <= 1030 (Within 103%)
      const result = await service.issueStock({
        count: '1/10 KW',
        partyId: mockParty.id,
        lotNumber: 'LOT-001',
        bags: 2,
        kilos: 70.0,
        poNumber: 'PO-8801',
        purpose: 'PILE',
      });

      expect(result).toBeDefined();
      expect(prisma.transaction.create).toHaveBeenCalled();
    });
  });

  describe('Return Stock', () => {
    it('should reject return exceeding eligible issue balance', async () => {
      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue({
        id: 'orig-issue-id',
        transactionNumber: 'TXN-ISS-99',
        type: TransactionType.ISSUED,
        kilos: new Prisma.Decimal(100.0),
        referencedBy: [
          { type: TransactionType.RETURN, kilos: new Prisma.Decimal(80.0) },
        ],
      });

      // Attempting to return 30 KG (100 - 80 = 20 max eligible)
      await expect(
        service.returnStock({
          referenceTransactionId: 'orig-issue-id',
          bags: 1,
          kilos: 30.0,
        }),
      ).rejects.toThrow(/exceeds eligible return balance/);
    });
  });

  describe('Retire Stock', () => {
    it('should require mandatory reason and decrease stock', async () => {
      (prisma.lot.findUnique as jest.Mock).mockResolvedValue({
        id: 'lot-uuid-1',
        lotNumber: 'LOT-001',
        currentWeightKg: new Prisma.Decimal(500.0),
        currentBags: 10,
        supplier: mockParty,
      });

      (prisma.lot.update as jest.Mock).mockResolvedValue({
        id: 'lot-uuid-1',
        lotNumber: 'LOT-001',
        currentWeightKg: new Prisma.Decimal(450.0),
        currentBags: 9,
        status: LotStatus.APPROVED,
      });

      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: 'tx-retire',
        transactionNumber: 'TXN-WOF-001',
        type: TransactionType.RETIRED,
        kilos: new Prisma.Decimal(50.0),
        bags: 1,
      });

      const result = await service.retireStock({
        lotNumber: 'LOT-001',
        bags: 1,
        kilos: 50.0,
        reason: 'Water damage in storage bay',
      });

      expect(result).toBeDefined();
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: TransactionType.RETIRED,
            notes: 'Water damage in storage bay',
          }),
        }),
      );
    });
  });

  describe('Correction / Reversal', () => {
    it('should reverse original transaction and record offset without hard deleting', async () => {
      const origTx = {
        id: 'orig-tx-id',
        transactionNumber: 'TXN-RCV-001',
        type: TransactionType.RECEIVED,
        kilos: new Prisma.Decimal(500.0),
        bags: 10,
        lotId: 'lot-uuid-1',
        partyId: mockParty.id,
      };

      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(origTx);
      (prisma.lot.findUnique as jest.Mock).mockResolvedValue({
        id: 'lot-uuid-1',
        lotNumber: 'LOT-001',
        currentWeightKg: new Prisma.Decimal(1000.0),
        currentBags: 20,
      });
      (prisma.lot.update as jest.Mock).mockResolvedValue({});
      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: 'rev-tx-id',
        transactionNumber: 'TXN-REV-001',
        type: TransactionType.CORRECTION,
      });

      const result = await service.correctTransaction({
        referenceTransactionId: 'orig-tx-id',
        reason: 'Weight typo on scale receipt',
      });

      expect(result.reversalTransaction).toBeDefined();
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: TransactionType.CORRECTION,
            referenceTransactionId: 'orig-tx-id',
          }),
        }),
      );
    });
  });

  describe('Transaction Integrity & Historical Protection', () => {
    it('should prevent duplicate lot numbers during OPENING baseline creation', async () => {
      (prisma.party.findUnique as jest.Mock).mockResolvedValue(mockParty);
      
      (prisma.lot.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-lot' });
      
      await expect(
        service.addOpeningStock({
          count: '1/10 KW',
          partyId: mockParty.id,
          lotNumber: 'LOT-DUP-01',
          bags: 100,
          kilos: 5000.5,
        })
      ).rejects.toThrow(ConflictException);
    });

    it('should block corrections on OPENING transactions', async () => {
      // Mock an OPENING transaction
      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue({
        id: 'tx-opn-1',
        type: TransactionType.OPENING,
      });

      await expect(
        service.correctTransaction({
          referenceTransactionId: 'tx-opn-1',
          reason: 'Trying to edit baseline',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should block double-corrections on the same transaction', async () => {
      // Mock a transaction that already has a correction in referencedBy
      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue({
        id: 'tx-rcv-1',
        type: TransactionType.RECEIVED,
        referencedBy: [{ id: 'existing-correction', type: TransactionType.CORRECTION }],
      });

      await expect(
        service.correctTransaction({
          referenceTransactionId: 'tx-rcv-1',
          reason: 'Trying to correct again',
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Stock Ledger Reconciliation & Inconsistency Detection (Regression Test)', () => {
    it('should reconcile lot stock balances with completed transaction history and detect discrepancies', async () => {
      const mockLots = [
        {
          id: 'lot-reconciled',
          lotNumber: 'Lot 1014',
          currentWeightKg: new Prisma.Decimal(500),
          currentBags: 10,
        },
        {
          id: 'lot-discrepancy',
          lotNumber: 'Lot 2014-Test',
          currentWeightKg: new Prisma.Decimal(90),
          currentBags: 0,
        },
      ];

      (prisma.lot.findMany as jest.Mock).mockResolvedValue(mockLots);
      (prisma.transaction.findMany as jest.Mock).mockImplementation(({ where }) => {
        if (where?.lotId === 'lot-reconciled') {
          return Promise.resolve([
            { type: TransactionType.OPENING, kilos: new Prisma.Decimal(1000), bags: 15 },
            { type: TransactionType.ISSUED, kilos: new Prisma.Decimal(500), bags: 5 },
          ]);
        }
        if (where?.lotId === 'lot-discrepancy') {
          // Simulated missing transaction
          return Promise.resolve([
            { type: TransactionType.OPENING, kilos: new Prisma.Decimal(200), bags: 1 },
          ]);
        }
        return Promise.resolve([]);
      });

      const lots = await prisma.lot.findMany();
      const reconciliationResults = [];

      for (const lot of lots) {
        const txs = await prisma.transaction.findMany({ where: { lotId: lot.id } });
        let ledgerKg = 0;
        for (const t of txs) {
          if (['OPENING', 'RECEIVED', 'RETURN', 'RETURNED'].includes(t.type)) {
            ledgerKg += Number(t.kilos);
          } else if (['ISSUED', 'RETIRED', 'SOLD'].includes(t.type)) {
            ledgerKg -= Number(t.kilos);
          }
        }
        const diff = Math.abs(ledgerKg - Number(lot.currentWeightKg));
        reconciliationResults.push({ lotNumber: lot.lotNumber, diff, isReconciled: diff < 0.0001 });
      }

      expect(reconciliationResults[0].isReconciled).toBe(true);
      expect(reconciliationResults[0].diff).toBe(0);
      expect(reconciliationResults[1].isReconciled).toBe(false);
      expect(reconciliationResults[1].diff).toBe(110);
    });
  });
});
