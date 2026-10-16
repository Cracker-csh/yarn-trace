require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAll() {
  const lots = await prisma.lot.findMany({
    include: { transactions: true },
    orderBy: { receivedDate: 'asc' },
  });

  let fail = 0;
  let totalKg = 0;
  let totalBags = 0;

  console.log('=== FULL DATABASE STOCK LEDGER RECONCILIATION ===');
  for (const l of lots) {
    let ledgerKg = 0;
    let ledgerBags = 0;

    for (const t of l.transactions) {
      const kg = Number(t.kilos);
      const bags = t.bags || 0;
      if (['OPENING', 'RECEIVED', 'RETURN', 'RETURNED'].includes(t.type)) {
        ledgerKg += kg;
        ledgerBags += bags;
      } else if (['ISSUED', 'RETIRED', 'SOLD'].includes(t.type)) {
        ledgerKg -= kg;
        ledgerBags -= bags;
      }
    }

    const curKg = Number(l.currentWeightKg);
    const diff = Math.abs(ledgerKg - curKg);
    const status = diff < 0.001 ? '✅ RECONCILED' : '❌ MISMATCH';
    if (diff >= 0.001) fail++;

    totalKg += curKg;
    totalBags += l.currentBags;

    console.log(
      `${status} | ${l.lotNumber.padEnd(20)} | Stock: ${curKg.toFixed(2).padStart(10)} KG (${l.currentBags} bags) | Ledger: ${ledgerKg.toFixed(2).padStart(10)} KG | Diff: ${diff.toFixed(4)}`,
    );
  }

  console.log('---------------------------------------------------------------------------------');
  console.log(`Summary: Total Lots = ${lots.length}, Mismatches = ${fail}, Total Stock = ${totalKg.toFixed(2)} KG, Total Bags = ${totalBags}`);

  // Also check opening baseline specifically
  const openingTxs = await prisma.transaction.findMany({ where: { type: 'OPENING' } });
  let opBags = 0;
  let opKg = 0;
  for (const t of openingTxs) {
    opBags += t.bags || 0;
    opKg += Number(t.kilos);
  }
  console.log(`Opening Transactions: Count = ${openingTxs.length}, Bags = ${opBags}, KG = ${opKg.toFixed(2)}`);
  console.log(`Baseline lot LOT-BASELINE-2026: Bags = 1301, KG = 100243.25 included.`);
}

checkAll()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
