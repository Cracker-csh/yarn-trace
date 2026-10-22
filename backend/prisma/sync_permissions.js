const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ALL_PERMISSIONS = [
  // DASHBOARD
  { key: 'dashboard.view', name: 'View Dashboard', module: 'DASHBOARD' },
  { key: 'view_dashboard', name: 'View Dashboard (Legacy)', module: 'DASHBOARD' },

  // INVENTORY
  { key: 'view_inventory', name: 'View Inventory', module: 'INVENTORY' },
  { key: 'inventory.view', name: 'View Inventory (v2)', module: 'INVENTORY' },
  { key: 'inventory.add_opening', name: 'Add Opening Stock', module: 'INVENTORY' },
  { key: 'inventory.receive', name: 'Receive Inward Yarn', module: 'INVENTORY' },
  { key: 'receive_stock', name: 'Receive Stock (Legacy)', module: 'INVENTORY' },
  { key: 'inventory.issue', name: 'Issue Yarn to Production', module: 'INVENTORY' },
  { key: 'inventory.return', name: 'Return Issued Yarn', module: 'INVENTORY' },
  { key: 'inventory.retire', name: 'Retire / Write-off Stock', module: 'INVENTORY' },
  { key: 'inventory.sell', name: 'Sell Stock Externally', module: 'INVENTORY' },
  { key: 'inventory.correct', name: 'Correct / Reverse Transactions', module: 'INVENTORY' },
  { key: 'inventory.export', name: 'Export Inventory Records', module: 'INVENTORY' },
  { key: 'add_yarn', name: 'Add Yarn', module: 'INVENTORY' },
  { key: 'issue_yarn', name: 'Issue Yarn', module: 'INVENTORY' },
  { key: 'update_stock', name: 'Update Stock', module: 'INVENTORY' },

  // PRODUCTION
  { key: 'manage_production', name: 'Manage Production', module: 'PRODUCTION' },
  { key: 'record_consumption', name: 'Record Consumption', module: 'PRODUCTION' },
  { key: 'production.view', name: 'View Production Orders & Floor', module: 'PRODUCTION' },
  { key: 'production.create', name: 'Create Work Orders', module: 'PRODUCTION' },
  { key: 'production.edit', name: 'Edit Work Orders', module: 'PRODUCTION' },
  { key: 'production.allocate', name: 'Allocate Issued Yarn to Teams', module: 'PRODUCTION' },
  { key: 'production.consume', name: 'Record Actual Floor Consumption', module: 'PRODUCTION' },
  { key: 'production.return', name: 'Return Unused Yarn from Team', module: 'PRODUCTION' },
  { key: 'production.complete', name: 'Complete Work Orders', module: 'PRODUCTION' },
  { key: 'production.cancel', name: 'Cancel Work Orders', module: 'PRODUCTION' },
  { key: 'production.correct', name: 'Correct Consumption Records', module: 'PRODUCTION' },
  { key: 'production.manage_teams', name: 'Manage Production Teams Master', module: 'PRODUCTION' },
  { key: 'production.view_reports', name: 'View Production Reports', module: 'PRODUCTION' },
  { key: 'production.output', name: 'Record Production Output', module: 'PRODUCTION' },

  // COMMERCIAL (SUPPLIERS, PARTIES & PURCHASE ORDERS)
  { key: 'manage_suppliers', name: 'Manage Suppliers', module: 'COMMERCIAL' },
  { key: 'manage_parties', name: 'Manage Parties', module: 'COMMERCIAL' },
  { key: 'manage_purchase_orders', name: 'Manage Purchase Orders', module: 'COMMERCIAL' },
  { key: 'purchase_orders.view', name: 'View Purchase Orders', module: 'COMMERCIAL' },
  { key: 'purchase_orders.create', name: 'Create Purchase Orders', module: 'COMMERCIAL' },
  { key: 'purchase_orders.edit', name: 'Edit Purchase Orders', module: 'COMMERCIAL' },
  { key: 'purchase_orders.cancel', name: 'Cancel Purchase Orders', module: 'COMMERCIAL' },
  { key: 'purchase_orders.manage_requirements', name: 'Manage PO Requirements', module: 'COMMERCIAL' },

  // FINISHED GOODS / PRODUCTS
  { key: 'products.view', name: 'View Output Products', module: 'PRODUCTS' },
  { key: 'products.create', name: 'Register Output Batch', module: 'PRODUCTS' },
  { key: 'products.edit', name: 'Edit Output Batch', module: 'PRODUCTS' },
  { key: 'products.cancel', name: 'Cancel / Quarantine Output Batch', module: 'PRODUCTS' },
  { key: 'products.export', name: 'Export Finished Products', module: 'PRODUCTS' },

  // TRACEABILITY
  { key: 'view_traceability', name: 'View Traceability', module: 'TRACEABILITY' },
  { key: 'traceability.view', name: 'View Traceability Tree', module: 'TRACEABILITY' },
  { key: 'traceability.export', name: 'Export Traceability Tree', module: 'TRACEABILITY' },

  // REPORTS
  { key: 'view_reports', name: 'View Reports', module: 'REPORTS' },

  // GOVERNANCE
  { key: 'manage_users', name: 'Manage Users', module: 'GOVERNANCE' },
  { key: 'manage_roles', name: 'Manage Roles', module: 'GOVERNANCE' },
  { key: 'view_audit_logs', name: 'View Audit Logs', module: 'GOVERNANCE' },
  { key: 'edit_records', name: 'Edit Records', module: 'GOVERNANCE' },
  { key: 'delete_records', name: 'Delete Records', module: 'GOVERNANCE' },
];

async function sync() {
  console.log('Batch inserting missing permissions...');
  const res = await prisma.permission.createMany({
    data: ALL_PERMISSIONS,
    skipDuplicates: true,
  });
  console.log(`Inserted ${res.count} new permissions.`);

  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  if (adminRole) {
    const allDbPerms = await prisma.permission.findMany();
    const rolePermData = allDbPerms.map((p) => ({
      roleId: adminRole.id,
      permissionId: p.id,
    }));
    const rpRes = await prisma.rolePermission.createMany({
      data: rolePermData,
      skipDuplicates: true,
    });
    console.log(`Assigned ${rpRes.count} permissions to ADMIN.`);
  }

  const total = await prisma.permission.count();
  console.log(`SUCCESS: Total permissions available in database: ${total}`);
}

sync()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
