const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const perms = await prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { key: 'asc' }],
  });
  console.log('Total Permissions in DB:', perms.length);
  const byModule = {};
  for (const p of perms) {
    if (!byModule[p.module]) byModule[p.module] = [];
    byModule[p.module].push(p.key);
  }
  console.log(JSON.stringify(byModule, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
