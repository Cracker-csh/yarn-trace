require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function backup() {
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `db_backup_${timestamp}.json`);

  console.log('Initiating pre-migration / pre-fix database backup...');
  const backupData = {
    timestamp: new Date().toISOString(),
    users: await prisma.user.findMany(),
    roles: await prisma.role.findMany(),
    permissions: await prisma.permission.findMany(),
    rolePermissions: await prisma.rolePermission.findMany(),
    parties: await prisma.party.findMany(),
    lots: await prisma.lot.findMany(),
    stockBalances: await prisma.stockBalance.findMany(),
    transactions: await prisma.transaction.findMany(),
    purchaseOrders: await prisma.purchaseOrder.findMany(),
    poRequirements: await prisma.pORequirement.findMany(),
    productionTeams: await prisma.productionTeam.findMany(),
    productionOrders: await prisma.productionOrder.findMany(),
    yarnAllocations: await prisma.yarnAllocation.findMany(),
    consumptionRecords: await prisma.consumptionRecord.findMany(),
    productionOutputs: await prisma.productionOutput.findMany(),
    products: await prisma.product.findMany(),
    auditLogs: await prisma.auditLog.findMany(),
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`✅ Backup successfully saved to: ${backupFile}`);
  console.log(`Summary of backed-up records:`, {
    lots: backupData.lots.length,
    transactions: backupData.transactions.length,
    stockBalances: backupData.stockBalances.length,
    auditLogs: backupData.auditLogs.length,
    purchaseOrders: backupData.purchaseOrders.length,
    poRequirements: backupData.poRequirements.length,
  });
}

backup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
