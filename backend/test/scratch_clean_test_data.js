const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- INSPECTING TEST DATA TO REVERT ---');
  
  // Find test lots
  const testLots = await prisma.lot.findMany({
    where: {
      OR: [
        { lotNumber: { startsWith: 'LOT-UX' } },
        { lotNumber: { startsWith: 'UNAUTH' } },
        { lotNumber: { startsWith: 'LOT-TEST' } },
      ],
    },
    select: {
      id: true,
      lotNumber: true,
    },
  });

  console.log(`Found ${testLots.length} test lots to clean up:`);
  for (const lot of testLots) {
    console.log(`- Lot: ${lot.lotNumber} (ID: ${lot.id})`);
  }

  // Find test POs
  const testPOs = await prisma.purchaseOrder.findMany({
    where: { poNumber: { startsWith: 'PO-TEST' } },
    select: { id: true, poNumber: true },
  });
  console.log(`Found ${testPOs.length} test purchase orders to clean up:`);
  for (const po of testPOs) {
    console.log(`- PO: ${po.poNumber} (ID: ${po.id})`);
  }

  // Find test production orders
  const testOrders = await prisma.productionOrder.findMany({
    where: {
      OR: [
        { orderNumber: { startsWith: 'ORD-UX' } },
        { orderNumber: { startsWith: 'PO-TEST' } },
        { orderNumber: { startsWith: 'PROD-TEST' } },
      ],
    },
    select: { id: true, orderNumber: true },
  });
  console.log(`Found ${testOrders.length} test production orders to clean up:`);

  const lotIds = testLots.map(l => l.id);
  const poIds = testPOs.map(p => p.id);
  const orderIds = testOrders.map(o => o.id);

  if (lotIds.length === 0 && poIds.length === 0 && orderIds.length === 0) {
    console.log('\nNo test records found to delete. Database is completely clean.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n--- REVERTING / CLEANING TEST DATA ---');

  await prisma.$transaction(async (tx) => {
    // 1. Delete test production orders and children
    if (orderIds.length > 0) {
      await tx.consumptionRecord.deleteMany({ where: { productionOrderId: { in: orderIds } } });
      await tx.productionReturn.deleteMany({ where: { productionOrderId: { in: orderIds } } });
      await tx.productionOutput.deleteMany({ where: { productionOrderId: { in: orderIds } } });
      await tx.yarnAllocation.deleteMany({ where: { productionOrderId: { in: orderIds } } });
      await tx.productionOrder.deleteMany({ where: { id: { in: orderIds } } });
      console.log(`✓ Deleted test production orders`);
    }

    // 2. Delete test POs
    if (poIds.length > 0) {
      await tx.pORequirement.deleteMany({ where: { purchaseOrderId: { in: poIds } } });
      await tx.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
      console.log(`✓ Deleted test purchase orders and requirements`);
    }

    // 3. Delete allocations & transactions linked to test lots
    if (lotIds.length > 0) {
      await tx.yarnAllocation.deleteMany({ where: { lotId: { in: lotIds } } });
      await tx.consumptionRecord.deleteMany({ where: { lotId: { in: lotIds } } });
      await tx.productionReturn.deleteMany({ where: { lotId: { in: lotIds } } });
      
      // Delete transaction items
      await tx.transactionItem.deleteMany({ where: { lotId: { in: lotIds } } });

      // Delete transactions linked to these lots
      const txs = await tx.transaction.findMany({ where: { lotId: { in: lotIds } }, select: { id: true } });
      const txIds = txs.map(t => t.id);
      if (txIds.length > 0) {
        await tx.transaction.updateMany({
          where: { referenceTransactionId: { in: txIds } },
          data: { referenceTransactionId: null },
        });
        await tx.transaction.deleteMany({ where: { id: { in: txIds } } });
      }
      console.log(`✓ Deleted test transactions for test lots`);

      // Delete StockBalance records for these lots
      await tx.stockBalance.deleteMany({ where: { lotId: { in: lotIds } } });
      console.log(`✓ Deleted test stock balances`);

      // Delete the lots themselves
      await tx.lot.deleteMany({ where: { id: { in: lotIds } } });
      console.log(`✓ Deleted test lots`);
    }
  });

  console.log('\n--- VERIFYING CLEANUP ---');
  const allLots = await prisma.lot.findMany({
    select: { lotNumber: true, yarnCount: true, currentWeightKg: true, status: true },
  });
  console.log('Remaining Lots in Database:');
  console.table(allLots);

  const allPOs = await prisma.purchaseOrder.findMany({
    select: { poNumber: true, status: true },
  });
  console.log('Remaining Purchase Orders in Database:');
  console.table(allPOs);

  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error('Error during cleanup:', e);
  await prisma.$disconnect();
  process.exit(1);
});
