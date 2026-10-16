require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function forensic() {
  console.log('=== FORENSIC INVESTIGATION: LOT 2014 & MISSING TRANSACTIONS ===');

  // Search all audit logs in memory
  const allLogs = await prisma.auditLog.findMany();
  const ceilMatchingLogs = allLogs.filter((l) => {
    const str = JSON.stringify(l);
    return str.includes('CEIL') || str.includes('PO-CEIL') || str.includes('635375') || str.includes('672660');
  });
  console.log('Total audit logs containing CEIL or the missing TX numbers:', ceilMatchingLogs.length);
  ceilMatchingLogs.forEach((l) => {
    console.log(`- ID: ${l.id}, Action: ${l.action}, Entity: ${l.entityType} (${l.entityId}), Time: ${l.timestamp.toISOString()}`);
    console.log(`  NewValue:`, l.newValue);
    console.log(`  OldValue:`, l.oldValue);
    console.log(`  Metadata:`, l.metadata);
  });

  // 2. Check if there are any Purchase Orders created or deleted around that time
  const poLogs = allLogs.filter((l) => {
    const str = JSON.stringify(l);
    return str.includes('PURCHASE_ORDER') || str.includes('PurchaseOrder');
  });
  console.log('\nTotal Purchase Order audit logs:', poLogs.length);
  poLogs.forEach((l) => {
    console.log(`- Action: ${l.action}, EntityId: ${l.entityId}, Time: ${l.timestamp.toISOString()}, Metadata:`, l.metadata);
  });

  // 3. Inspect Lot 2014 current state
  const lot2014 = await prisma.lot.findFirst({
    where: { lotNumber: { contains: '2014' } },
    include: {
      transactions: true,
      stockBalances: true,
      yarnAllocations: true,
      consumptionRecords: true,
      productionReturns: true,
      dyeingMovements: true,
    },
  });
  console.log('\nLot 2014 Current State:');
  console.log(JSON.stringify(lot2014, null, 2));

  // 4. Check if there are any transactions in Transaction table
  const allTx = await prisma.transaction.findMany();
  console.log('\nAll Transactions in DB:');
  allTx.forEach((t) => {
    console.log(`- ${t.transactionNumber} (ID: ${t.id}): Type=${t.type}, Kilos=${t.kilos}, Bags=${t.bags}, LotId=${t.lotId}, PONum=${t.poNumber}, POReqId=${t.poRequirementId}`);
  });
}

forensic()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
