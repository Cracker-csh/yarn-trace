const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  console.log('Cleaning up isolated test data before run...');
  const testLotNumbers = ['LOT-TEST-101', 'LOT-TEST-102', 'LOT-TEST-103', 'LOT-TEST-REJ-5', 'LOT-TEST-NEW-99', 'LOT-TEST-DEBUG-2'];
  const testPoNumbers = ['PO-TEST-150', 'PO-ILLEGAL', 'PO-OP'];
  const testWoNumbers = ['PROD-TEST-001'];

  const wos = await prisma.productionOrder.findMany({ where: { orderNumber: { in: testWoNumbers } } });
  const woIds = wos.map(w => w.id);
  if (woIds.length > 0) {
    await prisma.productionReturn.deleteMany({ where: { productionOrderId: { in: woIds } } });
    await prisma.consumptionRecord.deleteMany({ where: { productionOrderId: { in: woIds } } });
    await prisma.yarnAllocation.deleteMany({ where: { productionOrderId: { in: woIds } } });
    await prisma.productionOutput.deleteMany({ where: { productionOrderId: { in: woIds } } });
    await prisma.productionOrder.deleteMany({ where: { id: { in: woIds } } });
  }

  const lots = await prisma.lot.findMany({ where: { lotNumber: { in: testLotNumbers } } });
  const lotIds = lots.map(l => l.id);
  if (lotIds.length > 0) {
    await prisma.productionReturn.deleteMany({ where: { lotId: { in: lotIds } } });
    await prisma.consumptionRecord.deleteMany({ where: { lotId: { in: lotIds } } });
    await prisma.yarnAllocation.deleteMany({ where: { lotId: { in: lotIds } } });
    await prisma.transactionItem.deleteMany({ where: { lotId: { in: lotIds } } });
    await prisma.stockBalance.deleteMany({ where: { lotId: { in: lotIds } } });
    await prisma.transaction.deleteMany({ where: { lotId: { in: lotIds } } });
    await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });
  }

  const pos = await prisma.purchaseOrder.findMany({ where: { poNumber: { in: testPoNumbers } } });
  const poIds = pos.map(p => p.id);
  if (poIds.length > 0) {
    await prisma.pORequirement.deleteMany({ where: { purchaseOrderId: { in: poIds } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
  }
  await prisma.pORequirement.deleteMany({ where: { poNumber: { in: testPoNumbers } } });

  console.log('Cleanup completed successfully.');
  await prisma.$disconnect();
}
cleanup();
