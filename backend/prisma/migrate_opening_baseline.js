require('dotenv').config();
const { PrismaClient, TransactionType, LotStatus } = require('@prisma/client');
const prisma = new PrismaClient();

const BASELINE_DATE = new Date('2026-08-30T00:00:00.000Z');
const BASELINE_BAGS = 1301;
const BASELINE_WEIGHT_KG = 100243.25;
const BASELINE_LOT_NUMBER = 'LOT-BASELINE-2026';
const BASELINE_TX_NUMBER = 'TXN-OPN-20260830-1301';
const BASELINE_COUNT = '1/10 KW';

async function migrateOpeningBaseline() {
  console.log('=== IDEMPOTENT OPENING STOCK BASELINE MIGRATION ===');
  console.log(`Target Baseline Date:   ${BASELINE_DATE.toISOString().split('T')[0]}`);
  console.log(`Target Baseline Bags:   ${BASELINE_BAGS}`);
  console.log(`Target Baseline Weight: ${BASELINE_WEIGHT_KG} KG`);
  console.log(`Target Lot Number:      ${BASELINE_LOT_NUMBER}`);

  // 1. Idempotency check: Does this baseline already exist?
  const existingTx = await prisma.transaction.findUnique({
    where: { transactionNumber: BASELINE_TX_NUMBER },
  });

  const existingLot = await prisma.lot.findUnique({
    where: { lotNumber: BASELINE_LOT_NUMBER },
  });

  if (existingTx && existingLot) {
    console.log('\n⚠️ Baseline transaction and lot already exist in database:');
    console.log(`  Transaction: ${existingTx.transactionNumber} (Bags: ${existingTx.bags}, KG: ${existingTx.kilos})`);
    console.log(`  Lot: ${existingLot.lotNumber} (Bags: ${existingLot.currentBags}, KG: ${existingLot.currentWeightKg})`);
    console.log('✅ Migration skipped to prevent duplicate balance addition.');
    return;
  }

  // 2. Identify default supplier party (Vardhman Textiles Ltd)
  let supplier = await prisma.party.findFirst({
    where: { code: 'VARDHMAN' },
  });

  if (!supplier) {
    supplier = await prisma.party.findFirst({
      where: { type: 'SUPPLIER' },
    });
  }

  if (!supplier) {
    throw new Error('No supplier party found in database to associate baseline opening lot.');
  }

  // 3. Admin user for audit trail
  const adminUser = await prisma.user.findFirst({
    where: { role: { code: 'ADMIN' } },
  });

  // 4. Execute atomic migration in single transaction
  await prisma.$transaction(async (tx) => {
    // 4.1 Get or create Main Warehouse
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

    // 4.2 Create or update baseline lot
    let lot = await tx.lot.findUnique({
      where: { lotNumber: BASELINE_LOT_NUMBER },
    });

    if (!lot) {
      lot = await tx.lot.create({
        data: {
          lotNumber: BASELINE_LOT_NUMBER,
          yarnCount: BASELINE_COUNT,
          supplierId: supplier.id,
          initialBags: BASELINE_BAGS,
          initialWeightKg: BASELINE_WEIGHT_KG,
          currentBags: BASELINE_BAGS,
          currentWeightKg: BASELINE_WEIGHT_KG,
          receivedDate: BASELINE_DATE,
          status: LotStatus.RECEIVED,
          remarks: 'Historical opening acceptance baseline (30-Aug-2026)',
        },
      });
      console.log(`✅ Created Lot ${lot.lotNumber} (ID: ${lot.id})`);
    }

    // 4.3 Create baseline OPENING transaction
    const transaction = await tx.transaction.create({
      data: {
        id: '00000000-0000-0000-0000-202608301301',
        transactionNumber: BASELINE_TX_NUMBER,
        type: TransactionType.OPENING,
        transactionDate: BASELINE_DATE,
        yarnCount: BASELINE_COUNT,
        partyId: supplier.id,
        lotId: lot.id,
        bags: BASELINE_BAGS,
        kilos: BASELINE_WEIGHT_KG,
        notes: 'Excel acceptance baseline 30-Aug-2026 (Historical Archive Baseline)',
        referenceNumber: 'BASELINE-2026-08-30',
        createdById: adminUser?.id || null,
      },
    });
    console.log(`✅ Created Transaction ${transaction.transactionNumber} (Bags: ${transaction.bags}, KG: ${transaction.kilos})`);

    // 4.4 Upsert StockBalance
    await tx.stockBalance.upsert({
      where: {
        lotId_locationId: {
          lotId: lot.id,
          locationId: location.id,
        },
      },
      update: {
        quantityKg: lot.currentWeightKg,
        bagsCount: lot.currentBags,
      },
      create: {
        lotId: lot.id,
        locationId: location.id,
        quantityKg: lot.currentWeightKg,
        bagsCount: lot.currentBags,
      },
    });
    console.log(`✅ Upserted StockBalance for lot ${lot.lotNumber} in location ${location.code}`);

    // 4.5 Record Audit Log
    await tx.auditLog.create({
      data: {
        userId: adminUser?.id || null,
        action: 'MIGRATE_OPENING_BASELINE',
        module: 'INVENTORY',
        entityType: 'Transaction',
        entityId: transaction.id,
        newValue: {
          transactionNumber: transaction.transactionNumber,
          lotNumber: lot.lotNumber,
          bags: BASELINE_BAGS,
          kilos: BASELINE_WEIGHT_KG,
          date: BASELINE_DATE.toISOString(),
          supplier: supplier.name,
        },
        metadata: {
          purpose: 'Historical baseline acceptance migration (30-Aug-2026)',
          idempotencyKey: BASELINE_TX_NUMBER,
        },
      },
    });
    console.log(`✅ AuditLog record created for baseline migration.`);
  });

  console.log('\n🎉 OPENING BASELINE MIGRATION COMPLETED SUCCESSFULLY!');
}

migrateOpeningBaseline()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
