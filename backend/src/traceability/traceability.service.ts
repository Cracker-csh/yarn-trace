import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType, LotStatus } from '@prisma/client';

export interface TraceSummary {
  sourceKg: number;
  openingKg: number;
  receivedKg: number;
  issuedKg: number;
  returnedKg: number;
  soldKg: number;
  retiredKg: number;
  allocatedKg: number;
  consumedKg: number;
  wasteKg: number;
  productionReturnedKg: number;
  currentMainStockKg: number;
  currentMainStockBags: number;
  currentTeamStockKg: number;
  totalOutputKg: number;
  reconciled: boolean;
  statusBadge: string;
}

export interface TimelineNode {
  id: string;
  type:
    | 'PARENT_LOT'
    | 'CHILD_LOT'
    | 'OPENING'
    | 'RECEIVED'
    | 'ISSUED'
    | 'RETURN'
    | 'RETURNED'
    | 'SOLD'
    | 'RETIRED'
    | 'CORRECTION'
    | 'ALLOCATED'
    | 'CONSUMED'
    | 'PRODUCTION_OUTPUT'
    | 'DELIVERED';
  title: string;
  description: string;
  date: string | Date;
  quantityKg?: number | null;
  bags?: number | null;
  status?: string | null;
  partyName?: string | null;
  teamName?: string | null;
  department?: string | null;
  workOrderNumber?: string | null;
  workOrderId?: string | null;
  productName?: string | null;
  productCode?: string | null;
  poNumber?: string | null;
  purpose?: string | null;
  referenceNumber?: string | null;
  transactionNumber?: string | null;
  actor?: string | null;
  metadata?: Record<string, any>;
}

@Injectable()
export class TraceabilityService {
  private forwardCache = new Map<string, { timestamp: number; data: any }>();
  private backwardCache = new Map<string, { timestamp: number; data: any }>();
  private readonly CACHE_TTL_MS = 30000; // 30s TTL

  constructor(private readonly prisma: PrismaService) {}

  public invalidateCache(key?: string) {
    if (key) {
      const lower = key.trim().toLowerCase();
      this.forwardCache.delete(lower);
      this.backwardCache.delete(lower);
    } else {
      this.forwardCache.clear();
      this.backwardCache.clear();
    }
  }

  // ===========================================================================
  // 1. FORWARD TRACE (LOT -> MOVEMENTS -> TEAM -> WORK ORDER -> OUTPUT -> PARTY)
  // ===========================================================================

