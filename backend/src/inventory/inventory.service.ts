import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TransactionType, LotStatus } from '@prisma/client';
import { AddOpeningStockDto } from './dto/add-opening-stock.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { IssueStockDto } from './dto/issue-stock.dto';
import { ReturnStockDto } from './dto/return-stock.dto';
import { RetireStockDto } from './dto/retire-stock.dto';
import { SellStockDto } from './dto/sell-stock.dto';
import { CorrectionDto } from './dto/correction.dto';
import { InventoryFilterDto } from './dto/inventory-filter.dto';
import * as XLSX from 'xlsx';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // Helper to generate unique sequential transaction numbers
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

  // ---------------------------------------------------------------------------
  // 1. ADD OPENING STOCK
  // ---------------------------------------------------------------------------
  async addOpeningStock(dto: AddOpeningStockDto, userId?: string) {
    const party = await this.prisma.party.findUnique({
      where: { id: dto.partyId },
    });

    if (!party) {
      throw new NotFoundException(`Party with ID "${dto.partyId}" not found in Party Master`);
    }

    if (!party.isActive) {
      throw new BadRequestException(
        `Party "${party.name}" is deactivated. Please select an active party.`,
      );
    }

    const txDate = dto.transactionDate ? new Date(dto.transactionDate) : new Date();
    const kgDecimal = new Prisma.Decimal(dto.kilos);

    return this.prisma.$transaction(async (tx) => {
      const defaultLoc = await this.getOrCreateDefaultLocation(tx);

      // Find existing Lot
      const existingLot = await tx.lot.findUnique({
        where: { lotNumber: dto.lotNumber.trim() },
      });

      // Task 3: Prevent duplicate baseline lots
      if (existingLot) {
        throw new ConflictException(
          `Lot ${dto.lotNumber.trim()} already exists. Opening stock baseline can only be created once per unique lot.`,
        );
      }

      // Create new lot from scratch
      const lot = await tx.lot.create({
        data: {
          lotNumber: dto.lotNumber.trim(),
          yarnCount: dto.count.trim(),
          supplierId: party.id,
          initialBags: dto.bags,
          initialWeightKg: kgDecimal,
          currentBags: dto.bags,
          currentWeightKg: kgDecimal,
          millLotNumber: dto.millLotNumber?.trim() || null,
          shadeCode: dto.shadeCode?.trim() || null,
          remarks: dto.remarks?.trim() || null,
          receivedDate: txDate,
          status: 'APPROVED',
        },
      });

      // Create OPENING transaction
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: this.generateTxNumber('OPN'),
          type: 'OPENING', // Maps to TransactionType.OPENING[cite: 14]
          transactionDate: txDate,
          yarnCount: dto.count.trim(),
          partyId: party.id,
          lotId: lot.id,
          bags: dto.bags,
          kilos: kgDecimal,
          notes: dto.remarks?.trim() || 'Opening Stock Entry',
          createdById: userId || null,
        },
        include: {
          party: true,
          lot: true,
        },
      });

      // Update StockBalance
      await tx.stockBalance.upsert({
        where: {
          lotId_locationId: {
            lotId: lot.id,
            locationId: defaultLoc.id,
          },
        },
        update: {
          quantityKg: lot.currentWeightKg,
          bagsCount: lot.currentBags,
        },
        create: {
          lotId: lot.id,
          locationId: defaultLoc.id,
          quantityKg: lot.currentWeightKg,
          bagsCount: lot.currentBags,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'ADD_OPENING_STOCK',
          module: 'INVENTORY',
          entityType: 'Transaction',
          entityId: transaction.id,
          newValue: {
            transactionNumber: transaction.transactionNumber,
            lotNumber: lot.lotNumber,
            count: dto.count,
            party: party.name,
            bags: dto.bags,
            kilos: dto.kilos,
          },
          metadata: { lotId: lot.id, partyId: party.id },
        },
      });

      return transaction;
    });
  }

  // ---------------------------------------------------------------------------
  // 2. RECEIVE STOCK (INWARD)
  // ---------------------------------------------------------------------------
  async receiveStock(dto: ReceiveStockDto, userId?: string) {
    const party = await this.prisma.party.findUnique({
      where: { id: dto.partyId },
    });

    if (!party) {
      throw new NotFoundException(`Party with ID "${dto.partyId}" not found in Party Master`);
    }

    if (!party.isActive) {
      throw new BadRequestException(
        `Party "${party.name}" is deactivated. Please select an active party.`,
      );
    }

    const txDate = dto.transactionDate ? new Date(dto.transactionDate) : new Date();
    const kgDecimal = new Prisma.Decimal(dto.kilos);

    return this.prisma.$transaction(async (tx) => {
      const defaultLoc = await this.getOrCreateDefaultLocation(tx);

      // Verify parent lot if dyeing lineage is specified
      if (dto.parentLotId) {
        const parentLot = await tx.lot.findUnique({
          where: { id: dto.parentLotId },
        });
        if (!parentLot) {
          throw new NotFoundException(`Parent dyeing lot "${dto.parentLotId}" not found`);
        }
      }

      // Find or create Lot
      let lot = await tx.lot.findUnique({
        where: { lotNumber: dto.lotNumber.trim() },
      });

      if (!lot) {
        lot = await tx.lot.create({
          data: {
            lotNumber: dto.lotNumber.trim(),
            yarnCount: dto.count.trim(),
            supplierId: party.id,
            parentLotId: dto.parentLotId || null,
            initialBags: dto.bags,
            initialWeightKg: kgDecimal,
            currentBags: dto.bags,
            currentWeightKg: kgDecimal,
            millLotNumber: dto.millLotNumber?.trim() || null,
            shadeCode: dto.shadeCode?.trim() || null,
            remarks: dto.remarks?.trim() || null,
            receivedDate: txDate,
            status: LotStatus.RECEIVED,
          },
        });
      } else {
        lot = await tx.lot.update({
          where: { id: lot.id },
          data: {
            initialBags: lot.initialBags + dto.bags,
            initialWeightKg: Prisma.Decimal.add(lot.initialWeightKg, kgDecimal),
            currentBags: lot.currentBags + dto.bags,
            currentWeightKg: Prisma.Decimal.add(lot.currentWeightKg, kgDecimal),
            yarnCount: lot.yarnCount || dto.count.trim(),
            supplierId: lot.supplierId || party.id,
          },
        });
      }

      // Create RECEIVED transaction
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: this.generateTxNumber('RCV'),
          type: TransactionType.RECEIVED,
          transactionDate: txDate,
          yarnCount: dto.count.trim(),
          partyId: party.id,
          lotId: lot.id,
          bags: dto.bags,
          kilos: kgDecimal,
          poNumber: dto.poNumber?.trim() || null,
          purpose: dto.purpose?.trim() || null,
          referenceNumber: dto.referenceNumber?.trim() || null,
          notes: dto.remarks?.trim() || null,
          createdById: userId || null,
        },
        include: {
          party: true,
          lot: true,
        },
      });

      // Update StockBalance
      await tx.stockBalance.upsert({
        where: {
          lotId_locationId: {
            lotId: lot.id,
            locationId: defaultLoc.id,
          },
        },
        update: {
          quantityKg: lot.currentWeightKg,
          bagsCount: lot.currentBags,
        },
        create: {
          lotId: lot.id,
          locationId: defaultLoc.id,
          quantityKg: lot.currentWeightKg,
          bagsCount: lot.currentBags,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'RECEIVE_YARN',
          module: 'INVENTORY',
          entityType: 'Transaction',
          entityId: transaction.id,
          newValue: {
            transactionNumber: transaction.transactionNumber,
            lotNumber: lot.lotNumber,
            count: dto.count,
            supplier: party.name,
            bags: dto.bags,
            kilos: dto.kilos,
            poNumber: dto.poNumber,
          },
          metadata: { lotId: lot.id, partyId: party.id },
        },
      });

      return transaction;
    });
  }

  // ---------------------------------------------------------------------------
  // 3. ISSUE STOCK (WITH PO 103% RULE & NEGATIVE STOCK PREVENTION)
  // ---------------------------------------------------------------------------
  async issueStock(dto: IssueStockDto, userId?: string) {
    const party = await this.prisma.party.findUnique({
      where: { id: dto.partyId },
    });

    if (!party) {
      throw new NotFoundException(`Party with ID "${dto.partyId}" not found in Party Master`);
    }

    const txDate = dto.transactionDate ? new Date(dto.transactionDate) : new Date();
    const kgDecimal = new Prisma.Decimal(dto.kilos);

    return this.prisma.$transaction(async (tx) => {
      const defaultLoc = await this.getOrCreateDefaultLocation(tx);

      // 1. Validate Lot exists and has sufficient stock
      const lot = await tx.lot.findUnique({
        where: { lotNumber: dto.lotNumber.trim() },
      });

      if (!lot) {
        throw new NotFoundException(`Lot "${dto.lotNumber}" not found in inventory`);
      }

      if (lot.currentWeightKg.lessThan(kgDecimal)) {
        throw new BadRequestException(
          `Insufficient stock in Lot "${lot.lotNumber}". Available: ${lot.currentWeightKg.toFixed(2)} KG, Requested: ${dto.kilos.toFixed(2)} KG. Issue rejected to prevent negative inventory balance.`,
        );
      }

      if (lot.currentBags < dto.bags) {
        throw new BadRequestException(
          `Insufficient bags in Lot "${lot.lotNumber}". Available: ${lot.currentBags} bags, Requested: ${dto.bags} bags.`,
        );
      }

      // 2. Validate PO + 103% Rule
      // Matching key: poRequirementId OR (PO No + Yarn Count + Purpose)
      let matchedRequirementId: string | null = null;

      if (dto.poRequirementId || (dto.poNumber && dto.poNumber.trim())) {
        let poReq: any = null;

        if (dto.poRequirementId) {
          poReq = await tx.pORequirement.findUnique({
            where: { id: dto.poRequirementId },
            include: { purchaseOrder: true },
          });
        }

        if (!poReq && dto.poNumber && dto.poNumber.trim()) {
          const cleanPo = dto.poNumber.trim();
          const cleanCount = dto.count.trim();
          const cleanPurpose = dto.purpose.trim().toUpperCase();

          poReq = await tx.pORequirement.findFirst({
            where: {
              OR: [
                {
                  poNumber: { equals: cleanPo, mode: 'insensitive' },
                  yarnCount: { equals: cleanCount, mode: 'insensitive' },
                  purpose: { equals: cleanPurpose, mode: 'insensitive' },
                },
                {
                  purchaseOrder: {
                    poNumber: { equals: cleanPo, mode: 'insensitive' },
                  },
                  yarnCount: { equals: cleanCount, mode: 'insensitive' },
                  purpose: { equals: cleanPurpose, mode: 'insensitive' },
                },
              ],
            },
            include: {
              purchaseOrder: true,
            },
          });
        }

        if (poReq) {
          matchedRequirementId = poReq.id;
          const reqKg = Number(poReq.requiredKg);
          const ceiling103 = reqKg * 1.03;
          const alreadyIssued = Number(poReq.issuedKg);
          const projectedTotal = alreadyIssued + dto.kilos;

          if (projectedTotal > ceiling103 + 0.0001) {
            const exceededBy = (projectedTotal - ceiling103).toFixed(2);
            throw new BadRequestException(
              `PO 103% Requirement Rule Exceeded: Cannot issue ${dto.kilos.toFixed(2)} KG for PO "${poReq.poNumber || dto.poNumber}", Count "${dto.count}", Purpose "${dto.purpose}". Required: ${reqKg.toFixed(2)} KG, 103% Ceiling: ${ceiling103.toFixed(2)} KG, Current Issued: ${alreadyIssued.toFixed(2)} KG. This issue would exceed the ceiling by ${exceededBy} KG.`,
            );
          }

          const newTotalIssued = Prisma.Decimal.add(poReq.issuedKg, kgDecimal);
          const newStatus = Number(newTotalIssued) >= reqKg - 0.0001 ? 'COMPLETED' : 'PARTIAL';

          // Update issued quantity and status on PO requirement
          await tx.pORequirement.update({
            where: { id: poReq.id },
            data: {
              issuedKg: newTotalIssued,
              status: newStatus,
            } as any,
          });
        }
      }

      // 3. Decrement Lot Balance (Atomically to prevent concurrent negative stock)
      const newWeight = Prisma.Decimal.sub(lot.currentWeightKg, kgDecimal);
      const newBags = lot.currentBags - dto.bags;

      const updatedLotCount = await tx.lot.updateMany({
        where: {
          id: lot.id,
          currentWeightKg: { gte: kgDecimal },
          currentBags: { gte: dto.bags },
        },
        data: {
          currentWeightKg: { decrement: kgDecimal },
          currentBags: { decrement: dto.bags },
          status: newWeight.isZero() ? LotStatus.EXHAUSTED : LotStatus.IN_PRODUCTION,
        },
      });

      if (updatedLotCount.count === 0) {
        throw new BadRequestException(
          `Concurrent stock update detected or insufficient balance in Lot "${lot.lotNumber}".`,
        );
      }

      const updatedLot = {
        lotNumber: lot.lotNumber,
        currentWeightKg: newWeight,
        currentBags: newBags,
      };

      // 4. Create ISSUED transaction
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: this.generateTxNumber('ISS'),
          type: TransactionType.ISSUED,
          transactionDate: txDate,
          yarnCount: dto.count.trim(),
          partyId: party.id,
          lotId: lot.id,
          bags: dto.bags,
          kilos: kgDecimal,
          poNumber: dto.poNumber?.trim() || null,
          poRequirementId: matchedRequirementId || dto.poRequirementId || null,
          purpose: dto.purpose.trim().toUpperCase(),
          referenceNumber: dto.referenceNumber?.trim() || null,
          notes: dto.remarks?.trim() || null,
          createdById: userId || null,
        },
        include: {
          party: true,
          lot: true,
        },
      });

      // 5. Update StockBalance
      await tx.stockBalance.upsert({
        where: {
          lotId_locationId: {
            lotId: lot.id,
            locationId: defaultLoc.id,
          },
        },
        update: {
          quantityKg: newWeight,
          bagsCount: newBags,
        },
        create: {
          lotId: lot.id,
          locationId: defaultLoc.id,
          quantityKg: newWeight,
          bagsCount: newBags,
        },
      });

      // 6. Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'ISSUE_YARN',
          module: 'INVENTORY',
          entityType: 'Transaction',
          entityId: transaction.id,
          oldValue: { currentWeightKg: lot.currentWeightKg, currentBags: lot.currentBags },
          newValue: {
            transactionNumber: transaction.transactionNumber,
            lotNumber: lot.lotNumber,
            issuedKg: dto.kilos,
            issuedBags: dto.bags,
            purpose: dto.purpose,
            poNumber: dto.poNumber,
            remainingWeightKg: newWeight,
            remainingBags: newBags,
          },
          metadata: { lotId: lot.id, partyId: party.id },
        },
      });

      return {
        transaction,
        remainingStock: {
          lotNumber: updatedLot.lotNumber,
          currentWeightKg: updatedLot.currentWeightKg,
          currentBags: updatedLot.currentBags,
        },
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 4. RETURN STOCK (FROM PRODUCTION)
  // ---------------------------------------------------------------------------
  async returnStock(dto: ReturnStockDto, userId?: string) {
    const origTx = await this.prisma.transaction.findUnique({
      where: { id: dto.referenceTransactionId },
      include: {
        lot: true,
        party: true,
        referencedBy: {
          where: { type: TransactionType.RETURN },
        },
      },
    });

    if (!origTx) {
      throw new NotFoundException(
        `Original issue transaction with ID "${dto.referenceTransactionId}" not found`,
      );
    }

    if (origTx.type !== TransactionType.ISSUED) {
      throw new BadRequestException(
        `Cannot return against transaction "${origTx.transactionNumber}" of type "${origTx.type}". Returns must reference an ISSUED transaction.`,
      );
    }

    // Calculate total already returned against this issue
    const alreadyReturnedKg = origTx.referencedBy.reduce((acc, ret) => acc + Number(ret.kilos), 0);
    const origIssuedKg = Number(origTx.kilos);
    const maxReturnableKg = origIssuedKg - alreadyReturnedKg;

    if (dto.kilos > maxReturnableKg + 0.0001) {
      throw new BadRequestException(
        `Return quantity (${dto.kilos.toFixed(2)} KG) exceeds eligible return balance. Original Issue: ${origIssuedKg.toFixed(2)} KG, Already Returned: ${alreadyReturnedKg.toFixed(2)} KG, Max Eligible Return: ${maxReturnableKg.toFixed(2)} KG.`,
      );
    }

    const txDate = dto.transactionDate ? new Date(dto.transactionDate) : new Date();
    const kgDecimal = new Prisma.Decimal(dto.kilos);

    return this.prisma.$transaction(async (tx) => {
      const defaultLoc = await this.getOrCreateDefaultLocation(tx);

      // Increment Lot balance
      const lot = await tx.lot.findUnique({
        where: { id: origTx.lotId! },
      });

      if (!lot) {
        throw new NotFoundException(`Lot for transaction "${origTx.transactionNumber}" not found`);
      }

      const updatedLot = await tx.lot.update({
        where: { id: lot.id },
        data: {
          currentWeightKg: Prisma.Decimal.add(lot.currentWeightKg, kgDecimal),
          currentBags: lot.currentBags + dto.bags,
          status: LotStatus.APPROVED,
        },
      });

      // If issue was tied to a PO requirement, decrement requirement.issuedKg
      if (origTx.poRequirementId) {
        const poReq = await tx.pORequirement.findUnique({
          where: { id: origTx.poRequirementId },
        });
        if (poReq) {
          const newIssuedKg = Prisma.Decimal.sub(poReq.issuedKg, kgDecimal);
          await tx.pORequirement.update({
            where: { id: poReq.id },
            data: {
              issuedKg: newIssuedKg.greaterThan(0) ? newIssuedKg : new Prisma.Decimal(0),
            },
          });
        }
      }

      // Create RETURN transaction
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: this.generateTxNumber('RET'),
          type: TransactionType.RETURN,
          transactionDate: txDate,
          yarnCount: origTx.yarnCount || dto.count || lot.yarnCount,
          partyId: origTx.partyId,
          lotId: lot.id,
          bags: dto.bags,
          kilos: kgDecimal,
          poNumber: origTx.poNumber,
          poRequirementId: origTx.poRequirementId,
          purpose: origTx.purpose,
          referenceTransactionId: origTx.id,
          referenceNumber: dto.referenceNumber?.trim() || null,
          notes: dto.remarks?.trim() || `Return against Issue ${origTx.transactionNumber}`,
          createdById: userId || null,
        },
        include: {
          party: true,
          lot: true,
          referenceTransaction: true,
        },
      });

      // Update StockBalance
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

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'RETURN_YARN',
          module: 'INVENTORY',
          entityType: 'Transaction',
          entityId: transaction.id,
          newValue: {
            transactionNumber: transaction.transactionNumber,
            returnedKg: dto.kilos,
            returnedBags: dto.bags,
            originalIssueNumber: origTx.transactionNumber,
            newLotBalanceKg: updatedLot.currentWeightKg,
          },
          metadata: { lotId: lot.id, referenceTransactionId: origTx.id },
        },
      });

      return transaction;
    });
  }

  // ---------------------------------------------------------------------------
  // 5. RETIRE STOCK (DAMAGE / CONTAMINATION / AUDIT WRITE-OFF)
  // ---------------------------------------------------------------------------
  async retireStock(dto: RetireStockDto, userId?: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { lotNumber: dto.lotNumber.trim() },
      include: { supplier: true },
    });

    if (!lot) {
      throw new NotFoundException(`Lot "${dto.lotNumber}" not found in inventory`);
    }

    const kgDecimal = new Prisma.Decimal(dto.kilos);

    if (lot.currentWeightKg.lessThan(kgDecimal)) {
      throw new BadRequestException(
        `Insufficient stock in Lot "${lot.lotNumber}". Available: ${lot.currentWeightKg.toFixed(2)} KG, Requested for retirement: ${dto.kilos.toFixed(2)} KG.`,
      );
    }

    if (lot.currentBags < dto.bags) {
      throw new BadRequestException(
        `Insufficient bags in Lot "${lot.lotNumber}". Available: ${lot.currentBags} bags, Requested for retirement: ${dto.bags} bags.`,
      );
    }

    const txDate = dto.transactionDate ? new Date(dto.transactionDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const defaultLoc = await this.getOrCreateDefaultLocation(tx);

      const newWeight = Prisma.Decimal.sub(lot.currentWeightKg, kgDecimal);
      const newBags = lot.currentBags - dto.bags;
      
      const updatedLotCount = await tx.lot.updateMany({
        where: { 
          id: lot.id,
          currentWeightKg: { gte: kgDecimal },
          currentBags: { gte: dto.bags },
        },
        data: {
          currentWeightKg: { decrement: kgDecimal },
          currentBags: { decrement: dto.bags },
          status: newWeight.isZero() ? LotStatus.RETIRED : lot.status,
        },
      });

      if (updatedLotCount.count === 0) {
        throw new BadRequestException(
          `Concurrent stock update detected or insufficient balance in Lot "${lot.lotNumber}".`
        );
      }

      // Create RETIRED transaction
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: this.generateTxNumber('WOF'),
          type: TransactionType.RETIRED,
          transactionDate: txDate,
          yarnCount: lot.yarnCount || dto.count || null,
          partyId: lot.supplierId || dto.partyId || null,
          lotId: lot.id,
          bags: dto.bags,
          kilos: kgDecimal,
          correctionReason: dto.reason.trim(),
          notes: dto.reason.trim(),
          referenceNumber: dto.referenceNumber?.trim() || null,
          createdById: userId || null,
        },
        include: {
          party: true,
          lot: true,
        },
      });

      // Update StockBalance
      await tx.stockBalance.upsert({
        where: {
          lotId_locationId: {
            lotId: lot.id,
            locationId: defaultLoc.id,
          },
        },
        update: {
          quantityKg: newWeight,
          bagsCount: newBags,
        },
        create: {
          lotId: lot.id,
          locationId: defaultLoc.id,
          quantityKg: newWeight,
          bagsCount: newBags,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'RETIRE_STOCK',
          module: 'INVENTORY',
          entityType: 'Transaction',
          entityId: transaction.id,
          oldValue: { currentWeightKg: lot.currentWeightKg, currentBags: lot.currentBags },
          newValue: {
            transactionNumber: transaction.transactionNumber,
            retiredKg: dto.kilos,
            retiredBags: dto.bags,
            reason: dto.reason,
            remainingWeightKg: newWeight,
          },
          metadata: { lotId: lot.id },
        },
      });

      return transaction;
    });
  }

  // ---------------------------------------------------------------------------
  // 6. SELL STOCK (EXTERNAL COMMERCIAL SALE)
  // ---------------------------------------------------------------------------
  async sellStock(dto: SellStockDto, userId?: string) {
    const party = await this.prisma.party.findUnique({
      where: { id: dto.partyId },
    });

    if (!party) {
      throw new NotFoundException(`Customer Party with ID "${dto.partyId}" not found`);
    }

    const lot = await this.prisma.lot.findUnique({
      where: { lotNumber: dto.lotNumber.trim() },
    });

    if (!lot) {
      throw new NotFoundException(`Lot "${dto.lotNumber}" not found in inventory`);
    }

    const kgDecimal = new Prisma.Decimal(dto.kilos);

    if (lot.currentWeightKg.lessThan(kgDecimal)) {
      throw new BadRequestException(
        `Insufficient stock in Lot "${lot.lotNumber}". Available: ${lot.currentWeightKg.toFixed(2)} KG, Requested for sale: ${dto.kilos.toFixed(2)} KG.`,
      );
    }

    if (lot.currentBags < dto.bags) {
      throw new BadRequestException(
        `Insufficient bags in Lot "${lot.lotNumber}". Available: ${lot.currentBags} bags, Requested for sale: ${dto.bags} bags.`,
      );
    }

    const txDate = dto.transactionDate ? new Date(dto.transactionDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const defaultLoc = await this.getOrCreateDefaultLocation(tx);

      const newWeight = Prisma.Decimal.sub(lot.currentWeightKg, kgDecimal);
      const newBags = lot.currentBags - dto.bags;
      
      const updatedLotCount = await tx.lot.updateMany({
        where: { 
          id: lot.id,
          currentWeightKg: { gte: kgDecimal },
          currentBags: { gte: dto.bags },
        },
        data: {
          currentWeightKg: { decrement: kgDecimal },
          currentBags: { decrement: dto.bags },
          status: newWeight.isZero() ? LotStatus.EXHAUSTED : lot.status,
        },
      });

      if (updatedLotCount.count === 0) {
        throw new BadRequestException(
          `Concurrent stock update detected or insufficient balance in Lot "${lot.lotNumber}".`
        );
      }

      // Create SOLD transaction
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: this.generateTxNumber('SLD'),
          type: TransactionType.SOLD,
          transactionDate: txDate,
          yarnCount: dto.count.trim(),
          partyId: party.id,
          lotId: lot.id,
          bags: dto.bags,
          kilos: kgDecimal,
          referenceNumber: dto.referenceNumber?.trim() || null,
          notes: dto.remarks?.trim() || `Commercial Sale to ${party.name}`,
          createdById: userId || null,
        },
        include: {
          party: true,
          lot: true,
        },
      });

      // Update StockBalance
      await tx.stockBalance.upsert({
        where: {
          lotId_locationId: {
            lotId: lot.id,
            locationId: defaultLoc.id,
          },
        },
        update: {
          quantityKg: newWeight,
          bagsCount: newBags,
        },
        create: {
          lotId: lot.id,
          locationId: defaultLoc.id,
          quantityKg: newWeight,
          bagsCount: newBags,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'SELL_YARN',
          module: 'INVENTORY',
          entityType: 'Transaction',
          entityId: transaction.id,
          oldValue: { currentWeightKg: lot.currentWeightKg, currentBags: lot.currentBags },
          newValue: {
            transactionNumber: transaction.transactionNumber,
            soldKg: dto.kilos,
            soldBags: dto.bags,
            customer: party.name,
            invoiceNumber: dto.referenceNumber,
            remainingWeightKg: newWeight,
          },
          metadata: { lotId: lot.id, partyId: party.id },
        },
      });

      return transaction;
    });
  }

  // ---------------------------------------------------------------------------
  // 7. CORRECTION / REVERSAL (PRESERVE ORIGINAL LEDGER INTEGRITY)
  // ---------------------------------------------------------------------------
  async correctTransaction(dto: CorrectionDto, userId?: string) {
    const origTx = await this.prisma.transaction.findUnique({
      where: { id: dto.referenceTransactionId },
      include: {
        lot: true,
        party: true,
        referencedBy: {
          where: { type: TransactionType.CORRECTION },
        },
      },
    });
    if (!origTx) {
      throw new NotFoundException(`Original transaction "${dto.referenceTransactionId}" not found`);
    }

    if (origTx.type === TransactionType.CORRECTION) {
      throw new BadRequestException(
        'Cannot reverse or correct a CORRECTION transaction directly.',
      );
    }

    if (origTx.type === TransactionType.OPENING) {
      throw new BadRequestException(
        'OPENING baseline transactions are immutable and cannot be corrected or reversed.',
      );
    }

    if (origTx.referencedBy && origTx.referencedBy.length > 0) {
      throw new ConflictException(
        `Transaction ${origTx.transactionNumber} has already been corrected.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const defaultLoc = await this.getOrCreateDefaultLocation(tx);

      // 1. Calculate reversal impact on Lot balance
      const origKg = origTx.kilos;
      const origBags = origTx.bags;
      const lot = await tx.lot.findUnique({
        where: { id: origTx.lotId! },
      });

      if (!lot) {
        throw new NotFoundException(`Lot for transaction "${origTx.transactionNumber}" not found`);
      }

      let updatedWeight = lot.currentWeightKg;
      let updatedBags = lot.currentBags;

      // Inward types add stock, so reversing them subtracts stock
      if (
        origTx.type === TransactionType.OPENING ||
        origTx.type === TransactionType.RECEIVED ||
        origTx.type === TransactionType.RETURN
      ) {
        if (lot.currentWeightKg.lessThan(origKg)) {
          throw new BadRequestException(
            `Cannot reverse transaction "${origTx.transactionNumber}". Resulting lot stock would become negative (${Prisma.Decimal.sub(lot.currentWeightKg, origKg).toFixed(2)} KG).`,
          );
        }
        updatedWeight = Prisma.Decimal.sub(lot.currentWeightKg, origKg);
        updatedBags = lot.currentBags - origBags;
      }
      // Outward types decrease stock, so reversing them adds stock back
      else if (
        origTx.type === TransactionType.ISSUED ||
        origTx.type === TransactionType.RETIRED ||
        origTx.type === TransactionType.SOLD
      ) {
        updatedWeight = Prisma.Decimal.add(lot.currentWeightKg, origKg);
        updatedBags = lot.currentBags + origBags;
      }

      // Update lot with reversal
      await tx.lot.update({
        where: { id: lot.id },
        data: {
          currentWeightKg: updatedWeight,
          currentBags: updatedBags,
        },
      });

      // 2. Create REVERSAL transaction
      const reversalTx = await tx.transaction.create({
        data: {
          transactionNumber: this.generateTxNumber('REV'),
          type: TransactionType.CORRECTION,
          transactionDate: new Date(),
          yarnCount: origTx.yarnCount,
          partyId: origTx.partyId,
          lotId: origTx.lotId,
          bags: -origBags,
          kilos: Prisma.Decimal.mul(origKg, -1),
          poNumber: origTx.poNumber,
          purpose: origTx.purpose,
          referenceTransactionId: origTx.id,
          correctionReason: dto.reason.trim(),
          notes: `Reversal of ${origTx.transactionNumber}: ${dto.reason.trim()}`,
          oldValue: {
            originalTransactionNumber: origTx.transactionNumber,
            originalType: origTx.type,
            originalKilos: origTx.kilos,
            originalBags: origTx.bags,
          },
          newValue: {
            reversalKg: Prisma.Decimal.mul(origKg, -1),
            reason: dto.reason,
          },
          createdById: userId || null,
        },
      });

      // 3. If corrected values are provided, create the new replacement transaction
      let correctedTx = null;
      if (dto.correctedKilos && dto.correctedKilos > 0) {
        const newPartyId = dto.correctedPartyId || origTx.partyId!;
        const newCount = dto.correctedCount || origTx.yarnCount || lot.yarnCount || '1/10 KW';
        const newBags = dto.correctedBags !== undefined ? dto.correctedBags : origBags;
        const newKg = new Prisma.Decimal(dto.correctedKilos);

        // Re-apply new transaction logic on lot
        if (
          origTx.type === TransactionType.OPENING ||
          origTx.type === TransactionType.RECEIVED ||
          origTx.type === TransactionType.RETURN
        ) {
          updatedWeight = Prisma.Decimal.add(updatedWeight, newKg);
          updatedBags = updatedBags + newBags;
        } else {
          if (updatedWeight.lessThan(newKg)) {
            throw new BadRequestException(
              `Replacement transaction exceeds available stock (${updatedWeight.toFixed(2)} KG available, ${dto.correctedKilos} requested).`,
            );
          }
          updatedWeight = Prisma.Decimal.sub(updatedWeight, newKg);
          updatedBags = updatedBags - newBags;
        }

        await tx.lot.update({
          where: { id: lot.id },
          data: {
            currentWeightKg: updatedWeight,
            currentBags: updatedBags,
          },
        });

        correctedTx = await tx.transaction.create({
          data: {
            transactionNumber: this.generateTxNumber('COR'),
            type: origTx.type,
            transactionDate: new Date(),
            yarnCount: newCount,
            partyId: newPartyId,
            lotId: lot.id,
            bags: newBags,
            kilos: newKg,
            poNumber: dto.correctedPoNumber || origTx.poNumber,
            purpose: dto.correctedPurpose || origTx.purpose,
            referenceTransactionId: origTx.id,
            correctionReason: dto.reason.trim(),
            notes: dto.remarks?.trim() || `Corrected replacement for ${origTx.transactionNumber}`,
            createdById: userId || null,
          },
        });
      }

      // Update StockBalance
      await tx.stockBalance.upsert({
        where: {
          lotId_locationId: {
            lotId: lot.id,
            locationId: defaultLoc.id,
          },
        },
        update: {
          quantityKg: updatedWeight,
          bagsCount: updatedBags,
        },
        create: {
          lotId: lot.id,
          locationId: defaultLoc.id,
          quantityKg: updatedWeight,
          bagsCount: updatedBags,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'CORRECT_TRANSACTION',
          module: 'INVENTORY',
          entityType: 'Transaction',
          entityId: origTx.id,
          oldValue: {
            transactionNumber: origTx.transactionNumber,
            kilos: origTx.kilos,
            bags: origTx.bags,
          },
          newValue: {
            reversalNumber: reversalTx.transactionNumber,
            correctedNumber: correctedTx?.transactionNumber || null,
            reason: dto.reason,
            finalLotWeightKg: updatedWeight,
          },
          metadata: { originalTransactionId: origTx.id },
        },
      });

      return {
        reversalTransaction: reversalTx,
        correctedTransaction: correctedTx,
        message: 'Transaction reversed and corrected successfully with complete audit trail',
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 8. GET STOCK SUMMARY (KPI METRICS) - HIGH-PERFORMANCE POSTGRESQL AGGREGATION
  // ---------------------------------------------------------------------------
  async getStockSummary() {
    const [lotAgg, activeLotsCount, totalParties, totalTransactions, recentTransactions] =
      await Promise.all([
        // Database-level sum of current lot balances
        this.prisma.lot.aggregate({
          _sum: {
            currentWeightKg: true,
            currentBags: true,
          },
        }),
        // Count of lots with positive balance
        this.prisma.lot.count({
          where: { currentWeightKg: { gt: 0 } },
        }),
        // Active parties count
        this.prisma.party.count({
          where: { isActive: true },
        }),
        // Total transactions count
        this.prisma.transaction.count(),
        // 5 most recent transactions with selective fields
        this.prisma.transaction.findMany({
          take: 5,
          orderBy: { transactionDate: 'desc' },
          select: {
            id: true,
            transactionNumber: true,
            transactionDate: true,
            type: true,
            yarnCount: true,
            bags: true,
            kilos: true,
            lot: { select: { lotNumber: true } },
            party: { select: { name: true } },
          },
        }),
      ]);

    const totalWeightKg = Number(Number(lotAgg._sum.currentWeightKg || 0).toFixed(4));
    const totalBags = lotAgg._sum.currentBags || 0;

    return {
      totalWeightKg,
      totalBags,
      activeLotsCount,
      totalParties,
      totalTransactions,
      recentTransactions,
    };
  }

  // ---------------------------------------------------------------------------
  // 9. GET LOTS (DERIVED LOT-WISE STOCK)
  // ---------------------------------------------------------------------------
  async getLots(filter: InventoryFilterDto = {}) {
    const where: Prisma.LotWhereInput = {};

    if (filter.search && filter.search.trim()) {
      const query = filter.search.trim();
      where.OR = [
        { lotNumber: { contains: query, mode: 'insensitive' } },
        { yarnCount: { contains: query, mode: 'insensitive' } },
        { supplier: { name: { contains: query, mode: 'insensitive' } } },
        { millLotNumber: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (filter.count && filter.count.trim()) {
      where.yarnCount = { contains: filter.count.trim(), mode: 'insensitive' };
    }

    if (filter.partyId && filter.partyId.trim()) {
      where.supplierId = filter.partyId.trim();
    }

    if (filter.lotNumber && filter.lotNumber.trim()) {
      where.lotNumber = { contains: filter.lotNumber.trim(), mode: 'insensitive' };
    }

    const lots = await this.prisma.lot.findMany({
      where,
      include: {
        supplier: true,
        parentLot: true,
      },
      orderBy: { receivedDate: 'desc' },
    });

    const lotIds = lots.map((l) => l.id);
    const aggregates =
      lotIds.length > 0
        ? await this.prisma.transaction.groupBy({
            by: ['lotId', 'type'],
            where: { lotId: { in: lotIds } },
            _sum: { kilos: true },
          })
        : [];

    const aggMap = new Map<string, Record<string, number>>();
    for (const agg of aggregates) {
      if (agg.lotId) {
        if (!aggMap.has(agg.lotId)) {
          aggMap.set(agg.lotId, {});
        }
        aggMap.get(agg.lotId)![agg.type] = Number(agg._sum.kilos || 0);
      }
    }

    return lots.map((lot) => {
      const lotAgg = aggMap.get(lot.id) || {};
      const totalInKg =
        (lotAgg[TransactionType.OPENING] || 0) + (lotAgg[TransactionType.RECEIVED] || 0);
      const totalIssuedKg = lotAgg[TransactionType.ISSUED] || 0;
      const totalReturnedKg = lotAgg[TransactionType.RETURN] || 0;
      const totalRetiredKg = lotAgg[TransactionType.RETIRED] || 0;
      const totalSoldKg = lotAgg[TransactionType.SOLD] || 0;

      return {
        id: lot.id,
        lotNumber: lot.lotNumber,
        count: lot.yarnCount || '1/10 KW',
        party: lot.supplier
          ? {
              id: lot.supplier.id,
              name: lot.supplier.name,
              code: lot.supplier.code,
              contactPerson: lot.supplier.contactPerson || null,
              phone: lot.supplier.phone || null,
              email: lot.supplier.email || null,
            }
          : null,
        parentLot: lot.parentLot
          ? { id: lot.parentLot.id, lotNumber: lot.parentLot.lotNumber }
          : null,
        initialWeightKg: Number(lot.initialWeightKg.toFixed(4)),
        initialBags: lot.initialBags,
        totalInKg: Number(totalInKg.toFixed(4)),
        totalIssuedKg: Number(totalIssuedKg.toFixed(4)),
        totalReturnedKg: Number(totalReturnedKg.toFixed(4)),
        totalRetiredKg: Number(totalRetiredKg.toFixed(4)),
        totalSoldKg: Number(totalSoldKg.toFixed(4)),
        currentWeightKg: Number(lot.currentWeightKg.toFixed(4)),
        currentBags: lot.currentBags,
        status: lot.status,
        millLotNumber: lot.millLotNumber,
        shadeCode: lot.shadeCode,
        receivedDate: lot.receivedDate,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 10. GET TRANSACTIONS (PAGINATED & FILTERED LEDGER)
  // ---------------------------------------------------------------------------
  async getTransactions(filter: InventoryFilterDto = {}) {
    const where: Prisma.TransactionWhereInput = {};

    if (filter.search && filter.search.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { transactionNumber: { contains: q, mode: 'insensitive' } },
        { yarnCount: { contains: q, mode: 'insensitive' } },
        { poNumber: { contains: q, mode: 'insensitive' } },
        { purpose: { contains: q, mode: 'insensitive' } },
        { lot: { lotNumber: { contains: q, mode: 'insensitive' } } },
        { party: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (filter.count && filter.count.trim()) {
      where.yarnCount = { contains: filter.count.trim(), mode: 'insensitive' };
    }

    if (filter.partyId && filter.partyId.trim()) {
      where.partyId = filter.partyId.trim();
    }

    if (filter.lotNumber && filter.lotNumber.trim()) {
      where.lot = { lotNumber: { contains: filter.lotNumber.trim(), mode: 'insensitive' } };
    }

    if (filter.type) {
      where.type = filter.type;
    }

    if (filter.purpose && filter.purpose.trim()) {
      where.purpose = { contains: filter.purpose.trim(), mode: 'insensitive' };
    }

    if (filter.poNumber && filter.poNumber.trim()) {
      where.poNumber = { contains: filter.poNumber.trim(), mode: 'insensitive' };
    }

    if (filter.startDate || filter.endDate) {
      where.transactionDate = {};
      if (filter.startDate) {
        where.transactionDate.gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        const end = new Date(filter.endDate);
        end.setHours(23, 59, 59, 999);
        where.transactionDate.lte = end;
      }
    }

    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { transactionDate: 'desc' },
        include: {
          party: true,
          lot: true,
          referenceTransaction: true,
          referencedBy: {
            where: { type: TransactionType.CORRECTION },
            select: { id: true },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const formatted = items.map((tx) => ({
      id: tx.id,
      transactionNumber: tx.transactionNumber,
      transactionDate: tx.transactionDate,
      type: tx.type,
      status: tx.status,
      count: tx.yarnCount || (tx.lot ? tx.lot.yarnCount : '—'),
      party: tx.party
        ? {
            id: tx.party.id,
            name: tx.party.name,
            code: tx.party.code,
            contactPerson: tx.party.contactPerson || null,
            phone: tx.party.phone || null,
            email: tx.party.email || null,
          }
        : null,
      lotNumber: tx.lot ? tx.lot.lotNumber : '—',
      bags: tx.bags,
      kilos: Number(tx.kilos.toFixed(4)),
      poNumber: tx.poNumber || null,
      purpose: tx.purpose || null,
      referenceNumber: tx.referenceNumber || null,
      referenceTransaction: tx.referenceTransaction
        ? {
            id: tx.referenceTransaction.id,
            transactionNumber: tx.referenceTransaction.transactionNumber,
            type: tx.referenceTransaction.type,
          }
        : null,
      correctionReason: tx.correctionReason || null,
      isCorrected: tx.referencedBy && tx.referencedBy.length > 0,
      notes: tx.notes || null,
      createdBy: tx.createdBy ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}` : 'System',
      createdAt: tx.createdAt,
    }));

    return {
      items: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 11. EXPORT INVENTORY (XLSX / CSV)
  // ---------------------------------------------------------------------------
  async exportInventory(format: 'xlsx' | 'csv' = 'xlsx', filter: InventoryFilterDto = {}) {
    const { items } = await this.getTransactions({ ...filter, page: 1, limit: 10000 });
    const lots = await this.getLots(filter);

    // Prepare Transactions Sheet
    const txRows = items.map((t) => ({
      Date: new Date(t.transactionDate).toISOString().split('T')[0],
      'Transaction No': t.transactionNumber,
      Type: t.type,
      Count: t.count,
      'Party / Supplier': t.party?.name || '—',
      'Lot No': t.lotNumber,
      Bags: t.bags,
      KG: t.kilos,
      'PO Number': t.poNumber || '—',
      Purpose: t.purpose || '—',
      'Ref Number': t.referenceNumber || '—',
      'Remarks / Reason': t.notes || t.correctionReason || '—',
      'Logged By': t.createdBy,
    }));

    // Prepare Lots Stock Sheet
    const lotRows = lots.map((l) => ({
      'Lot Number': l.lotNumber,
      'Yarn Count': l.count,
      'Supplier / Party': l.party?.name || '—',
      'Initial Bags': l.initialBags,
      'Initial KG': l.initialWeightKg,
      'Total Received KG': l.totalInKg,
      'Total Issued KG': l.totalIssuedKg,
      'Total Returned KG': l.totalReturnedKg,
      'Total Retired KG': l.totalRetiredKg,
      'Total Sold KG': l.totalSoldKg,
      'Current Balance KG': l.currentWeightKg,
      'Current Bags': l.currentBags,
      Status: l.status,
    }));

    const workbook = XLSX.utils.book_new();

    const wsTx = XLSX.utils.json_to_sheet(txRows);
    XLSX.utils.book_append_sheet(workbook, wsTx, 'Transactions Ledger');

    const wsLots = XLSX.utils.json_to_sheet(lotRows);
    XLSX.utils.book_append_sheet(workbook, wsLots, 'Lot Stock Summary');

    if (format === 'csv') {
      const csvContent = XLSX.utils.sheet_to_csv(wsTx);
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        contentType: 'text/csv',
        filename: `yarntrace_inventory_${new Date().toISOString().split('T')[0]}.csv`,
      };
    }

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      buffer: excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `yarntrace_inventory_${new Date().toISOString().split('T')[0]}.xlsx`,
    };
  }

  // ---------------------------------------------------------------------------
  // 12. GET ACTIVE PO REQUIREMENTS (FOR AUTOCOMPLETE & 103% PO RULES)
  // ---------------------------------------------------------------------------
  async getPoRequirements(poNumber?: string) {
    const where: Prisma.PORequirementWhereInput = {};

    if (poNumber && poNumber.trim()) {
      where.OR = [
        { poNumber: { contains: poNumber.trim(), mode: 'insensitive' } },
        { purchaseOrder: { poNumber: { contains: poNumber.trim(), mode: 'insensitive' } } },
      ];
    }

    const requirements = await this.prisma.pORequirement.findMany({
      where,
      include: {
        purchaseOrder: {
          include: { party: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return requirements.map((r) => {
      const reqKg = Number(r.requiredKg);
      const issuedKg = Number(r.issuedKg);
      const ceilingKg = Number((reqKg * 1.03).toFixed(4));
      const remainingEligibleKg = Number(Math.max(0, ceilingKg - issuedKg).toFixed(4));

      return {
        id: r.id,
        poNumber: r.poNumber || r.purchaseOrder?.poNumber || '—',
        yarnCount: r.yarnCount || '—',
        purpose: r.purpose || '—',
        party: r.purchaseOrder?.party ? { name: r.purchaseOrder.party.name } : null,
        requiredKg: reqKg,
        issuedKg: issuedKg,
        ceiling103Kg: ceilingKg,
        remainingEligibleKg: remainingEligibleKg,
        isCeilingReached: issuedKg >= ceilingKg,
      };
    });
  }
}
