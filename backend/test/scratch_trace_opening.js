require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Let's inspect the code of addOpeningStock directly
async function testDirect() {
  const party = await prisma.party.findFirst({ where: { code: 'TEST-SUPPLIER-01' } });
  console.log('Party:', party.id);

  const dto = {
    transactionDate: '2026-10-20',
    count: 'GREY Cotton Yarn 30s',
    partyId: party.id,
    lotNumber: 'LOT-TEST-DEBUG-2',
    bags: 10,
    kilos: 300.0,
    remarks: 'Debug opening stock'
  };

  try {
    const defaultLoc = await prisma.stockLocation.findFirst({ where: { code: 'MAIN_WH' } });
    console.log('Location:', defaultLoc?.id);

    const kgDecimal = dto.kilos;

    const result = await prisma.$transaction(async (tx) => {
      const lot = await tx.lot.create({
        data: {
          lotNumber: dto.lotNumber.trim(),
          yarnCount: dto.count.trim(),
          supplierId: party.id,
          initialBags: dto.bags,
          initialWeightKg: kgDecimal,
          currentBags: dto.bags,
          currentWeightKg: kgDecimal,
          millLotNumber: null,
          shadeCode: null,
          remarks: dto.remarks?.trim() || null,
          receivedDate: new Date(dto.transactionDate),
          status: 'APPROVED',
        },
      });
      console.log('Lot created:', lot.id);

      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(1000 + Math.random() * 9000);
      const txNum = `TXN-OPN-${timestamp}-${random}`;

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: txNum,
          type: 'OPENING',
          transactionDate: new Date(dto.transactionDate),
          yarnCount: dto.count.trim(),
          partyId: party.id,
          lotId: lot.id,
          bags: dto.bags,
          kilos: kgDecimal,
          notes: dto.remarks?.trim() || 'Opening Stock Entry',
          createdById: null,
        },
        include: {
          party: true,
          lot: true,
        },
      });
      console.log('Transaction created:', transaction.id);

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
      console.log('StockBalance upserted');

      await tx.auditLog.create({
        data: {
          userId: null,
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
      console.log('AuditLog created');

      return transaction;
    });

    console.log('Success:', result.transactionNumber);
  } catch (err) {
    console.error('ERROR STACK TRACE:\n', err);
  } finally {
    await prisma.$disconnect();
  }
}

testDirect();