  async traceForwardByLot(identifier: string) {
    const trimmed = identifier.trim();
    const cacheKey = trimmed.toLowerCase();

    const cached = this.forwardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    // 1. Find Lot by lotNumber (case-insensitive) or internal UUID
    const lot = await this.prisma.lot.findFirst({
      where: {
        OR: [
          { lotNumber: { equals: trimmed, mode: 'insensitive' } },
          { id: trimmed },
        ],
      },
      include: {
        yarn: true,
        supplier: true,
        parentLot: {
          include: {
            yarn: true,
            supplier: true,
            transactions: {
              where: { type: { in: [TransactionType.OPENING, TransactionType.RECEIVED] } },
              take: 1,
              orderBy: { transactionDate: 'asc' },
            },
          },
        },
        childLots: {
          include: {
            yarn: true,
            supplier: true,
          },
        },
        stockBalances: {
          include: { location: true },
        },
        transactions: {
          orderBy: { transactionDate: 'asc' },
          include: {
            party: true,
            createdBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            referenceTransaction: true,
            referencedBy: true,
          },
        },
        yarnAllocations: {
          orderBy: { allocatedDate: 'asc' },
          include: {
            productionTeam: true,
            inventoryTransaction: true,
            productionOrder: {
              include: {
                party: true,
                productionTeam: true,
                outputs: {
                  orderBy: { outputDate: 'asc' },
                  include: {
                    recordedBy: { select: { firstName: true, lastName: true } },
                  },
                },
                products: {
                  include: {
                    deliveries: {
                      orderBy: { dispatchDate: 'asc' },
                      include: { party: true },
                    },
                  },
                },
              },
            },
            consumptionRecords: {
              orderBy: { consumptionDate: 'asc' },
              include: {
                recordedBy: { select: { firstName: true, lastName: true } },
              },
            },
            returns: {
              orderBy: { returnDate: 'asc' },
              include: {
                inventoryTransaction: true,
                recordedBy: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        consumptionRecords: {
          orderBy: { consumptionDate: 'asc' },
          include: {
            productionOrder: {
              include: {
                party: true,
                productionTeam: true,
              },
            },
            productionTeam: true,
            recordedBy: { select: { firstName: true, lastName: true } },
          },
        },
        productionReturns: {
          orderBy: { returnDate: 'asc' },
          include: {
            productionOrder: true,
            productionTeam: true,
            inventoryTransaction: true,
            recordedBy: { select: { firstName: true, lastName: true } },
          },
        },
        dyeingMovements: {
          include: {
            dyeingOrder: { include: { dyeingMill: true } },
          },
        },
      },
    });

    if (!lot) {
      throw new NotFoundException(
        `Yarn lot "${trimmed}" was not found in the inventory database. Please verify the lot number or select from active lots.`,
      );
    }

    // 2. Compute Quantity Reconciliation
    let openingKg = 0;
    let receivedKg = 0;
    let issuedKg = 0;
    let returnedKg = 0;
    let soldKg = 0;
    let retiredKg = 0;

    const sources: any[] = [];
    const movements: any[] = [];

    for (const tx of lot.transactions) {
      const kg = Number(tx.kilos);
      movements.push({
        id: tx.id,
        transactionNumber: tx.transactionNumber,
        type: tx.type,
        status: tx.status,
        date: tx.transactionDate,
        kilos: kg,
        bags: tx.bags,
        partyName: tx.party?.name || '—',
        partyCode: tx.party?.code || null,
        poNumber: tx.poNumber || '—',
        purpose: tx.purpose || '—',
        referenceNumber: tx.referenceNumber || '—',
        referenceTransaction: tx.referenceTransaction
          ? {
              transactionNumber: tx.referenceTransaction.transactionNumber,
              type: tx.referenceTransaction.type,
              kilos: Number(tx.referenceTransaction.kilos),
            }
          : null,
        correctionReason: tx.correctionReason || null,
        notes: tx.notes || null,
        createdByName: tx.createdBy
          ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}`
          : 'System',
      });

      switch (tx.type) {
        case TransactionType.OPENING:
          openingKg += kg;
          sources.push(tx);
          break;
        case TransactionType.RECEIVED:
          receivedKg += kg;
          sources.push(tx);
          break;
        case TransactionType.ISSUED:
          issuedKg += kg;
          break;
        case TransactionType.RETURN:
        case TransactionType.RETURNED:
          returnedKg += kg;
          break;
        case TransactionType.SOLD:
          soldKg += kg;
          break;
        case TransactionType.RETIRED:
          retiredKg += kg;
          break;
        default:
          break;
      }
    }

    const sourceKg =
      sources.length > 0 ? openingKg + receivedKg : Number(lot.initialWeightKg);

    // Allocations across Work Orders
    let allocatedKg = 0;
    const workOrdersMap = new Map<string, any>();
    const teamsMap = new Map<string, any>();

    for (const alloc of lot.yarnAllocations) {
      const aKg = Number(alloc.allocatedKg);
      allocatedKg += aKg;

      // Group Team
      const t = alloc.productionTeam;
      if (!teamsMap.has(t.id)) {
        teamsMap.set(t.id, {
          id: t.id,
          code: t.code,
          name: t.name,
          department: t.department,
          teamLead: t.teamLead,
          allocatedKg: 0,
          consumedKg: 0,
          wasteKg: 0,
          returnedKg: 0,
          remainingKg: 0,
        });
      }
      const tEntry = teamsMap.get(t.id);
      tEntry.allocatedKg += aKg;

      // Group Work Order
      const wo = alloc.productionOrder;
      if (!workOrdersMap.has(wo.id)) {
        workOrdersMap.set(wo.id, {
          id: wo.id,
          orderNumber: wo.orderNumber,
          status: wo.status,
          priority: wo.priority,
          purpose: wo.purpose,
          productName: wo.productName,
          targetQuantity: Number(wo.targetQuantity),
          unit: wo.unit,
          partyName: wo.party?.name || '—',
          poNumber: wo.poNumber || '—',
          teamName: wo.productionTeam?.name || t.name,
          startDate: wo.startDate,
          targetDate: wo.targetDate,
          completedDate: wo.completedDate,
          allocatedKg: 0,
          consumedKg: 0,
          wasteKg: 0,
          returnedKg: 0,
          outputs: (wo.outputs || []).map((o: any) => ({
            id: o.id,
            productName: o.productName,
            productCode: o.productCode,
            outputQuantityKg: Number(o.outputQuantityKg),
            unit: o.unit,
            outputDate: o.outputDate,
            recordedByName: o.recordedBy
              ? `${o.recordedBy.firstName} ${o.recordedBy.lastName}`
              : 'System',
          })),
          products: (wo.products || []).map((p: any) => ({
            id: p.id,
            productCode: p.productCode,
            name: p.name,
            totalQuantityKg: Number(p.totalQuantityKg),
            availableKg: Number(p.availableKg),
            deliveries: (p.deliveries || []).map((d: any) => ({
              id: d.id,
              deliveryNumber: d.deliveryNumber,
              partyName: d.party?.name || '—',
              partyCode: d.party?.code || null,
              dispatchedKg: Number(d.dispatchedKg),
              status: d.status,
              dispatchDate: d.dispatchDate,
              vehicleNumber: d.vehicleNumber,
            })),
          })),
        });
      }
      const woEntry = workOrdersMap.get(wo.id);
      woEntry.allocatedKg += aKg;
    }

    // Floor Consumptions (Filtered non-corrected)
    let consumedKg = 0;
    let wasteKg = 0;
    const consumptions: any[] = [];

    for (const c of lot.consumptionRecords) {
      if (c.isCorrected) continue;
      const cKg = Number(c.consumedKg);
      const wKg = Number(c.wasteKg);
      consumedKg += cKg;
      wasteKg += wKg;

      if (c.productionTeamId && teamsMap.has(c.productionTeamId)) {
        const tEntry = teamsMap.get(c.productionTeamId);
        tEntry.consumedKg += cKg;
        tEntry.wasteKg += wKg;
      }

      if (c.productionOrderId && workOrdersMap.has(c.productionOrderId)) {
        const woEntry = workOrdersMap.get(c.productionOrderId);
        woEntry.consumedKg += cKg;
        woEntry.wasteKg += wKg;
      }

      consumptions.push({
        id: c.id,
        productionOrderId: c.productionOrderId,
        workOrderNumber: c.productionOrder?.orderNumber || '—',
        productionTeamName: c.productionTeam?.name || '—',
        consumedKg: cKg,
        wasteKg: wKg,
        wasteCategory: c.wasteCategory || '—',
        netProducedKg: c.netProducedKg ? Number(c.netProducedKg) : null,
        purpose: c.purpose || '—',
        consumptionDate: c.consumptionDate,
        recordedByName: c.recordedBy
          ? `${c.recordedBy.firstName} ${c.recordedBy.lastName}`
          : 'System',
        remarks: c.remarks,
      });
    }

    // Floor Returns
    let productionReturnedKg = 0;
    const productionReturns: any[] = [];

    for (const r of lot.productionReturns) {
      const rKg = Number(r.returnedKg);
      productionReturnedKg += rKg;

      if (r.productionTeamId && teamsMap.has(r.productionTeamId)) {
        const tEntry = teamsMap.get(r.productionTeamId);
        tEntry.returnedKg += rKg;
      }

      if (r.productionOrderId && workOrdersMap.has(r.productionOrderId)) {
        const woEntry = workOrdersMap.get(r.productionOrderId);
        woEntry.returnedKg += rKg;
      }

      productionReturns.push({
        id: r.id,
        productionOrderId: r.productionOrderId,
        workOrderNumber: r.productionOrder?.orderNumber || '—',
        productionTeamName: r.productionTeam?.name || '—',
        returnedKg: rKg,
        returnedBags: r.returnedBags,
        returnDate: r.returnDate,
        reason: r.reason || '—',
        inventoryTxNumber: r.inventoryTransaction?.transactionNumber || '—',
        recordedByName: r.recordedBy
          ? `${r.recordedBy.firstName} ${r.recordedBy.lastName}`
          : 'System',
      });
    }

    // Calculate Team Remaining Balances
    for (const t of teamsMap.values()) {
      t.remainingKg = Math.max(
        0,
        t.allocatedKg - t.consumedKg - t.wasteKg - t.returnedKg,
      );
    }

    const currentMainStockKg = Number(lot.currentWeightKg);
    const currentTeamStockKg = Math.max(
      0,
      allocatedKg - consumedKg - wasteKg - productionReturnedKg,
    );

    // Cumulative Output
    let totalOutputKg = 0;
    const allOutputs: any[] = [];
    const allProducts: any[] = [];
    const allDeliveries: any[] = [];

    for (const wo of workOrdersMap.values()) {
      for (const o of wo.outputs) {
        totalOutputKg += o.outputQuantityKg;
        allOutputs.push({
          ...o,
          workOrderNumber: wo.orderNumber,
          workOrderId: wo.id,
        });
      }
      for (const p of wo.products) {
        allProducts.push({
          ...p,
          workOrderNumber: wo.orderNumber,
          workOrderId: wo.id,
        });
        for (const d of p.deliveries) {
          allDeliveries.push({
            ...d,
            productName: p.name,
            productCode: p.productCode,
            workOrderNumber: wo.orderNumber,
          });
        }
      }
    }

    // Deterministic Status Badge
    let statusBadge = 'IN STOCK';
    if (soldKg > 0 && currentMainStockKg <= 0.0001) {
      statusBadge = 'SOLD';
    } else if (retiredKg > 0 && currentMainStockKg <= 0.0001) {
      statusBadge = 'RETIRED';
    } else if (
      consumedKg > 0 &&
      currentMainStockKg <= 0.0001 &&
      currentTeamStockKg <= 0.0001
    ) {
      statusBadge = 'FULLY CONSUMED';
    } else if (consumedKg > 0) {
      statusBadge = 'PARTIALLY CONSUMED';
    } else if (currentTeamStockKg > 0) {
      statusBadge = 'IN PRODUCTION';
    } else if (issuedKg > 0) {
      statusBadge = 'ISSUED';
    } else if (lot.status === LotStatus.APPROVED) {
      statusBadge = 'APPROVED';
    } else if (lot.status === LotStatus.RECEIVED) {
      statusBadge = 'RECEIVED';
    }

    const summary: TraceSummary = {
      sourceKg: Number(sourceKg.toFixed(4)),
      openingKg: Number(openingKg.toFixed(4)),
      receivedKg: Number(receivedKg.toFixed(4)),
      issuedKg: Number(issuedKg.toFixed(4)),
      returnedKg: Number(returnedKg.toFixed(4)),
      soldKg: Number(soldKg.toFixed(4)),
      retiredKg: Number(retiredKg.toFixed(4)),
      allocatedKg: Number(allocatedKg.toFixed(4)),
      consumedKg: Number(consumedKg.toFixed(4)),
      wasteKg: Number(wasteKg.toFixed(4)),
      productionReturnedKg: Number(productionReturnedKg.toFixed(4)),
      currentMainStockKg: Number(currentMainStockKg.toFixed(4)),
      currentMainStockBags: lot.currentBags,
      currentTeamStockKg: Number(currentTeamStockKg.toFixed(4)),
      totalOutputKg: Number(totalOutputKg.toFixed(4)),
      reconciled: true,
      statusBadge,
    };

    // 3. Build Unified Chronological Genealogy Timeline
    const timeline: TimelineNode[] = [];

    // Node: Parent Dyed Lot Lineage (if applicable)
    if (lot.parentLot) {
      timeline.push({
        id: `parent-${lot.parentLot.id}`,
        type: 'PARENT_LOT',
        title: `Parent Raw Lot: ${lot.parentLot.lotNumber}`,
        description: `Dyed transformation origin from parent lot ${lot.parentLot.lotNumber} (${lot.parentLot.yarnCount || '—'}). Supplier: ${lot.parentLot.supplier?.name || '—'}`,
        date: lot.parentLot.receivedDate,
        quantityKg: Number(lot.parentLot.initialWeightKg),
        partyName: lot.parentLot.supplier?.name || null,
        metadata: {
          parentLotNumber: lot.parentLot.lotNumber,
          parentCount: lot.parentLot.yarnCount,
        },
      });
    }

    // Node: Source Inward Receipts
    if (sources.length > 0) {
      for (const s of sources) {
        timeline.push({
          id: `src-${s.id}`,
          type: s.type === TransactionType.OPENING ? 'OPENING' : 'RECEIVED',
          title:
            s.type === TransactionType.OPENING
              ? 'Opening Stock Baseline Registered'
              : 'Yarn Inward Reception at Warehouse',
          description:
            s.type === TransactionType.OPENING
              ? `Initial baseline stock recorded for Lot ${lot.lotNumber} (${lot.yarnCount || '—'})`
              : `Inward yarn received from ${s.party?.name || lot.supplier?.name || 'Supplier'} under PO ${s.poNumber || '—'}`,
          date: s.transactionDate,
          quantityKg: Number(s.kilos),
          bags: s.bags,
          partyName: s.party?.name || lot.supplier?.name || '—',
          poNumber: s.poNumber || null,
          purpose: s.purpose || null,
          transactionNumber: s.transactionNumber,
          referenceNumber: s.referenceNumber || null,
          actor: s.createdBy
            ? `${s.createdBy.firstName} ${s.createdBy.lastName}`
            : 'System',
        });
      }
    } else {
      timeline.push({
        id: `init-${lot.id}`,
        type: 'RECEIVED',
        title: 'Lot Inward Reception Recorded',
        description: `Lot ${lot.lotNumber} (${lot.yarnCount || '—'}) received from ${lot.supplier?.name || 'Supplier'}`,
        date: lot.receivedDate,
        quantityKg: Number(lot.initialWeightKg),
        bags: lot.initialBags,
        partyName: lot.supplier?.name || '—',
      });
    }

    // Node: Intermediate Inventory Movements (Issues, Sales, Retirements, Corrections)
    for (const tx of lot.transactions) {
      if (
        tx.type === TransactionType.OPENING ||
        tx.type === TransactionType.RECEIVED
      ) {
        continue;
      }

      if (tx.type === TransactionType.ISSUED) {
        timeline.push({
          id: `tx-${tx.id}`,
          type: 'ISSUED',
          title: 'Yarn Issued to Production Floor',
          description: `Stock Head issued ${Number(tx.kilos).toFixed(2)} KG (${tx.bags} bags) for ${tx.purpose || 'Production'}${tx.poNumber ? ` [PO: ${tx.poNumber}]` : ''}`,
          date: tx.transactionDate,
          quantityKg: Number(tx.kilos),
          bags: tx.bags,
          partyName: tx.party?.name || null,
          poNumber: tx.poNumber || null,
          purpose: tx.purpose || null,
          transactionNumber: tx.transactionNumber,
          referenceNumber: tx.referenceNumber || null,
          actor: tx.createdBy
            ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}`
            : 'Stock Head',
        });
      } else if (tx.type === TransactionType.SOLD) {
        timeline.push({
          id: `tx-${tx.id}`,
          type: 'SOLD',
          title: 'Commercial External Yarn Sale',
          description: `Direct commercial sale of ${Number(tx.kilos).toFixed(2)} KG to ${tx.party?.name || 'Buyer'}`,
          date: tx.transactionDate,
          quantityKg: Number(tx.kilos),
          bags: tx.bags,
          partyName: tx.party?.name || null,
          transactionNumber: tx.transactionNumber,
          referenceNumber: tx.referenceNumber || null,
          actor: tx.createdBy
            ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}`
            : 'Sales',
        });
      } else if (tx.type === TransactionType.RETIRED) {
        timeline.push({
          id: `tx-${tx.id}`,
          type: 'RETIRED',
          title: 'Stock Written Off / Retired',
          description: `Retired ${Number(tx.kilos).toFixed(2)} KG from stock. Reason: ${tx.notes || tx.correctionReason || 'Damaged / Contaminated'}`,
          date: tx.transactionDate,
          quantityKg: Number(tx.kilos),
          transactionNumber: tx.transactionNumber,
          actor: tx.createdBy
            ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}`
            : 'QA Officer',
        });
      } else if (tx.type === TransactionType.CORRECTION) {
        timeline.push({
          id: `tx-${tx.id}`,
          type: 'CORRECTION',
          title: 'Transaction Correction / Ledger Reversal',
          description: `Corrected entry: ${tx.correctionReason || 'Adjusted ledger entry'}. Reference: ${tx.referenceTransaction?.transactionNumber || '—'}`,
          date: tx.transactionDate,
          quantityKg: Number(tx.kilos),
          transactionNumber: tx.transactionNumber,
          actor: tx.createdBy
            ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}`
            : 'Auditor',
        });
      }
    }

    // Node: Floor Allocations to Work Orders
    for (const alloc of lot.yarnAllocations) {
      timeline.push({
        id: `alloc-${alloc.id}`,
        type: 'ALLOCATED',
        title: `Floor Allocation: ${alloc.productionTeam.name}`,
        description: `Assigned ${Number(alloc.allocatedKg).toFixed(2)} KG to Work Order ${alloc.productionOrder.orderNumber} (${alloc.productionTeam.department})`,
        date: alloc.allocatedDate,
        quantityKg: Number(alloc.allocatedKg),
        bags: alloc.bags,
        teamName: alloc.productionTeam.name,
        department: alloc.productionTeam.department,
        workOrderNumber: alloc.productionOrder.orderNumber,
        workOrderId: alloc.productionOrderId,
        status: alloc.status,
      });
    }

    // Node: Actual Floor Consumption Records
    for (const c of consumptions) {
      timeline.push({
        id: `cons-${c.id}`,
        type: 'CONSUMED',
        title: `Floor Consumption: ${c.productionTeamName}`,
        description: `Consumed ${c.consumedKg.toFixed(2)} KG on Work Order ${c.workOrderNumber}${c.wasteKg > 0 ? ` (Waste: ${c.wasteKg.toFixed(2)} KG ${c.wasteCategory})` : ''}`,
        date: c.consumptionDate,
        quantityKg: c.consumedKg,
        teamName: c.productionTeamName,
        workOrderNumber: c.workOrderNumber,
        workOrderId: c.productionOrderId,
        actor: c.recordedByName,
        metadata: {
          wasteKg: c.wasteKg,
          wasteCategory: c.wasteCategory,
          netProducedKg: c.netProducedKg,
          remarks: c.remarks,
        },
      });
    }

    // Node: Unused Floor Returns
    for (const r of productionReturns) {
      timeline.push({
        id: `ret-${r.id}`,
        type: 'RETURNED',
        title: `Floor Return to Main Stock: ${r.productionTeamName}`,
        description: `Returned ${r.returnedKg.toFixed(2)} KG unused yarn from Work Order ${r.workOrderNumber} back to Main Warehouse. Reason: ${r.reason}`,
        date: r.returnDate,
        quantityKg: r.returnedKg,
        bags: r.returnedBags,
        teamName: r.productionTeamName,
        workOrderNumber: r.workOrderNumber,
        workOrderId: r.productionOrderId,
        transactionNumber: r.inventoryTxNumber,
        actor: r.recordedByName,
      });
    }

    // Node: Production Outputs
    for (const o of allOutputs) {
      timeline.push({
        id: `out-${o.id}`,
        type: 'PRODUCTION_OUTPUT',
        title: `Production Output: ${o.productName}`,
        description: `Manufactured ${o.outputQuantityKg.toFixed(2)} ${o.unit} finished goods on Work Order ${o.workOrderNumber}${o.productCode ? ` [Code: ${o.productCode}]` : ''}`,
        date: o.outputDate,
        quantityKg: o.outputQuantityKg,
        workOrderNumber: o.workOrderNumber,
        workOrderId: o.workOrderId,
        productName: o.productName,
        productCode: o.productCode || null,
        actor: o.recordedByName,
      });
    }

    // Node: Customer Party Deliveries
    for (const d of allDeliveries) {
      timeline.push({
        id: `del-${d.id}`,
        type: 'DELIVERED',
        title: `Customer Dispatch: ${d.partyName}`,
        description: `Dispatched ${d.dispatchedKg.toFixed(2)} KG of ${d.productName || 'Goods'} to ${d.partyName} (Challan: ${d.deliveryNumber})`,
        date: d.dispatchDate,
        quantityKg: d.dispatchedKg,
        partyName: d.partyName,
        status: d.status,
        productName: d.productName,
        productCode: d.productCode || null,
        referenceNumber: d.deliveryNumber,
        metadata: {
          vehicleNumber: d.vehicleNumber,
        },
      });
    }

    // Node: Child Dyed Lots (if parent lot)
    if (lot.childLots && lot.childLots.length > 0) {
      for (const child of lot.childLots) {
        timeline.push({
          id: `child-${child.id}`,
          type: 'CHILD_LOT',
          title: `Child Dyed Lot Generated: ${child.lotNumber}`,
          description: `Dyeing process created child dyed lot ${child.lotNumber} (${child.yarnCount || '—'}) with net balance of ${Number(child.currentWeightKg).toFixed(2)} KG`,
          date: child.receivedDate,
          quantityKg: Number(child.initialWeightKg),
          metadata: {
            childLotNumber: child.lotNumber,
            childCount: child.yarnCount,
            childStatus: child.status,
          },
        });
      }
    }

    // Sort timeline chronologically
    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const result = {
      root: {
        type: 'LOT',
        id: lot.id,
        lotNumber: lot.lotNumber,
        yarnCount: lot.yarnCount || lot.yarn?.yarnCount || '—',
        yarn: lot.yarn,
        supplier: lot.supplier,
        receivedDate: lot.receivedDate,
        status: lot.status,
        millLotNumber: lot.millLotNumber,
        shadeCode: lot.shadeCode,
        remarks: lot.remarks,
        currentBags: lot.currentBags,
        currentWeightKg: Number(lot.currentWeightKg),
        initialWeightKg: Number(lot.initialWeightKg),
        initialBags: lot.initialBags,
      },
      summary,
      parentLot: lot.parentLot
        ? {
            id: lot.parentLot.id,
            lotNumber: lot.parentLot.lotNumber,
            yarnCount: lot.parentLot.yarnCount,
            supplierName: lot.parentLot.supplier?.name || '—',
            receivedDate: lot.parentLot.receivedDate,
            initialWeightKg: Number(lot.parentLot.initialWeightKg),
            currentWeightKg: Number(lot.parentLot.currentWeightKg),
          }
        : null,
      childLots: lot.childLots.map((c) => ({
        id: c.id,
        lotNumber: c.lotNumber,
        yarnCount: c.yarnCount,
        initialWeightKg: Number(c.initialWeightKg),
        currentWeightKg: Number(c.currentWeightKg),
        status: c.status,
        receivedDate: c.receivedDate,
      })),
      sources: sources.map((s) => ({
        id: s.id,
        transactionNumber: s.transactionNumber,
        type: s.type,
        date: s.transactionDate,
        kilos: Number(s.kilos),
        bags: s.bags,
        partyName: s.party?.name || lot.supplier?.name || '—',
        poNumber: s.poNumber || '—',
        purpose: s.purpose || '—',
        notes: s.notes,
        createdByName: s.createdBy
          ? `${s.createdBy.firstName} ${s.createdBy.lastName}`
          : 'System',
      })),
      movements,
      productionTeams: Array.from(teamsMap.values()),
      workOrders: Array.from(workOrdersMap.values()),
      consumptions,
      returns: productionReturns,
      outputs: allOutputs,
      products: allProducts,
      deliveries: allDeliveries,
      timeline,
    };

    this.forwardCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }

  // ===========================================================================
  // 2. BACKWARD TRACE (PRODUCT / ORDER -> WORK ORDER -> CONSUMPTION -> RAW LOT)
  // ===========================================================================

  async traceBackwardByProduct(identifier: string) {
    const trimmed = identifier.trim();
    const cacheKey = trimmed.toLowerCase();

    const cached = this.backwardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    let product: any = await this.prisma.product.findFirst({
      where: {
        OR: [
          { productCode: { equals: trimmed, mode: 'insensitive' } },
          { name: { equals: trimmed, mode: 'insensitive' } },
          { id: trimmed },
        ],
      },
      include: {
          deliveries: {
            orderBy: { dispatchDate: 'asc' },
            include: { party: true },
          },
          productionOrder: {
            include: {
              party: true,
              productionTeam: true,
              outputs: {
                orderBy: { outputDate: 'asc' },
                include: {
                  recordedBy: { select: { firstName: true, lastName: true } },
                },
              },
              consumptionRecords: {
                where: { isCorrected: false },
                orderBy: { consumptionDate: 'asc' },
                include: {
                  productionTeam: true,
                  recordedBy: { select: { firstName: true, lastName: true } },
                  lot: {
                    include: {
                      yarn: true,
                      supplier: true,
                      parentLot: { include: { supplier: true } },
                      transactions: {
                        where: {
                          type: { in: [TransactionType.OPENING, TransactionType.RECEIVED] },
                        },
                        take: 1,
                        orderBy: { transactionDate: 'asc' },
                        include: { party: true },
                      },
                    },
                  },
                },
              },
              allocations: {
                include: {
                  productionTeam: true,
                  inventoryTransaction: true,
                  lot: {
                    include: {
                      yarn: true,
                      supplier: true,
                      transactions: {
                        where: {
                          type: { in: [TransactionType.OPENING, TransactionType.RECEIVED] },
                        },
                        take: 1,
                        orderBy: { transactionDate: 'asc' },
                        include: { party: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      let productionOrder: any = product?.productionOrder || null;

    if (!productionOrder) {
      // 2. Direct jump to ProductionOrder without the redundant multi-table join on Product
      productionOrder = await this.prisma.productionOrder.findFirst({
        where: {
          OR: [
            { orderNumber: { equals: trimmed, mode: 'insensitive' } },
            { productName: { equals: trimmed, mode: 'insensitive' } },
            { id: trimmed },
          ],
        },
        include: {
          party: true,
          productionTeam: true,
          outputs: {
            orderBy: { outputDate: 'asc' },
            include: {
              recordedBy: { select: { firstName: true, lastName: true } },
            },
          },
          products: {
            include: {
              deliveries: {
                orderBy: { dispatchDate: 'asc' },
                include: { party: true },
              },
            },
          },
          consumptionRecords: {
            where: { isCorrected: false },
            orderBy: { consumptionDate: 'asc' },
            include: {
              productionTeam: true,
              recordedBy: { select: { firstName: true, lastName: true } },
              lot: {
                include: {
                  yarn: true,
                  supplier: true,
                  parentLot: { include: { supplier: true } },
                  transactions: {
                    where: {
                      type: { in: [TransactionType.OPENING, TransactionType.RECEIVED] },
                    },
                    take: 1,
                    orderBy: { transactionDate: 'asc' },
                    include: { party: true },
                  },
                },
              },
            },
          },
          allocations: {
            include: {
              productionTeam: true,
              inventoryTransaction: true,
              lot: {
                include: {
                  yarn: true,
                  supplier: true,
                  transactions: {
                    where: {
                      type: { in: [TransactionType.OPENING, TransactionType.RECEIVED] },
                    },
                    take: 1,
                    orderBy: { transactionDate: 'asc' },
                    include: { party: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!productionOrder) {
        throw new NotFoundException(
          `No finished product or work order found for "${trimmed}". Please check the product code, product name, or work order number.`,
        );
      }
    }

    // 3. Aggregate Consumed Lots and Lineage
    const consumedLotsMap = new Map<string, any>();
    const consumptions: any[] = [];
    let totalConsumedKg = 0;
    let totalWasteKg = 0;

    for (const c of productionOrder?.consumptionRecords || []) {
      const cKg = Number(c.consumedKg);
      const wKg = Number(c.wasteKg);
      totalConsumedKg += cKg;
      totalWasteKg += wKg;

      const lot = c.lot;
      if (!consumedLotsMap.has(lot.id)) {
        const receiptTx = lot.transactions[0] || null;
        consumedLotsMap.set(lot.id, {
          lotId: lot.id,
          lotNumber: lot.lotNumber,
          yarnCount: lot.yarnCount || lot.yarn?.yarnCount || '—',
          yarnName: lot.yarn?.name || '—',
          yarnType: lot.yarn?.type || 'GREY',
          supplierName: lot.supplier?.name || receiptTx?.party?.name || '—',
          initialWeightKg: Number(lot.initialWeightKg),
          currentWeightKg: Number(lot.currentWeightKg),
          receivedDate: receiptTx?.transactionDate || lot.receivedDate,
          receiptTransactionNumber: receiptTx?.transactionNumber || '—',
          parentLot: lot.parentLot
            ? {
                lotNumber: lot.parentLot.lotNumber,
                supplierName: lot.parentLot.supplier?.name || '—',
              }
            : null,
          totalConsumedKg: 0,
          totalWasteKg: 0,
          allocations: [],
        });
      }

      const lotEntry = consumedLotsMap.get(lot.id);
      lotEntry.totalConsumedKg += cKg;
      lotEntry.totalWasteKg += wKg;

      consumptions.push({
        id: c.id,
        lotNumber: lot.lotNumber,
        yarnCount: lot.yarnCount || '—',
        consumedKg: cKg,
        wasteKg: wKg,
        wasteCategory: c.wasteCategory || '—',
        teamName: c.productionTeam?.name || '—',
        consumptionDate: c.consumptionDate,
        recordedByName: c.recordedBy
          ? `${c.recordedBy.firstName} ${c.recordedBy.lastName}`
          : 'System',
      });
    }

    // Add allocations for lots not yet consumed
    for (const a of productionOrder?.allocations || []) {
      const lot = a.lot;
      if (!consumedLotsMap.has(lot.id)) {
        const receiptTx = lot.transactions[0] || null;
        consumedLotsMap.set(lot.id, {
          lotId: lot.id,
          lotNumber: lot.lotNumber,
          yarnCount: lot.yarnCount || lot.yarn?.yarnCount || '—',
          yarnName: lot.yarn?.name || '—',
          yarnType: lot.yarn?.type || 'GREY',
          supplierName: lot.supplier?.name || receiptTx?.party?.name || '—',
          initialWeightKg: Number(lot.initialWeightKg),
          currentWeightKg: Number(lot.currentWeightKg),
          receivedDate: receiptTx?.transactionDate || lot.receivedDate,
          receiptTransactionNumber: receiptTx?.transactionNumber || '—',
          parentLot: null,
          totalConsumedKg: 0,
          totalWasteKg: 0,
          allocations: [],
        });
      }
      const lotEntry = consumedLotsMap.get(lot.id);
      lotEntry.allocations.push({
        allocatedKg: Number(a.allocatedKg),
        allocatedDate: a.allocatedDate,
        teamName: a.productionTeam?.name || '—',
      });
    }

    // Deliveries
    const rawDeliveries: any[] = product?.deliveries
      ? product.deliveries
      : (productionOrder as any)?.products?.flatMap((p: any) => p.deliveries) || [];

    const totalDispatchedKg = rawDeliveries.reduce(
      (sum: number, d: any) => sum + Number(d.dispatchedKg || 0),
      0,
    );

    // Outputs
    const outputs = (productionOrder?.outputs || []).map((o: any) => ({
      id: o.id,
      productName: o.productName,
      productCode: o.productCode,
      outputQuantityKg: Number(o.outputQuantityKg),
      unit: o.unit,
      outputDate: o.outputDate,
      recordedByName: o.recordedBy
        ? `${o.recordedBy.firstName} ${o.recordedBy.lastName}`
        : 'System',
    }));
    const totalOutputKg = outputs.reduce((sum: number, o: any) => sum + o.outputQuantityKg, 0);

    // 4. Build Backward Chronological Timeline
    const timeline: TimelineNode[] = [];

    // Step 1: Raw Yarn Lot Origins
    for (const lot of consumedLotsMap.values()) {
      if (lot.parentLot) {
        timeline.push({
          id: `parent-${lot.lotId}`,
          type: 'PARENT_LOT',
          title: `Original Parent Raw Lot: ${lot.parentLot.lotNumber}`,
          description: `Dyed lineage origin from supplier ${lot.parentLot.supplierName}`,
          date: lot.receivedDate,
          partyName: lot.parentLot.supplierName,
        });
      }
      timeline.push({
        id: `raw-${lot.lotId}`,
        type: 'RECEIVED',
        title: `Raw Material Inward: Lot ${lot.lotNumber}`,
        description: `Yarn count ${lot.yarnCount} (${lot.yarnName}) supplied by ${lot.supplierName}. Receipt: ${lot.receiptTransactionNumber}`,
        date: lot.receivedDate,
        quantityKg: lot.initialWeightKg,
        partyName: lot.supplierName,
        transactionNumber: lot.receiptTransactionNumber,
      });
    }

    // Step 2: Allocations & Floor Handoffs
    for (const a of productionOrder?.allocations || []) {
      timeline.push({
        id: `alloc-${a.id}`,
        type: 'ALLOCATED',
        title: `Floor Allocation: ${a.productionTeam.name}`,
        description: `Assigned ${Number(a.allocatedKg).toFixed(2)} KG of Lot ${a.lot.lotNumber} to Work Order ${productionOrder?.orderNumber}`,
        date: a.allocatedDate,
        quantityKg: Number(a.allocatedKg),
        teamName: a.productionTeam.name,
        department: a.productionTeam.department,
        workOrderNumber: productionOrder?.orderNumber,
        workOrderId: productionOrder?.id,
      });
    }

    // Step 3: Floor Consumption
    for (const c of consumptions) {
      timeline.push({
        id: `cons-${c.id}`,
        type: 'CONSUMED',
        title: `Yarn Consumed: Lot ${c.lotNumber}`,
        description: `Consumed ${c.consumedKg.toFixed(2)} KG by ${c.teamName}${c.wasteKg > 0 ? ` (${c.wasteKg.toFixed(2)} KG waste)` : ''}`,
        date: c.consumptionDate,
        quantityKg: c.consumedKg,
        teamName: c.teamName,
        workOrderNumber: productionOrder?.orderNumber,
        workOrderId: productionOrder?.id,
        actor: c.recordedByName,
      });
    }

    // Step 4: Production Output
    for (const o of outputs) {
      timeline.push({
        id: `out-${o.id}`,
        type: 'PRODUCTION_OUTPUT',
        title: `Production Output: ${o.productName}`,
        description: `Completed ${o.outputQuantityKg.toFixed(2)} ${o.unit} on Work Order ${productionOrder?.orderNumber}`,
        date: o.outputDate,
        quantityKg: o.outputQuantityKg,
        productName: o.productName,
        productCode: o.productCode || null,
        workOrderNumber: productionOrder?.orderNumber,
        workOrderId: productionOrder?.id,
        actor: o.recordedByName,
      });
    }

    // Step 5: Deliveries
    for (const d of rawDeliveries) {
      timeline.push({
        id: `del-${d.id}`,
        type: 'DELIVERED',
        title: `Customer Delivery: ${d.party?.name || 'Customer'}`,
        description: `Dispatched ${Number(d.dispatchedKg).toFixed(2)} KG under Delivery Challan ${d.deliveryNumber}`,
        date: d.dispatchDate,
        quantityKg: Number(d.dispatchedKg),
        partyName: d.party?.name || null,
        referenceNumber: d.deliveryNumber,
        status: d.status,
      });
    }

    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const result = {
      root: {
        type: 'PRODUCT',
        id: product?.id || productionOrder?.id,
        productCode: product?.productCode || productionOrder?.orderNumber,
        name: product?.name || productionOrder?.productName || 'Finished Product',
        category: product?.category || 'FABRIC_ROLL',
        totalQuantityKg: product ? Number(product.totalQuantityKg) : totalOutputKg,
        availableKg: product ? Number(product.availableKg) : 0,
        unit: product?.unit || productionOrder?.unit || 'KG',
      },
      productionOrder: productionOrder
        ? {
            id: productionOrder.id,
            orderNumber: productionOrder.orderNumber,
            status: productionOrder.status,
            priority: productionOrder.priority,
            purpose: productionOrder.purpose,
            targetQuantity: Number(productionOrder.targetQuantity),
            unit: productionOrder.unit,
            teamName: productionOrder.productionTeam?.name || '—',
            customerName: productionOrder.party?.name || '—',
            poNumber: productionOrder.poNumber || '—',
            startDate: productionOrder.startDate,
            targetDate: productionOrder.targetDate,
            completedDate: productionOrder.completedDate,
          }
        : null,
      summary: {
        totalConsumedKg: Number(totalConsumedKg.toFixed(4)),
        totalWasteKg: Number(totalWasteKg.toFixed(4)),
        totalOutputKg: Number(totalOutputKg.toFixed(4)),
        totalDispatchedKg: Number(totalDispatchedKg.toFixed(4)),
        consumedLotsCount: consumedLotsMap.size,
        yieldPercentage:
          totalConsumedKg > 0
            ? Number(((totalOutputKg / totalConsumedKg) * 100).toFixed(2))
            : 0,
        statusBadge:
          totalDispatchedKg > 0
            ? 'DELIVERED'
            : totalOutputKg > 0
            ? 'OUTPUT PRODUCED'
            : 'IN PRODUCTION',
      },
      consumedLots: Array.from(consumedLotsMap.values()),
      consumptions,
      outputs,
      deliveries: rawDeliveries.map((d: any) => ({
        id: d.id,
        deliveryNumber: d.deliveryNumber,
        partyName: d.party?.name || '—',
        partyCode: d.party?.code || null,
        dispatchedKg: Number(d.dispatchedKg),
        status: d.status,
        dispatchDate: d.dispatchDate,
        vehicleNumber: d.vehicleNumber,
      })),
      timeline,
    };

    this.backwardCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }

  // ===========================================================================
  // 3. ACTIVE LOT SUGGESTIONS (REAL DATABASE RECORDS)
  // ===========================================================================

  async getActiveLots(limit = 10) {
    const lots = await this.prisma.lot.findMany({
      where: {
        currentWeightKg: { gt: 0 },
      },
      take: limit,
      orderBy: [{ updatedAt: 'desc' }, { receivedDate: 'desc' }],
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        yarn: { select: { id: true, name: true, yarnCount: true, code: true } },
      },
    });

    if (lots.length === 0) {
      // If no lots have positive balance, fetch most recent lots
      const fallbackLots = await this.prisma.lot.findMany({
        take: limit,
        orderBy: { receivedDate: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          yarn: { select: { id: true, name: true, yarnCount: true, code: true } },
        },
      });
      return fallbackLots.map((l) => ({
        id: l.id,
        lotNumber: l.lotNumber,
        yarnCount: l.yarnCount || l.yarn?.yarnCount || '—',
        currentWeightKg: Number(l.currentWeightKg),
        currentBags: l.currentBags,
        supplierName: l.supplier?.name || '—',
        status: l.status,
      }));
    }

    return lots.map((l) => ({
      id: l.id,
      lotNumber: l.lotNumber,
      yarnCount: l.yarnCount || l.yarn?.yarnCount || '—',
      currentWeightKg: Number(l.currentWeightKg),
      currentBags: l.currentBags,
      supplierName: l.supplier?.name || '—',
      status: l.status,
    }));
  }

  // ===========================================================================
  // 4. AUTOCOMPLETE & SEARCH (LOTS & PRODUCTS)
  // ===========================================================================

  async searchLots(query: string, limit = 10) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return this.getActiveLots(limit);
    }

    const lots = await this.prisma.lot.findMany({
      where: {
        OR: [
          { lotNumber: { contains: trimmed, mode: 'insensitive' } },
          { yarnCount: { contains: trimmed, mode: 'insensitive' } },
          { millLotNumber: { contains: trimmed, mode: 'insensitive' } },
          { supplier: { name: { contains: trimmed, mode: 'insensitive' } } },
          { yarn: { name: { contains: trimmed, mode: 'insensitive' } } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        yarn: { select: { id: true, name: true, yarnCount: true } },
      },
    });

    return lots.map((l) => ({
      id: l.id,
      lotNumber: l.lotNumber,
      yarnCount: l.yarnCount || l.yarn?.yarnCount || '—',
      currentWeightKg: Number(l.currentWeightKg),
      currentBags: l.currentBags,
      supplierName: l.supplier?.name || '—',
      status: l.status,
    }));
  }

  async searchProducts(query: string, limit = 10) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      const products = await this.prisma.product.findMany({
        take: limit,
        orderBy: { updatedAt: 'desc' },
      });
      return products.map((p) => ({
        id: p.id,
        productCode: p.productCode,
        name: p.name,
        category: p.category,
        totalQuantityKg: Number(p.totalQuantityKg),
      }));
    }

    const [products, orders] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          OR: [
            { productCode: { contains: trimmed, mode: 'insensitive' } },
            { name: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
        take: limit,
      }),
      this.prisma.productionOrder.findMany({
        where: {
          OR: [
            { orderNumber: { contains: trimmed, mode: 'insensitive' } },
            { productName: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
        take: limit,
      }),
    ]);

    const results: any[] = [];
    const seen = new Set<string>();

    for (const p of products) {
      seen.add(p.productCode);
      results.push({
        id: p.id,
        productCode: p.productCode,
        name: p.name,
        category: p.category,
        totalQuantityKg: Number(p.totalQuantityKg),
        type: 'PRODUCT',
      });
    }

    for (const o of orders) {
      if (!seen.has(o.orderNumber)) {
        results.push({
          id: o.id,
          productCode: o.orderNumber,
          name: o.productName || `Work Order #${o.orderNumber}`,
          category: 'WORK_ORDER',
          totalQuantityKg: Number(o.targetQuantity),
          type: 'WORK_ORDER',
        });
      }
    }

    return results.slice(0, limit);
  }

