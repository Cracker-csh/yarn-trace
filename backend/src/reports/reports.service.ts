import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../common/cache/app-cache.service';
import { ReportFilterDto } from './dto/report-filter.dto';
import * as XLSX from 'xlsx-js-style';
import {
  formatDate,
  formatDateTime,
  formatDecimal,
  formatJsonForExcel,
  createStyledSheet,
  styleExecutiveSummarySheet,
  styleWeeklySummarySheet,
} from './reports-excel.util';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: AppCacheService,
  ) {}

  // ===========================================================================
  // 1. KPI SUMMARY OVERVIEW
  // ===========================================================================
  async getKpiSummary() {
    return this.cacheService.getOrSet(
      'reports:kpi-summary',
      async () => {
        const [
          lotAgg,
          rcvAgg,
          issAgg,
          totalLotsCount,
          activeLocationsCount,
          productionTeamsCount,
          pendingOrdersCount,
          consumptionAgg,
          outputAgg,
          deliveryAgg,
        ] = await Promise.all([
      this.prisma.lot.aggregate({
        _sum: { currentWeightKg: true, currentBags: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'RECEIVED' },
        _sum: { kilos: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'ISSUED' },
        _sum: { kilos: true },
      }),
      this.prisma.lot.count(),
      this.prisma.stockLocation.count({ where: { isActive: true } }),
      this.prisma.productionTeam.count({ where: { isActive: true } }),
      this.prisma.productionOrder.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.consumptionRecord.aggregate({
        _sum: { consumedKg: true, wasteKg: true },
      }),
      this.prisma.productionOutput.aggregate({
        _sum: { outputQuantityKg: true },
      }),
      this.prisma.delivery.aggregate({
        _sum: { dispatchedKg: true },
      }),
    ]);

        return {
          totalLotsCount,
          activeLocationsCount,
          productionTeamsCount,
          pendingOrdersCount,
          totalStockKg: Number(lotAgg._sum.currentWeightKg || 0).toFixed(4),
          totalStockBags: lotAgg._sum.currentBags || 0,
          receivedKg: Number(rcvAgg._sum.kilos || 0).toFixed(4),
          issuedKg: Number(issAgg._sum.kilos || 0).toFixed(4),
          consumedKg: Number(consumptionAgg._sum.consumedKg || 0).toFixed(4),
          wasteKg: Number(consumptionAgg._sum.wasteKg || 0).toFixed(4),
          finishedOutputKg: Number(outputAgg._sum.outputQuantityKg || 0).toFixed(4),
          dispatchedKg: Number(deliveryAgg._sum.dispatchedKg || 0).toFixed(4),
          withProductionTeamsKg: '0.0000',
        };
      },
      30,
    );
  }

  // ===========================================================================
  // 2. MASTER EXCEL REPORT GENERATION (12 WORKSHEETS)
  // ===========================================================================
  async exportMasterExcel(filter: ReportFilterDto = {}) {
    // 1. Build Filter Clauses
    const dateFilter: any = {};
    if (filter.startDate) {
      dateFilter.gte = new Date(`${filter.startDate}T00:00:00.000Z`);
    }
    if (filter.endDate) {
      dateFilter.lte = new Date(`${filter.endDate}T23:59:59.999Z`);
    }

    const txWhere: any = {};
    if (Object.keys(dateFilter).length > 0) txWhere.transactionDate = dateFilter;
    if (filter.lotId) txWhere.lotId = filter.lotId;
    if (filter.partyId) txWhere.partyId = filter.partyId;
    if (filter.transactionType) txWhere.type = filter.transactionType as any;
    if (filter.yarnCount) txWhere.yarnCount = { contains: filter.yarnCount, mode: 'insensitive' };

    const lotWhere: any = {};
    if (filter.lotId) lotWhere.id = filter.lotId;
    if (filter.partyId) lotWhere.supplierId = filter.partyId;
    if (filter.yarnCount) lotWhere.yarnCount = { contains: filter.yarnCount, mode: 'insensitive' };

    const poWhere: any = {};
    if (filter.partyId) poWhere.partyId = filter.partyId;
    if (Object.keys(dateFilter).length > 0) poWhere.orderDate = dateFilter;

    const prodWhere: any = {};
    if (filter.productionTeamId) prodWhere.productionTeamId = filter.productionTeamId;
    if (filter.partyId) prodWhere.partyId = filter.partyId;
    if (Object.keys(dateFilter).length > 0) prodWhere.createdAt = dateFilter;

    const deliveryWhere: any = {};
    if (filter.partyId) deliveryWhere.partyId = filter.partyId;
    if (filter.productId) deliveryWhere.productId = filter.productId;
    if (Object.keys(dateFilter).length > 0) deliveryWhere.dispatchDate = dateFilter;

    // 2. Concurrently fetch all database relations across the 12 domains
    const [
      lots,
      transactions,
      productionOrders,
      outputs,
      deliveries,
      purchaseOrders,
      parties,
      auditLogs,
      consumptions,
      // Global aggregations for Executive Summary
      lotAgg,
      openAgg,
      rcvAgg,
      issAgg,
      retAgg,
      retiredAgg,
      soldAgg,
      allocAgg,
      consAgg,
      prodRetAgg,
      outputAgg,
      delAgg,
      pendingPOCount,
      pendingReqCount,
      activePOCount,
      totalPartiesCount,
    ] = await Promise.all([
      // Lots
      this.prisma.lot.findMany({
        where: lotWhere,
        include: {
          yarn: true,
          supplier: true,
          stockBalances: { include: { location: true } },
        },
        orderBy: { currentWeightKg: 'desc' },
      }),
      // Transactions
      this.prisma.transaction.findMany({
        where: txWhere,
        include: {
          party: true,
          lot: { include: { yarn: true, supplier: true } },
          poRequirement: { include: { yarn: true } },
          createdBy: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { transactionDate: 'desc' },
      }),
      // Production Orders
      this.prisma.productionOrder.findMany({
        where: prodWhere,
        include: {
          productionTeam: true,
          allocations: true,
          consumptionRecords: true,
          returns: true,
          outputs: true,
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Outputs
      this.prisma.productionOutput.findMany({
        include: {
          productionOrder: true,
          product: true,
          deliveries: true,
          recordedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { outputDate: 'desc' },
      }),
      // Deliveries
      this.prisma.delivery.findMany({
        where: deliveryWhere,
        include: {
          party: true,
          product: true,
          productionOutput: { include: { productionOrder: true } },
        },
        orderBy: { dispatchDate: 'desc' },
      }),
      // Purchase Orders
      this.prisma.purchaseOrder.findMany({
        where: poWhere,
        include: {
          party: true,
          requirements: { include: { yarn: true } },
        },
        orderBy: { orderDate: 'desc' },
      }),
      // Parties
      this.prisma.party.findMany({
        include: {
          transactions: { select: { type: true, kilos: true } },
          deliveries: { select: { dispatchedKg: true } },
        },
        orderBy: { name: 'asc' },
      }),
      // Audit Logs
      this.prisma.auditLog.findMany({
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: 10000,
      }),
      // Consumptions for Traceability
      this.prisma.consumptionRecord.findMany({
        include: {
          lot: { include: { yarn: true, supplier: true, parentLot: true } },
          productionTeam: true,
          productionOrder: {
            include: {
              outputs: {
                include: {
                  product: true,
                  deliveries: { include: { party: true } },
                },
              },
            },
          },
        },
        orderBy: { consumptionDate: 'desc' },
      }),
      // Aggregates for Executive Summary
      this.prisma.lot.aggregate({
        _sum: { currentWeightKg: true, currentBags: true },
        _count: { id: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'OPENING' },
        _sum: { kilos: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'RECEIVED' },
        _sum: { kilos: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'ISSUED' },
        _sum: { kilos: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: { in: ['RETURN', 'RETURNED'] } },
        _sum: { kilos: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'RETIRED' },
        _sum: { kilos: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'SOLD' },
        _sum: { kilos: true },
      }),
      this.prisma.yarnAllocation.aggregate({
        _sum: { allocatedKg: true, issuedKg: true },
      }),
      this.prisma.consumptionRecord.aggregate({
        _sum: { consumedKg: true, wasteKg: true },
      }),
      this.prisma.productionReturn.aggregate({
        _sum: { returnedKg: true },
      }),
      this.prisma.productionOutput.aggregate({
        _sum: { outputQuantityKg: true },
      }),
      this.prisma.delivery.aggregate({
        _sum: { dispatchedKg: true },
      }),
      this.prisma.purchaseOrder.count({
        where: { status: { in: ['DRAFT', 'CONFIRMED', 'ACTIVE', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED', 'PARTIALLY_FULFILLED'] } },
      }),
      this.prisma.pORequirement.count({
        where: { status: { not: 'COMPLETED' }, isArchived: false, isActive: true },
      }),
      this.prisma.productionOrder.count({
        where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
      }),
      this.prisma.party.count(),
    ]);

    // Calculate Master Reconciliations
    const totalCurrentStockKg = formatDecimal(lotAgg._sum.currentWeightKg);
    const totalCurrentStockBags = lotAgg._sum.currentBags || 0;
    const totalLots = lotAgg._count.id || 0;
    const activeLots = lots.filter((l) => Number(l.currentWeightKg || 0) > 0).length;

    const totalOpeningKg = formatDecimal(openAgg._sum.kilos);
    const totalReceivedKg = formatDecimal(rcvAgg._sum.kilos);
    const totalIssuedKg = formatDecimal(issAgg._sum.kilos);
    const totalReturnedKg = formatDecimal(retAgg._sum.kilos);
    const totalRetiredKg = formatDecimal(retiredAgg._sum.kilos);
    const totalSoldKg = formatDecimal(soldAgg._sum.kilos);

    const totalAllocatedKg = formatDecimal(allocAgg._sum.allocatedKg);
    const totalConsumedKg = formatDecimal(consAgg._sum.consumedKg);
    const totalWasteKg = formatDecimal(consAgg._sum.wasteKg);
    const totalProductionReturnKg = formatDecimal(prodRetAgg._sum.returnedKg);
    const totalOutputKg = formatDecimal(outputAgg._sum.outputQuantityKg);
    const totalDispatchedKg = formatDecimal(delAgg._sum.dispatchedKg);

    // Expected Current Stock Formula: Opening + Received + Returns - Issued - Retired - Sold
    const expectedCurrentStockKg = formatDecimal(
      totalOpeningKg + totalReceivedKg + totalReturnedKg - totalIssuedKg - totalRetiredKg - totalSoldKg,
    );
    const differenceKg = formatDecimal(expectedCurrentStockKg - totalCurrentStockKg);
    const isMatched = Math.abs(differenceKg) < 0.001;
    const reconciliationStatus = isMatched ? 'MATCHED' : 'MISMATCH';

    const workbook = XLSX.utils.book_new();

    // -------------------------------------------------------------------------
    // SHEET 1: Executive Summary
    // -------------------------------------------------------------------------
    const summaryRows: any[][] = [
      ['YARNTRACE ENTERPRISE MASTER EXECUTIVE SUMMARY'],
      ['Report Generated At', formatDateTime(new Date()), 'Status', 'Authoritative Real-Time Data'],
      [],
      ['1. KEY OPERATIONAL METRICS', '', ''],
      ['Metric', 'Value', 'Unit / Notes'],
      ['Authoritative Physical Stock', totalCurrentStockKg, 'KG'],
      ['Total Physical Stock Bags', totalCurrentStockBags, 'Bags'],
      ['Total Master Lots', totalLots, 'Lots registered'],
      ['Active Lots (Positive Balance)', activeLots, 'Lots in active circulation'],
      ['Total Opening Stock', totalOpeningKg, 'KG'],
      ['Total Received Inward', totalReceivedKg, 'KG'],
      ['Total Issued to Production Floor', totalIssuedKg, 'KG'],
      ['Total Returned to Warehouse', totalReturnedKg, 'KG'],
      ['Total Retired / Write-Off', totalRetiredKg, 'KG'],
      ['Total Sold Outward', totalSoldKg, 'KG'],
      ['Total Yarn Allocated for Production', totalAllocatedKg, 'KG'],
      ['Total Floor Consumption', totalConsumedKg, 'KG'],
      ['Total Production Waste Generated', totalWasteKg, 'KG'],
      ['Total Floor Returns Received', totalProductionReturnKg, 'KG'],
      ['Total Finished Output Manufactured', totalOutputKg, 'KG'],
      ['Total Dispatched to Customers', totalDispatchedKg, 'KG'],
      ['Pending Purchase Orders', pendingPOCount, 'Orders'],
      ['Pending PO Requirements', pendingReqCount, 'Requirement lines'],
      ['Active Production Work Orders', activePOCount, 'Orders in progress'],
      ['Total Registered Parties', totalPartiesCount, 'Suppliers, Mills & Customers'],
      [],
      ['2. INVENTORY RECONCILIATION AUDIT', '', ''],
      ['Reconciliation Component', 'Quantity (KG)', 'Auditing Reference / Formula'],
      ['Opening Stock (+)', totalOpeningKg, 'Registered baseline opening inventory'],
      ['Received Stock (+)', totalReceivedKg, 'Supplier receipts from inward gate passes'],
      ['Returned Stock (+)', totalReturnedKg, 'Warehouse returns from floor or parties'],
      ['Issued to Floor (-)', totalIssuedKg, 'Issued allocations for work orders'],
      ['Retired / Write-Off (-)', totalRetiredKg, 'Damaged, expired, or scraped inventory'],
      ['Sold Outward (-)', totalSoldKg, 'Direct commercial outward sales'],
      // Formulas (B29..B34)
      ['Expected Current Stock', { t: 'n', f: 'B29+B30+B31-B32-B33-B34', v: expectedCurrentStockKg }, 'Formula: Opening + Received + Returns - Issued - Retired - Sold'],
      ['Authoritative Current Stock', totalCurrentStockKg, 'Live calculated balance across all active lots'],
      ['Variance / Difference (KG)', { t: 'n', f: 'B35-B36', v: differenceKg }, 'Formula: Expected Stock - Authoritative Stock'],
      ['Reconciliation Status', { t: 's', f: 'IF(ABS(B37)<0.001,"MATCHED","MISMATCH")', v: reconciliationStatus }, 'Tolerance Rule: ABS(Diff) < 0.001 KG'],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    styleExecutiveSummarySheet(wsSummary, isMatched);
    XLSX.utils.book_append_sheet(workbook, wsSummary, 'Executive Summary');

    // -------------------------------------------------------------------------
    // SHEET 2: Stock Ledger
    // -------------------------------------------------------------------------
    const ledgerFallback = [
      'Date', 'Transaction Number', 'Transaction Type', 'Status', 'Lot Number',
      'Yarn Code', 'Yarn Name', 'Yarn Count', 'Yarn Type', 'Supplier/Party',
      'PO Number', 'PO Requirement', 'Purpose', 'Bags', 'KG',
      'Reference Number', 'Notes', 'Created By', 'Created By Email', 'Created At',
    ];
    const stockLedgerRows = transactions.map((t) => ({
      'Date': formatDate(t.transactionDate),
      'Transaction Number': t.transactionNumber,
      'Transaction Type': t.type,
      'Status': t.status,
      'Lot Number': t.lot?.lotNumber || '—',
      'Yarn Code': t.lot?.yarn?.code || t.poRequirement?.yarn?.code || '—',
      'Yarn Name': t.lot?.yarn?.name || t.poRequirement?.yarn?.name || '—',
      'Yarn Count': t.yarnCount || t.lot?.yarnCount || t.poRequirement?.yarnCount || '—',
      'Yarn Type': t.lot?.yarn?.type || '—',
      'Supplier/Party': t.party?.name || t.lot?.supplier?.name || '—',
      'PO Number': t.poNumber || '—',
      'PO Requirement': t.poRequirement?.yarnCount ? `${t.poRequirement.yarnCount} (${t.poRequirement.purpose || 'REQ'})` : '—',
      'Purpose': t.purpose || '—',
      'Bags': t.bags ?? 0,
      'KG': formatDecimal(t.kilos),
      'Reference Number': t.referenceNumber || '—',
      'Notes': t.notes || t.correctionReason || '—',
      'Created By': t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim() : 'System',
      'Created By Email': t.createdBy?.email || '—',
      'Created At': formatDateTime(t.createdAt),
    }));
    const wsLedger = createStyledSheet(stockLedgerRows, ledgerFallback, [
      12, 18, 14, 12, 16, 12, 22, 14, 14, 24, 14, 20, 14, 8, 14, 16, 26, 18, 24, 20,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsLedger, 'Stock Ledger');

    // -------------------------------------------------------------------------
    // SHEET 3: Current Stock
    // -------------------------------------------------------------------------
    const currentStockFallback = [
      'Lot Number', 'Yarn Code', 'Yarn Name', 'Yarn Count', 'Yarn Type', 'Supplier',
      'Initial Bags', 'Initial KG', 'Current Bags', 'Current KG', 'Status',
      'Received Date', 'Mill Lot Number', 'Shade Code', 'Location', 'Last Updated',
    ];
    const currentStockRows = lots.map((l) => {
      const locations = l.stockBalances
        .map((sb) => `${sb.location?.name || sb.location?.code || 'Location'}: ${formatDecimal(sb.quantityKg)}kg (${sb.bagsCount} bags)`)
        .join('; ');
      return {
        'Lot Number': l.lotNumber,
        'Yarn Code': l.yarn?.code || '—',
        'Yarn Name': l.yarn?.name || '—',
        'Yarn Count': l.yarnCount || '—',
        'Yarn Type': l.yarn?.type || '—',
        'Supplier': l.supplier?.name || '—',
        'Initial Bags': l.initialBags ?? 0,
        'Initial KG': formatDecimal(l.initialWeightKg),
        'Current Bags': l.currentBags ?? 0,
        'Current KG': formatDecimal(l.currentWeightKg),
        'Status': l.status,
        'Received Date': formatDate(l.receivedDate),
        'Mill Lot Number': l.millLotNumber || '—',
        'Shade Code': l.shadeCode || '—',
        'Location': locations || 'Unassigned',
        'Last Updated': formatDateTime(l.updatedAt),
      };
    });
    const wsCurrentStock = createStyledSheet(currentStockRows, currentStockFallback, [
      16, 12, 22, 14, 14, 24, 12, 14, 12, 14, 14, 14, 16, 14, 28, 20,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsCurrentStock, 'Current Stock');

    // -------------------------------------------------------------------------
    // SHEET 4: Purchases & Inward
    // -------------------------------------------------------------------------
    const purchasesFallback = [
      'Transaction Number', 'Transaction Type', 'Date', 'Supplier / Party',
      'Lot Number', 'Mill Lot Number', 'Yarn Code', 'Yarn Name', 'Yarn Count',
      'PO Number', 'PO Requirement', 'Bags', 'Quantity KG', 'Reference / Invoice Number',
      'Status', 'Notes', 'Created By',
    ];
    const inwardRows = transactions
      .filter((t) => t.type === 'OPENING' || t.type === 'RECEIVED')
      .map((t) => ({
        'Transaction Number': t.transactionNumber,
        'Transaction Type': t.type,
        'Date': formatDate(t.transactionDate),
        'Supplier / Party': t.party?.name || t.lot?.supplier?.name || '—',
        'Lot Number': t.lot?.lotNumber || '—',
        'Mill Lot Number': t.lot?.millLotNumber || '—',
        'Yarn Code': t.lot?.yarn?.code || t.poRequirement?.yarn?.code || '—',
        'Yarn Name': t.lot?.yarn?.name || t.poRequirement?.yarn?.name || '—',
        'Yarn Count': t.yarnCount || t.lot?.yarnCount || t.poRequirement?.yarnCount || '—',
        'PO Number': t.poNumber || '—',
        'PO Requirement': t.poRequirement?.yarnCount || '—',
        'Bags': t.bags ?? 0,
        'Quantity KG': formatDecimal(t.kilos),
        'Reference / Invoice Number': t.referenceNumber || '—',
        'Status': t.status,
        'Notes': t.notes || '—',
        'Created By': t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim() : 'System',
      }));
    const wsPurchases = createStyledSheet(inwardRows, purchasesFallback, [
      18, 14, 12, 24, 16, 16, 12, 22, 14, 14, 18, 8, 14, 20, 12, 24, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsPurchases, 'Purchases & Inward');

    // -------------------------------------------------------------------------
    // SHEET 5: Issues & Outward
    // -------------------------------------------------------------------------
    const issuesFallback = [
      'Transaction Number', 'Transaction Type', 'Date', 'Lot Number', 'Yarn',
      'Yarn Count', 'Party', 'PO Number', 'Purpose', 'Issued KG', 'Bags',
      'Status', 'Created By', 'Reference Number', 'Notes',
    ];
    const outwardRows = transactions
      .filter((t) => t.type !== 'OPENING' && t.type !== 'RECEIVED')
      .map((t) => ({
        'Transaction Number': t.transactionNumber,
        'Transaction Type': t.type,
        'Date': formatDate(t.transactionDate),
        'Lot Number': t.lot?.lotNumber || '—',
        'Yarn': t.lot?.yarn ? `${t.lot.yarn.code} - ${t.lot.yarn.name}` : (t.yarnCount || '—'),
        'Yarn Count': t.yarnCount || t.lot?.yarnCount || '—',
        'Party': t.party?.name || '—',
        'PO Number': t.poNumber || '—',
        'Purpose': t.purpose || '—',
        'Issued KG': formatDecimal(t.kilos),
        'Bags': t.bags ?? 0,
        'Status': t.status,
        'Created By': t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim() : 'System',
        'Reference Number': t.referenceNumber || '—',
        'Notes': t.notes || t.correctionReason || '—',
      }));
    const wsIssues = createStyledSheet(outwardRows, issuesFallback, [
      18, 14, 12, 16, 24, 14, 22, 14, 14, 14, 8, 12, 18, 18, 24,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsIssues, 'Issues & Outward');

    // -------------------------------------------------------------------------
    // SHEET 6: Production
    // -------------------------------------------------------------------------
    const productionFallback = [
      'Production Order', 'Status', 'Production Team', 'Department', 'Product',
      'Product Code', 'Target KG', 'Allocated KG', 'Issued KG', 'Consumed KG',
      'Waste KG', 'Net Produced KG', 'Returned KG', 'Finished Output KG',
      'Start Date', 'Target Date', 'Completed Date', 'Created By',
    ];
    const productionRows = productionOrders.map((po) => {
      const allocatedKg = po.allocations.reduce((acc, a) => acc + Number(a.allocatedKg || 0), 0);
      const issuedKg = po.allocations.reduce((acc, a) => acc + Number(a.issuedKg || 0), 0);
      const consumedKg = po.consumptionRecords.reduce((acc, c) => acc + Number(c.consumedKg || 0), 0);
      const wasteKg = po.consumptionRecords.reduce((acc, c) => acc + Number(c.wasteKg || 0), 0);
      const netProducedKg = po.consumptionRecords.reduce(
        (acc, c) => acc + Number(c.netProducedKg || Number(c.consumedKg) - Number(c.wasteKg)),
        0,
      );
      const returnedKg = po.returns.reduce((acc, r) => acc + Number(r.returnedKg || 0), 0);
      const finishedOutputKg = po.outputs.reduce((acc, o) => acc + Number(o.outputQuantityKg || 0), 0);

      return {
        'Production Order': po.orderNumber,
        'Status': po.status,
        'Production Team': po.productionTeam?.name || '—',
        'Department': po.productionTeam?.department || '—',
        'Product': po.productName || '—',
        'Product Code': po.productType || '—',
        'Target KG': formatDecimal(po.targetQuantity),
        'Allocated KG': formatDecimal(allocatedKg),
        'Issued KG': formatDecimal(issuedKg),
        'Consumed KG': formatDecimal(consumedKg),
        'Waste KG': formatDecimal(wasteKg),
        'Net Produced KG': formatDecimal(netProducedKg),
        'Returned KG': formatDecimal(returnedKg),
        'Finished Output KG': formatDecimal(finishedOutputKg),
        'Start Date': formatDate(po.startDate),
        'Target Date': formatDate(po.targetDate),
        'Completed Date': formatDate(po.completedDate),
        'Created By': po.createdBy ? `${po.createdBy.firstName} ${po.createdBy.lastName}`.trim() : 'System',
      };
    });
    const wsProduction = createStyledSheet(productionRows, productionFallback, [
      18, 14, 20, 16, 20, 16, 14, 14, 14, 14, 12, 16, 14, 18, 12, 12, 14, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsProduction, 'Production');

    // -------------------------------------------------------------------------
    // SHEET 7: Products & Output
    // -------------------------------------------------------------------------
    const outputFallback = [
      'Product Code', 'Product Name', 'Category', 'Production Order', 'Batch Number',
      'Output KG', 'Available KG', 'Delivered KG', 'Remaining KG', 'Output Date',
      'Status', 'Recorded By',
    ];
    const outputRows = outputs.map((out) => {
      const outputKg = Number(out.outputQuantityKg || 0);
      const deliveredKg = out.deliveries.reduce((acc, d) => acc + Number(d.dispatchedKg || 0), 0);
      const remainingKg = Math.max(0, outputKg - deliveredKg);
      const availableKg = out.product ? Number(out.product.availableKg || 0) : remainingKg;

      return {
        'Product Code': out.productCode || out.product?.productCode || '—',
        'Product Name': out.productName || out.product?.name || '—',
        'Category': out.productType || out.product?.category || '—',
        'Production Order': out.productionOrder?.orderNumber || '—',
        'Batch Number': out.batchNumber || '—',
        'Output KG': formatDecimal(outputKg),
        'Available KG': formatDecimal(availableKg),
        'Delivered KG': formatDecimal(deliveredKg),
        'Remaining KG': formatDecimal(remainingKg),
        'Output Date': formatDate(out.outputDate),
        'Status': out.status || 'PRODUCED',
        'Recorded By': out.recordedBy ? `${out.recordedBy.firstName} ${out.recordedBy.lastName}`.trim() : 'System',
      };
    });
    const wsOutput = createStyledSheet(outputRows, outputFallback, [
      16, 24, 16, 18, 18, 14, 14, 14, 14, 12, 12, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsOutput, 'Products & Output');

    // -------------------------------------------------------------------------
    // SHEET 8: Deliveries
    // -------------------------------------------------------------------------
    const deliveryFallback = [
      'Delivery Number', 'Date', 'Customer/Party', 'Product', 'Product Code',
      'Production Batch', 'Production Order', 'Dispatched KG', 'Status',
      'Vehicle Number', 'Reference/Challan', 'Created/Recorded By',
    ];
    const deliveryRows = deliveries.map((d) => ({
      'Delivery Number': d.deliveryNumber,
      'Date': formatDate(d.dispatchDate),
      'Customer/Party': d.party?.name || '—',
      'Product': d.product?.name || d.productionOutput?.productName || '—',
      'Product Code': d.product?.productCode || d.productionOutput?.productCode || '—',
      'Production Batch': d.productionOutput?.batchNumber || '—',
      'Production Order': d.productionOutput?.productionOrder?.orderNumber || '—',
      'Dispatched KG': formatDecimal(d.dispatchedKg),
      'Status': d.status,
      'Vehicle Number': d.vehicleNumber || '—',
      'Reference/Challan': d.lrNumber || '—',
      'Created/Recorded By': d.driverContact ? `Driver: ${d.driverContact}` : 'System',
    }));
    const wsDelivery = createStyledSheet(deliveryRows, deliveryFallback, [
      18, 12, 24, 22, 16, 18, 18, 14, 14, 16, 18, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsDelivery, 'Deliveries');

    // -------------------------------------------------------------------------
    // SHEET 9: Purchase Orders
    // -------------------------------------------------------------------------
    const poFallback = [
      'PO Number', 'Party', 'Status', 'PO Date', 'Requirement', 'Yarn',
      'Yarn Count', 'Required KG', 'Issued KG', 'Remaining KG', 'Fulfillment %',
      'Purpose', 'Created By',
    ];
    const poRows: any[] = [];
    purchaseOrders.forEach((po) => {
      if (!po.requirements || po.requirements.length === 0) {
        poRows.push({
          'PO Number': po.poNumber,
          'Party': po.party?.name || '—',
          'Status': po.status,
          'PO Date': formatDate(po.orderDate),
          'Requirement': '—',
          'Yarn': '—',
          'Yarn Count': '—',
          'Required KG': 0,
          'Issued KG': 0,
          'Remaining KG': 0,
          'Fulfillment %': '0%',
          'Purpose': '—',
          'Created By': 'System',
        });
      } else {
        po.requirements.forEach((req) => {
          const reqKg = Number(req.requiredKg || 0);
          const issKg = Number(req.issuedKg || 0);
          const remKg = Math.max(0, reqKg - issKg);
          const fulfillmentPct = reqKg > 0 ? `${((issKg / reqKg) * 100).toFixed(1)}%` : '0%';

          poRows.push({
            'PO Number': po.poNumber,
            'Party': po.party?.name || '—',
            'Status': po.status,
            'PO Date': formatDate(po.orderDate),
            'Requirement': req.useFor || req.quality || req.status || 'Standard',
            'Yarn': req.yarn ? `${req.yarn.code} - ${req.yarn.name}` : '—',
            'Yarn Count': req.yarnCount || '—',
            'Required KG': formatDecimal(reqKg),
            'Issued KG': formatDecimal(issKg),
            'Remaining KG': formatDecimal(remKg),
            'Fulfillment %': fulfillmentPct,
            'Purpose': req.purpose || '—',
            'Created By': 'System',
          });
        });
      }
    });
    const wsPO = createStyledSheet(poRows, poFallback, [
      16, 24, 14, 12, 18, 20, 14, 14, 14, 14, 14, 14, 14,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsPO, 'Purchase Orders');

    // -------------------------------------------------------------------------
    // SHEET 10: Parties
    // -------------------------------------------------------------------------
    const partyFallback = [
      'Party Code', 'Party Name', 'Party Type', 'Contact', 'Email', 'Phone',
      'Active Status', 'Total Received KG', 'Total Issued KG', 'Total Delivered KG',
      'Total Transactions',
    ];
    const partyRows = parties.map((p) => {
      const totalRecvKg = p.transactions
        .filter((t) => t.type === 'RECEIVED' || t.type === 'OPENING')
        .reduce((acc, t) => acc + Number(t.kilos || 0), 0);
      const totalIssKg = p.transactions
        .filter((t) => t.type === 'ISSUED')
        .reduce((acc, t) => acc + Number(t.kilos || 0), 0);
      const totalDelvKg = p.deliveries.reduce((acc, d) => acc + Number(d.dispatchedKg || 0), 0);

      return {
        'Party Code': p.code,
        'Party Name': p.name,
        'Party Type': p.type,
        'Contact': p.contactPerson || '—',
        'Email': p.email || '—',
        'Phone': p.phone || '—',
        'Active Status': p.isActive ? 'ACTIVE' : 'INACTIVE',
        'Total Received KG': formatDecimal(totalRecvKg),
        'Total Issued KG': formatDecimal(totalIssKg),
        'Total Delivered KG': formatDecimal(totalDelvKg),
        'Total Transactions': p.transactions.length,
      };
    });
    const wsParties = createStyledSheet(partyRows, partyFallback, [
      14, 26, 16, 18, 24, 16, 14, 18, 18, 18, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsParties, 'Parties');

    // -------------------------------------------------------------------------
    // SHEET 11: Audit Trail
    // -------------------------------------------------------------------------
    const auditFallback = [
      'Timestamp', 'User', 'User Email', 'Action', 'Module', 'Entity Type',
      'Entity ID', 'Old Value', 'New Value', 'IP Address', 'Metadata',
    ];
    const auditRows = auditLogs.map((a) => ({
      'Timestamp': formatDateTime(a.timestamp),
      'User': a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : 'System',
      'User Email': a.user?.email || '—',
      'Action': a.action,
      'Module': a.module,
      'Entity Type': a.entityType,
      'Entity ID': a.entityId || '—',
      'Old Value': formatJsonForExcel(a.oldValue),
      'New Value': formatJsonForExcel(a.newValue),
      'IP Address': a.ipAddress || '—',
      'Metadata': formatJsonForExcel(a.metadata),
    }));
    const wsAudit = createStyledSheet(auditRows, auditFallback, [
      20, 18, 24, 16, 16, 16, 26, 30, 30, 16, 24,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsAudit, 'Audit Trail');

    // -------------------------------------------------------------------------
    // SHEET 12: Traceability
    // -------------------------------------------------------------------------
    const traceFallback = [
      'Lot Number', 'Yarn', 'Supplier', 'Parent Lot', 'Production Order',
      'Production Team', 'Consumed KG', 'Waste KG', 'Production Output',
      'Product', 'Delivery', 'Customer',
    ];
    const traceRows: any[] = [];
    consumptions.forEach((c) => {
      const orderOutputs = c.productionOrder?.outputs || [];
      if (orderOutputs.length === 0) {
        traceRows.push({
          'Lot Number': c.lot?.lotNumber || '—',
          'Yarn': c.lot?.yarn ? `${c.lot.yarn.code} - ${c.lot.yarn.name}` : (c.yarnCount || '—'),
          'Supplier': c.lot?.supplier?.name || '—',
          'Parent Lot': c.lot?.parentLot?.lotNumber || '—',
          'Production Order': c.productionOrder?.orderNumber || '—',
          'Production Team': c.productionTeam?.name || '—',
          'Consumed KG': formatDecimal(c.consumedKg),
          'Waste KG': formatDecimal(c.wasteKg),
          'Production Output': 'In Production',
          'Product': c.productionOrder?.productName || '—',
          'Delivery': 'Pending',
          'Customer': 'Pending',
        });
      } else {
        orderOutputs.forEach((o) => {
          const outDeliveries = o.deliveries || [];
          if (outDeliveries.length === 0) {
            traceRows.push({
              'Lot Number': c.lot?.lotNumber || '—',
              'Yarn': c.lot?.yarn ? `${c.lot.yarn.code} - ${c.lot.yarn.name}` : (c.yarnCount || '—'),
              'Supplier': c.lot?.supplier?.name || '—',
              'Parent Lot': c.lot?.parentLot?.lotNumber || '—',
              'Production Order': c.productionOrder?.orderNumber || '—',
              'Production Team': c.productionTeam?.name || '—',
              'Consumed KG': formatDecimal(c.consumedKg),
              'Waste KG': formatDecimal(c.wasteKg),
              'Production Output': o.batchNumber || o.productName,
              'Product': o.product?.name || o.productName,
              'Delivery': 'Unassigned',
              'Customer': 'Warehouse Stock',
            });
          } else {
            outDeliveries.forEach((d) => {
              traceRows.push({
                'Lot Number': c.lot?.lotNumber || '—',
                'Yarn': c.lot?.yarn ? `${c.lot.yarn.code} - ${c.lot.yarn.name}` : (c.yarnCount || '—'),
                'Supplier': c.lot?.supplier?.name || '—',
                'Parent Lot': c.lot?.parentLot?.lotNumber || '—',
                'Production Order': c.productionOrder?.orderNumber || '—',
                'Production Team': c.productionTeam?.name || '—',
                'Consumed KG': formatDecimal(c.consumedKg),
                'Waste KG': formatDecimal(c.wasteKg),
                'Production Output': o.batchNumber || o.productName,
                'Product': o.product?.name || o.productName,
                'Delivery': d.deliveryNumber,
                'Customer': d.party?.name || '—',
              });
            });
          }
        });
      }
    });

    // Fallback: If no consumptions recorded yet, populate with lots at Raw Yarn stage
    if (traceRows.length === 0 && lots.length > 0) {
      lots.forEach((l) => {
        traceRows.push({
          'Lot Number': l.lotNumber,
          'Yarn': l.yarn ? `${l.yarn.code} - ${l.yarn.name}` : (l.yarnCount || '—'),
          'Supplier': l.supplier?.name || '—',
          'Parent Lot': '—',
          'Production Order': 'Not Allocated',
          'Production Team': 'Warehouse',
          'Consumed KG': 0,
          'Waste KG': 0,
          'Production Output': 'Raw Yarn Stock',
          'Product': 'Raw Yarn',
          'Delivery': 'In Stock',
          'Customer': 'Inventory Balance',
        });
      });
    }

    const wsTrace = createStyledSheet(traceRows, traceFallback, [
      16, 22, 22, 16, 18, 18, 14, 12, 18, 20, 16, 24,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsTrace, 'Traceability');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const today = new Date().toISOString().split('T')[0];

    return {
      buffer: excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `YarnTrace_Master_Report_${today}.xlsx`,
    };
  }

  // ===========================================================================
  // 3. WEEKLY EXCEL REPORT GENERATION
  // ===========================================================================
  async exportWeeklyExcel(filter: ReportFilterDto = {}) {
    // 1. Determine Weekly Date Range (Default: Monday to Sunday of current week)
    let start: Date;
    let end: Date;

    if (filter.startDate && filter.endDate) {
      start = new Date(`${filter.startDate}T00:00:00.000Z`);
      end = new Date(`${filter.endDate}T23:59:59.999Z`);
    } else {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      start = monday;
      end = sunday;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    // 2. Concurrently fetch activities strictly within the weekly period
    const [
      weeklyTransactions,
      weeklyProductionOrders,
      weeklyConsumptions,
      weeklyReturns,
      weeklyOutputs,
      weeklyDeliveries,
      weeklyPOs,
      weeklyAuditLogs,
      // Aggregates for Weekly Summary
      weeklyRcvAgg,
      weeklyIssAgg,
      weeklyConsAgg,
      weeklyOutputAgg,
      weeklyDelAgg,
    ] = await Promise.all([
      // Transactions
      this.prisma.transaction.findMany({
        where: {
          transactionDate: { gte: start, lte: end },
          ...(filter.partyId ? { partyId: filter.partyId } : {}),
          ...(filter.lotId ? { lotId: filter.lotId } : {}),
          ...(filter.transactionType ? { type: filter.transactionType as any } : {}),
        },
        include: {
          party: true,
          lot: { include: { yarn: true } },
          poRequirement: true,
          createdBy: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { transactionDate: 'desc' },
      }),
      // Production Orders
      this.prisma.productionOrder.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          ...(filter.productionTeamId ? { productionTeamId: filter.productionTeamId } : {}),
        },
        include: {
          productionTeam: true,
          allocations: true,
          consumptionRecords: true,
          returns: true,
          outputs: true,
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Consumption
      this.prisma.consumptionRecord.findMany({
        where: {
          consumptionDate: { gte: start, lte: end },
          ...(filter.productionTeamId ? { productionTeamId: filter.productionTeamId } : {}),
        },
        include: {
          productionOrder: true,
          productionTeam: true,
          lot: { include: { yarn: true } },
          recordedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { consumptionDate: 'desc' },
      }),
      // Production Returns
      this.prisma.productionReturn.findMany({
        where: {
          returnDate: { gte: start, lte: end },
        },
        include: {
          productionOrder: true,
          productionTeam: true,
          lot: { include: { yarn: true } },
          recordedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { returnDate: 'desc' },
      }),
      // Production Outputs
      this.prisma.productionOutput.findMany({
        where: {
          outputDate: { gte: start, lte: end },
        },
        include: {
          productionOrder: true,
          product: true,
          recordedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { outputDate: 'desc' },
      }),
      // Deliveries
      this.prisma.delivery.findMany({
        where: {
          dispatchDate: { gte: start, lte: end },
          ...(filter.partyId ? { partyId: filter.partyId } : {}),
        },
        include: {
          party: true,
          product: true,
          productionOutput: true,
        },
        orderBy: { dispatchDate: 'desc' },
      }),
      // Purchase Orders
      this.prisma.purchaseOrder.findMany({
        where: {
          orderDate: { gte: start, lte: end },
          ...(filter.partyId ? { partyId: filter.partyId } : {}),
        },
        include: {
          party: true,
          requirements: { include: { yarn: true } },
        },
        orderBy: { orderDate: 'desc' },
      }),
      // Audit Logs
      this.prisma.auditLog.findMany({
        where: {
          timestamp: { gte: start, lte: end },
        },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: 5000,
      }),
      // Weekly Aggregates
      this.prisma.transaction.aggregate({
        where: { transactionDate: { gte: start, lte: end }, type: { in: ['OPENING', 'RECEIVED'] } },
        _sum: { kilos: true },
      }),
      this.prisma.transaction.aggregate({
        where: { transactionDate: { gte: start, lte: end }, type: 'ISSUED' },
        _sum: { kilos: true },
      }),
      this.prisma.consumptionRecord.aggregate({
        where: { consumptionDate: { gte: start, lte: end } },
        _sum: { consumedKg: true, wasteKg: true },
      }),
      this.prisma.productionOutput.aggregate({
        where: { outputDate: { gte: start, lte: end } },
        _sum: { outputQuantityKg: true },
      }),
      this.prisma.delivery.aggregate({
        where: { dispatchDate: { gte: start, lte: end } },
        _sum: { dispatchedKg: true },
      }),
    ]);

    const workbook = XLSX.utils.book_new();

    // -------------------------------------------------------------------------
    // SHEET 1: Weekly Summary
    // -------------------------------------------------------------------------
    const weeklySummaryRows: any[][] = [
      ['YARNTRACE WEEKLY OPERATIONS REPORT'],
      ['Reporting Period', `${startStr} to ${endStr}`, 'Generated At', formatDateTime(new Date())],
      [],
      ['WEEKLY ACTIVITY HIGHLIGHTS', '', ''],
      ['Operational Metric', 'Weekly Volume', 'Unit / Details'],
      ['Total Weekly Purchases / Inward', formatDecimal(weeklyRcvAgg._sum.kilos), 'KG received during week'],
      ['Total Weekly Floor Issues', formatDecimal(weeklyIssAgg._sum.kilos), 'KG issued to production'],
      ['Total Weekly Floor Consumption', formatDecimal(weeklyConsAgg._sum.consumedKg), 'KG consumed by machines'],
      ['Total Weekly Floor Waste', formatDecimal(weeklyConsAgg._sum.wasteKg), 'KG process waste produced'],
      ['Total Weekly Finished Output', formatDecimal(weeklyOutputAgg._sum.outputQuantityKg), 'KG finished goods produced'],
      ['Total Weekly Customer Deliveries', formatDecimal(weeklyDelAgg._sum.dispatchedKg), 'KG dispatched outward'],
      ['Total Stock Movements Logged', weeklyTransactions.length, 'Inventory ledger transactions'],
      ['New Production Orders Initiated', weeklyProductionOrders.length, 'Work orders launched'],
      ['Purchase Orders Created / Active', weeklyPOs.length, 'Commercial orders'],
      ['System Audit Events Recorded', weeklyAuditLogs.length, 'Security & ledger operations'],
    ];
    const wsWeeklySummary = XLSX.utils.aoa_to_sheet(weeklySummaryRows);
    styleWeeklySummarySheet(wsWeeklySummary);
    XLSX.utils.book_append_sheet(workbook, wsWeeklySummary, 'Weekly Summary');

    // -------------------------------------------------------------------------
    // SHEET 2: Weekly Stock Movements
    // -------------------------------------------------------------------------
    const movFallback = [
      'Date', 'Transaction Number', 'Type', 'Status', 'Lot Number', 'Yarn Count',
      'Party', 'PO Number', 'Purpose', 'Bags', 'KG', 'Reference', 'Logged By',
    ];
    const movRows = weeklyTransactions.map((t) => ({
      'Date': formatDate(t.transactionDate),
      'Transaction Number': t.transactionNumber,
      'Type': t.type,
      'Status': t.status,
      'Lot Number': t.lot?.lotNumber || '—',
      'Yarn Count': t.yarnCount || t.lot?.yarnCount || '—',
      'Party': t.party?.name || '—',
      'PO Number': t.poNumber || '—',
      'Purpose': t.purpose || '—',
      'Bags': t.bags ?? 0,
      'KG': formatDecimal(t.kilos),
      'Reference': t.referenceNumber || '—',
      'Logged By': t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim() : 'System',
    }));
    const wsMov = createStyledSheet(movRows, movFallback, [
      12, 18, 14, 12, 16, 14, 22, 14, 14, 8, 14, 16, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsMov, 'Weekly Stock Movements');

    // -------------------------------------------------------------------------
    // SHEET 3: Weekly Purchases/Inward
    // -------------------------------------------------------------------------
    const inFallback = [
      'Date', 'Transaction Number', 'Type', 'Supplier', 'Lot Number', 'Yarn Count',
      'PO Number', 'Bags', 'Quantity KG', 'Invoice Ref', 'Notes', 'Logged By',
    ];
    const inRows = weeklyTransactions
      .filter((t) => t.type === 'OPENING' || t.type === 'RECEIVED')
      .map((t) => ({
        'Date': formatDate(t.transactionDate),
        'Transaction Number': t.transactionNumber,
        'Type': t.type,
        'Supplier': t.party?.name || '—',
        'Lot Number': t.lot?.lotNumber || '—',
        'Yarn Count': t.yarnCount || t.lot?.yarnCount || '—',
        'PO Number': t.poNumber || '—',
        'Bags': t.bags ?? 0,
        'Quantity KG': formatDecimal(t.kilos),
        'Invoice Ref': t.referenceNumber || '—',
        'Notes': t.notes || '—',
        'Logged By': t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim() : 'System',
      }));
    const wsIn = createStyledSheet(inRows, inFallback, [
      12, 18, 14, 24, 16, 14, 14, 8, 14, 18, 24, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsIn, 'Weekly Purchases-Inward');

    // -------------------------------------------------------------------------
    // SHEET 4: Weekly Issues/Outward
    // -------------------------------------------------------------------------
    const outFallback = [
      'Date', 'Transaction Number', 'Type', 'Party', 'Lot Number', 'Yarn Count',
      'PO Number', 'Purpose', 'Bags', 'Quantity KG', 'Reference', 'Logged By',
    ];
    const outRows = weeklyTransactions
      .filter((t) => t.type !== 'OPENING' && t.type !== 'RECEIVED')
      .map((t) => ({
        'Date': formatDate(t.transactionDate),
        'Transaction Number': t.transactionNumber,
        'Type': t.type,
        'Party': t.party?.name || '—',
        'Lot Number': t.lot?.lotNumber || '—',
        'Yarn Count': t.yarnCount || t.lot?.yarnCount || '—',
        'PO Number': t.poNumber || '—',
        'Purpose': t.purpose || '—',
        'Bags': t.bags ?? 0,
        'Quantity KG': formatDecimal(t.kilos),
        'Reference': t.referenceNumber || '—',
        'Logged By': t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim() : 'System',
      }));
    const wsOut = createStyledSheet(outRows, outFallback, [
      12, 18, 14, 22, 16, 14, 14, 14, 8, 14, 18, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsOut, 'Weekly Issues-Outward');

    // -------------------------------------------------------------------------
    // SHEET 5: Weekly Production
    // -------------------------------------------------------------------------
    const prodFallback = [
      'Production Order', 'Status', 'Team', 'Department', 'Product', 'Target KG',
      'Allocated KG', 'Issued KG', 'Consumed KG', 'Output KG', 'Start Date', 'Target Date',
    ];
    const prodRows = weeklyProductionOrders.map((po) => {
      const allocatedKg = po.allocations.reduce((acc, a) => acc + Number(a.allocatedKg || 0), 0);
      const issuedKg = po.allocations.reduce((acc, a) => acc + Number(a.issuedKg || 0), 0);
      const consumedKg = po.consumptionRecords.reduce((acc, c) => acc + Number(c.consumedKg || 0), 0);
      const outputKg = po.outputs.reduce((acc, o) => acc + Number(o.outputQuantityKg || 0), 0);
      return {
        'Production Order': po.orderNumber,
        'Status': po.status,
        'Team': po.productionTeam?.name || '—',
        'Department': po.productionTeam?.department || '—',
        'Product': po.productName || '—',
        'Target KG': formatDecimal(po.targetQuantity),
        'Allocated KG': formatDecimal(allocatedKg),
        'Issued KG': formatDecimal(issuedKg),
        'Consumed KG': formatDecimal(consumedKg),
        'Output KG': formatDecimal(outputKg),
        'Start Date': formatDate(po.startDate),
        'Target Date': formatDate(po.targetDate),
      };
    });
    const wsProd = createStyledSheet(prodRows, prodFallback, [
      18, 14, 20, 16, 20, 14, 14, 14, 14, 14, 12, 12,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsProd, 'Weekly Production');

    // -------------------------------------------------------------------------
    // SHEET 6: Weekly Consumption
    // -------------------------------------------------------------------------
    const consFallback = [
      'Date', 'Production Order', 'Team', 'Lot Number', 'Yarn Count', 'Bags',
      'Consumed KG', 'Waste KG', 'Purpose', 'Recorded By',
    ];
    const consRows = weeklyConsumptions.map((c) => ({
      'Date': formatDate(c.consumptionDate),
      'Production Order': c.productionOrder?.orderNumber || '—',
      'Team': c.productionTeam?.name || '—',
      'Lot Number': c.lot?.lotNumber || '—',
      'Yarn Count': c.yarnCount || c.lot?.yarnCount || '—',
      'Bags': c.bags ?? 0,
      'Consumed KG': formatDecimal(c.consumedKg),
      'Waste KG': formatDecimal(c.wasteKg),
      'Purpose': c.purpose || '—',
      'Recorded By': c.recordedBy ? `${c.recordedBy.firstName} ${c.recordedBy.lastName}`.trim() : 'System',
    }));
    const wsCons = createStyledSheet(consRows, consFallback, [
      12, 18, 20, 16, 14, 8, 14, 12, 14, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsCons, 'Weekly Consumption');

    // -------------------------------------------------------------------------
    // SHEET 7: Weekly Waste
    // -------------------------------------------------------------------------
    const wasteFallback = [
      'Date', 'Production Order', 'Team', 'Lot Number', 'Waste KG', 'Category',
      'Consumed Ref KG', 'Recorded By', 'Remarks',
    ];
    const wasteRows = weeklyConsumptions
      .filter((c) => Number(c.wasteKg || 0) > 0)
      .map((c) => ({
        'Date': formatDate(c.consumptionDate),
        'Production Order': c.productionOrder?.orderNumber || '—',
        'Team': c.productionTeam?.name || '—',
        'Lot Number': c.lot?.lotNumber || '—',
        'Waste KG': formatDecimal(c.wasteKg),
        'Category': c.wasteCategory || 'PROCESS_WASTE',
        'Consumed Ref KG': formatDecimal(c.consumedKg),
        'Recorded By': c.recordedBy ? `${c.recordedBy.firstName} ${c.recordedBy.lastName}`.trim() : 'System',
        'Remarks': c.remarks || '—',
      }));
    const wsWaste = createStyledSheet(wasteRows, wasteFallback, [
      12, 18, 20, 16, 14, 18, 16, 18, 24,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsWaste, 'Weekly Waste');

    // -------------------------------------------------------------------------
    // SHEET 8: Weekly Returns
    // -------------------------------------------------------------------------
    const retFallback = [
      'Date', 'Production Order', 'Team', 'Lot Number', 'Yarn Count', 'Returned Bags',
      'Returned KG', 'Reason', 'Recorded By', 'Remarks',
    ];
    const retRows = weeklyReturns.map((r) => ({
      'Date': formatDate(r.returnDate),
      'Production Order': r.productionOrder?.orderNumber || '—',
      'Team': r.productionTeam?.name || '—',
      'Lot Number': r.lot?.lotNumber || '—',
      'Yarn Count': r.yarnCount || r.lot?.yarnCount || '—',
      'Returned Bags': r.returnedBags ?? 0,
      'Returned KG': formatDecimal(r.returnedKg),
      'Reason': r.reason || 'Floor surplus',
      'Recorded By': r.recordedBy ? `${r.recordedBy.firstName} ${r.recordedBy.lastName}`.trim() : 'System',
      'Remarks': r.remarks || '—',
    }));
    const wsRet = createStyledSheet(retRows, retFallback, [
      12, 18, 20, 16, 14, 14, 14, 18, 18, 24,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsRet, 'Weekly Returns');

    // -------------------------------------------------------------------------
    // SHEET 9: Weekly Finished Output
    // -------------------------------------------------------------------------
    const outFinFallback = [
      'Date', 'Production Order', 'Batch Number', 'Product Name', 'Product Code',
      'Output KG', 'Status', 'Recorded By',
    ];
    const outFinRows = weeklyOutputs.map((o) => ({
      'Date': formatDate(o.outputDate),
      'Production Order': o.productionOrder?.orderNumber || '—',
      'Batch Number': o.batchNumber || '—',
      'Product Name': o.productName || o.product?.name || '—',
      'Product Code': o.productCode || o.product?.productCode || '—',
      'Output KG': formatDecimal(o.outputQuantityKg),
      'Status': o.status || 'PRODUCED',
      'Recorded By': o.recordedBy ? `${o.recordedBy.firstName} ${o.recordedBy.lastName}`.trim() : 'System',
    }));
    const wsOutFin = createStyledSheet(outFinRows, outFinFallback, [
      12, 18, 18, 22, 16, 14, 14, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsOutFin, 'Weekly Finished Output');

    // -------------------------------------------------------------------------
    // SHEET 10: Weekly Deliveries
    // -------------------------------------------------------------------------
    const delFallback = [
      'Date', 'Delivery Number', 'Customer/Party', 'Product', 'Product Code',
      'Dispatched KG', 'Status', 'Vehicle Number', 'Challan / LR',
    ];
    const delRows = weeklyDeliveries.map((d) => ({
      'Date': formatDate(d.dispatchDate),
      'Delivery Number': d.deliveryNumber,
      'Customer/Party': d.party?.name || '—',
      'Product': d.product?.name || d.productionOutput?.productName || '—',
      'Product Code': d.product?.productCode || d.productionOutput?.productCode || '—',
      'Dispatched KG': formatDecimal(d.dispatchedKg),
      'Status': d.status,
      'Vehicle Number': d.vehicleNumber || '—',
      'Challan / LR': d.lrNumber || '—',
    }));
    const wsDel = createStyledSheet(delRows, delFallback, [
      12, 18, 24, 22, 16, 14, 12, 16, 18,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsDel, 'Weekly Deliveries');

    // -------------------------------------------------------------------------
    // SHEET 11: Weekly Purchase Order activity
    // -------------------------------------------------------------------------
    const poActFallback = [
      'PO Number', 'Party', 'Status', 'Order Date', 'Requirement', 'Yarn Count',
      'Required KG', 'Issued KG', 'Remaining KG',
    ];
    const poActRows: any[] = [];
    weeklyPOs.forEach((po) => {
      if (!po.requirements || po.requirements.length === 0) {
        poActRows.push({
          'PO Number': po.poNumber,
          'Party': po.party?.name || '—',
          'Status': po.status,
          'Order Date': formatDate(po.orderDate),
          'Requirement': '—',
          'Yarn Count': '—',
          'Required KG': 0,
          'Issued KG': 0,
          'Remaining KG': 0,
        });
      } else {
        po.requirements.forEach((req) => {
          const reqKg = Number(req.requiredKg || 0);
          const issKg = Number(req.issuedKg || 0);
          poActRows.push({
            'PO Number': po.poNumber,
            'Party': po.party?.name || '—',
            'Status': po.status,
            'Order Date': formatDate(po.orderDate),
            'Requirement': req.useFor || req.quality || 'Requirement',
            'Yarn Count': req.yarnCount || '—',
            'Required KG': formatDecimal(reqKg),
            'Issued KG': formatDecimal(issKg),
            'Remaining KG': formatDecimal(Math.max(0, reqKg - issKg)),
          });
        });
      }
    });
    const wsPOAct = createStyledSheet(poActRows, poActFallback, [
      16, 24, 14, 12, 18, 14, 14, 14, 14,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsPOAct, 'Weekly PO Activity');

    // -------------------------------------------------------------------------
    // SHEET 12: Weekly Audit Activity
    // -------------------------------------------------------------------------
    const audActFallback = [
      'Timestamp', 'User', 'Action', 'Module', 'Entity Type', 'Entity ID', 'IP Address',
    ];
    const audActRows = weeklyAuditLogs.map((a) => ({
      'Timestamp': formatDateTime(a.timestamp),
      'User': a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : 'System',
      'Action': a.action,
      'Module': a.module,
      'Entity Type': a.entityType,
      'Entity ID': a.entityId || '—',
      'IP Address': a.ipAddress || '—',
    }));
    const wsAudAct = createStyledSheet(audActRows, audActFallback, [
      20, 18, 16, 16, 16, 26, 16,
    ]);
    XLSX.utils.book_append_sheet(workbook, wsAudAct, 'Weekly Audit Activity');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return {
      buffer: excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `YarnTrace_Weekly_Report_${startStr}_to_${endStr}.xlsx`,
    };
  }
}
