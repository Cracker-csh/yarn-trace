require('dotenv').config();
const { PrismaClient, TransactionType } = require('@prisma/client');
const prisma = new PrismaClient();

async function recoverLot2014() {
  console.log('=== SAFE LEDGER RECOVERY: LOT 2014 ===');

  const lot = await prisma.lot.findUnique({
    where: { lotNumber: 'Lot 2014' },
    include: { transactions: true, stockBalances: true },
  });

  if (!lot) {
    throw new Error('Lot 2014 not found in database!');
  }

  console.log(`Found Lot 2014 (ID: ${lot.id}):`);
  console.log(`  Initial Weight: ${lot.initialWeightKg} KG, Initial Bags: ${lot.initialBags}`);
  console.log(`  Current Weight: ${lot.currentWeightKg} KG, Current Bags: ${lot.currentBags}`);
  console.log(`  Existing transactions count: ${lot.transactions.length}`);

  // Missing transactions identified from immutable audit logs:
  const missingTx1 = {
    id: '7ab93f70-449e-4b56-b03f-8d48903d51c2',
    transactionNumber: 'TXN-ISS-635375-3616',
    type: TransactionType.ISSUED,
    transactionDate: new Date('2026-10-07T12:03:55.967Z'),
    yarnCount: lot.yarnCount || '10/1 KW',
    partyId: '36fe9c3d-16ed-4a43-8ad5-2f6376849c7f',
    lotId: lot.id,
    bags: 1,
    kilos: 50.0,
    poNumber: 'PO-CEIL-9037',
    purpose: 'PILE',
    notes: 'Restored from verified audit log entry 6f6146d6-69d4-444b-bdc1-5665ff303e2c',
    createdById: '10603b70-5bd9-44e4-a61b-317217f157fe',
  };

  const missingTx2 = {
    id: 'a631d8be-9fc8-4bc3-a5a8-5762c07fa88c',
    transactionNumber: 'TXN-ISS-672660-4756',
    type: TransactionType.ISSUED,
    transactionDate: new Date('2026-10-07T12:04:33.655Z'),
    yarnCount: lot.yarnCount || '10/1 KW',
    partyId: '36fe9c3d-16ed-4a43-8ad5-2f6376849c7f',
    lotId: lot.id,
    bags: 0,
    kilos: 60.0,
    poNumber: 'PO-CEIL-1885',
    purpose: 'PILE',
    notes: 'Restored from verified audit log entry a3b180b1-c386-4ac8-8ef4-fc583351e45f',
    createdById: '10603b70-5bd9-44e4-a61b-317217f157fe',
  };

  await prisma.$transaction(async (tx) => {
    // 1. Upsert missingTx1
    const t1 = await tx.transaction.upsert({
      where: { transactionNumber: missingTx1.transactionNumber },
      update: {},
      create: missingTx1,
    });
    console.log(`✅ Transaction 1 restored/confirmed: ${t1.transactionNumber} (${t1.kilos} KG, ${t1.bags} bags)`);

    // 2. Upsert missingTx2
    const t2 = await tx.transaction.upsert({
      where: { transactionNumber: missingTx2.transactionNumber },
      update: {},
      create: missingTx2,
    });
    console.log(`✅ Transaction 2 restored/confirmed: ${t2.transactionNumber} (${t2.kilos} KG, ${t2.bags} bags)`);

    // 3. Verify ledger calculation
    const allLotTx = await tx.transaction.findMany({
      where: { lotId: lot.id, status: 'COMPLETED' },
    });

    let calculatedKg = 0;
    let calculatedBags = 0;
    for (const t of allLotTx) {
      const kg = Number(t.kilos);
      const bags = t.bags || 0;
      if (['OPENING', 'RECEIVED', 'RETURN', 'RETURNED'].includes(t.type)) {
        calculatedKg += kg;
        calculatedBags += bags;
      } else if (['ISSUED', 'RETIRED', 'SOLD'].includes(t.type)) {
        calculatedKg -= kg;
        calculatedBags -= bags;
      }
    }

    const currentKg = Number(lot.currentWeightKg);
    const diff = Math.abs(calculatedKg - currentKg);
    console.log(`\nReconciliation Check:`);
    console.log(`  Lot Current Weight: ${currentKg.toFixed(2)} KG, Bags: ${lot.currentBags}`);
    console.log(`  Ledger Sum: ${calculatedKg.toFixed(2)} KG, Bags: ${calculatedBags}`);
    console.log(`  Discrepancy: ${diff.toFixed(4)} KG`);

    if (diff > 0.0001) {
      throw new Error(`Reconciliation failed! Calculated ${calculatedKg} != Lot stock ${currentKg}`);
    }

    // 4. Record Audit Log for the recovery
    await tx.auditLog.create({
      data: {
        userId: '10603b70-5bd9-44e4-a61b-317217f157fe',
        action: 'RECOVER_LEDGER_TRANSACTION',
        module: 'INVENTORY',
        entityType: 'Lot',
        entityId: lot.id,
        newValue: {
          lotNumber: lot.lotNumber,
          restoredTransactions: [missingTx1.transactionNumber, missingTx2.transactionNumber],
          reconciledWeightKg: currentKg,
          reconciledBags: lot.currentBags,
        },
        metadata: {
          reason: 'Auditable recovery of missing ledger rows verified from audit log entries',
          restoredAt: new Date().toISOString(),
        },
      },
    });
    console.log(`✅ Audit log recorded for recovery.`);
  });

  console.log('\n🎉 LOT 2014 LEDGER RECONCILIATION COMPLETED SUCCESSFULLY!');
}

recoverLot2014()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
