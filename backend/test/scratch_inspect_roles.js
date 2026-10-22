require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function inspect() {
  const roles = await p.role.findMany({
    include: {
      rolePermissions: {
        include: { permission: true }
      }
    }
  });

  console.log('=== ROLES IN SYSTEM ===');
  for (const r of roles) {
    console.log(`Role: ${r.name} (${r.code}) [System: ${r.isSystem}] -> ${r.rolePermissions.length} permissions`);
    const permKeys = r.rolePermissions.map(rp => rp.permission.key).sort();
    console.log(`   Permissions: ${permKeys.join(', ')}`);
  }

  const allPerms = await p.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] });
  console.log('\n=== ALL DEFINED PERMISSIONS (' + allPerms.length + ') ===');
  for (const perm of allPerms) {
    console.log(`[${perm.module}] ${perm.key.padEnd(30)}: ${perm.name}`);
  }

  const users = await p.user.findMany({
    include: { role: true }
  });
  console.log('\n=== EXISTING USERS (' + users.length + ') ===');
  for (const u of users) {
    console.log(`User: ${u.email} | Name: ${u.firstName} ${u.lastName} | Role: ${u.role.code} | Status: ${u.status}`);
  }

  await p.$disconnect();
}

inspect().catch(err => {
  console.error(err);
  p.$disconnect();
});