  // ===========================================================================
  // 5. TRACE EXPORT (CSV / STRUCTURED DATA)
  // ===========================================================================

  async exportTraceCsv(type: 'forward' | 'backward', identifier: string) {
    if (type === 'forward') {
      const data = await this.traceForwardByLot(identifier);
      const lines: string[] = [];

      lines.push(`"YARNTRACE END-TO-END GENEALOGICAL TRACE REPORT"`);
      lines.push(`"Trace Type:","FORWARD TRACE (LOT -> PRODUCT -> DISPATCH)"`);
      lines.push(`"Target Lot Number:","${data.root.lotNumber}"`);
      lines.push(`"Yarn Count:","${data.root.yarnCount}"`);
      lines.push(`"Supplier:","${data.root.supplier?.name || '—'}"`);
      lines.push(`"Generated At:","${new Date().toISOString()}"`);
      lines.push(``);

      lines.push(`"QUANTITY RECONCILIATION SUMMARY"`);
      lines.push(`"Metric","Quantity (KG)"`);
      lines.push(`"Total Inward / Source","${data.summary.sourceKg}"`);
      lines.push(`"Total Issued to Production Floor","${data.summary.issuedKg}"`);
      lines.push(`"Total Allocated to Work Orders","${data.summary.allocatedKg}"`);
      lines.push(`"Total Consumed on Floor","${data.summary.consumedKg}"`);
      lines.push(`"Total Process Waste","${data.summary.wasteKg}"`);
      lines.push(`"Total Returned to Main Stock","${data.summary.productionReturnedKg}"`);
      lines.push(`"Current Main Warehouse Balance","${data.summary.currentMainStockKg}"`);
      lines.push(`"Current Production Floor Balance","${data.summary.currentTeamStockKg}"`);
      lines.push(`"Total Finished Output","${data.summary.totalOutputKg}"`);
      lines.push(``);

      lines.push(`"GENEALOGICAL TIMELINE EVENTS"`);
      lines.push(`"Date","Event Type","Title","Quantity (KG)","Team / Party","Work Order","Transaction / Ref","Actor"`);
      for (const t of data.timeline) {
        const dt = new Date(t.date).toISOString().split('T')[0];
        const qty = t.quantityKg !== undefined && t.quantityKg !== null ? t.quantityKg : '';
        const party = t.teamName || t.partyName || '';
        const wo = t.workOrderNumber || '';
        const ref = t.transactionNumber || t.referenceNumber || '';
        const actor = t.actor || '';
        lines.push(
          `"${dt}","${t.type}","${t.title.replace(/"/g, '""')}","${qty}","${party}","${wo}","${ref}","${actor}"`,
        );
      }

      return {
        filename: `YarnTrace-Forward-${data.root.lotNumber}.csv`,
        contentType: 'text/csv',
        buffer: Buffer.from(lines.join('\r\n'), 'utf-8'),
      };
    } else {
      const data = await this.traceBackwardByProduct(identifier);
      const lines: string[] = [];

      lines.push(`"YARNTRACE BACKWARD GENEALOGICAL TRACE REPORT"`);
      lines.push(`"Trace Type:","BACKWARD TRACE (PRODUCT -> RAW YARN LOT)"`);
      lines.push(`"Product Code / Identifier:","${data.root.productCode}"`);
      lines.push(`"Product Name:","${data.root.name}"`);
      lines.push(`"Work Order:","${data.productionOrder?.orderNumber || '—'}"`);
      lines.push(`"Generated At:","${new Date().toISOString()}"`);
      lines.push(``);

      lines.push(`"CONSUMED RAW YARN LOTS"`);
      lines.push(`"Lot Number","Yarn Count","Supplier","Total Consumed (KG)","Waste (KG)","Inward Receipt Date"`);
      for (const l of data.consumedLots) {
        const dt = l.receivedDate ? new Date(l.receivedDate).toISOString().split('T')[0] : '';
        lines.push(
          `"${l.lotNumber}","${l.yarnCount}","${l.supplierName}","${l.totalConsumedKg}","${l.totalWasteKg}","${dt}"`,
        );
      }
      lines.push(``);

      lines.push(`"GENEALOGICAL TIMELINE EVENTS"`);
      lines.push(`"Date","Event Type","Title","Quantity (KG)","Team / Party","Reference"`);
      for (const t of data.timeline) {
        const dt = new Date(t.date).toISOString().split('T')[0];
        const qty = t.quantityKg !== undefined && t.quantityKg !== null ? t.quantityKg : '';
        const party = t.teamName || t.partyName || '';
        const ref = t.transactionNumber || t.referenceNumber || '';
        lines.push(
          `"${dt}","${t.type}","${t.title.replace(/"/g, '""')}","${qty}","${party}","${ref}"`,
        );
      }

      return {
        filename: `YarnTrace-Backward-${data.root.productCode}.csv`,
        contentType: 'text/csv',
        buffer: Buffer.from(lines.join('\r\n'), 'utf-8'),
      };
    }
  }
}
