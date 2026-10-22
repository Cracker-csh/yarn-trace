const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function run() {
  const lots = await p.lot.findMany({
    where: { lotNumber: { in: ['LOT-TEST-101', 'LOT-TEST-102', 'LOT-TEST-103', 'LOT-TEST-REJ-5'] } },
    include: { transactions: true }
  });
  console.log('=== TEST LOTS IN DATABASE ===');
  for (const l of lots) {
    console.log(`Lot: ${l.lotNumber} | Weight: ${l.currentWeightKg} KG | Bags: ${l.currentBags} | Status: ${l.status}`);
    for (const t of l.transactions) {
      console.log(`   Tx: ${t.transactionNumber} [${t.type}] | ${t.kilos} KG | Bags: ${t.bags}`);
    }
  }

  const pos = await p.purchaseOrder.findMany({
    where: { poNumber: 'PO-TEST-150' },
    include: { requirements: true }
  });
  console.log('\n=== TEST PO IN DATABASE ===');
  for (const po of pos) {
    console.log(`PO: ${po.poNumber} | Status: ${po.status}`);
    for (const req of po.requirements) {
      console.log(`   Req: ${req.yarnCount} (${req.purpose}) | Required: ${req.requiredKg} KG | Issued: ${req.issuedKg} KG | Status: ${req.status}`);
    }
  }

  const wos = await p.productionOrder.findMany({
    where: { orderNumber: 'PROD-TEST-001' },
    include: { allocations: true, consumptionRecords: true, returns: true }
  });
  console.log('\n=== TEST WO IN DATABASE ===');
  for (const wo of wos) {
    console.log(`WO: ${wo.orderNumber} | Status: ${wo.status} | Target: ${wo.targetQuantity} KG`);
    for (const a of wo.allocations) {
      console.log(`   Alloc: ${a.allocatedKg} KG (LotId: ${a.lotId})`);
    }
    for (const c of wo.consumptionRecords) {
      console.log(`   Consumption: ${c.consumedKg} KG (Waste: ${c.wasteKg} KG, Corrected: ${c.isCorrected})`);
    }
    for (const r of wo.returns) {
      console.log(`   Return: ${r.returnedKg} KG`);
    }
  }

  await p.$disconnect();
}

run();
