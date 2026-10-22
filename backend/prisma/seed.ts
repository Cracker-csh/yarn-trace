import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient, UserStatus, YarnType, LotStatus, PartyType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log('🌱 Seeding YarnTrace foundation data...');

  // 1. Roles
  const adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: {
      name: 'Administrator',
      code: 'ADMIN',
      description: 'System administrator with unrestricted access',
      isSystem: true,
    },
  });

  const stockHeadRole = await prisma.role.upsert({
    where: { code: 'STOCK_HEAD' },
    update: {},
    create: {
      name: 'Stock Head',
      code: 'STOCK_HEAD',
      description: 'Head of yarn stock, inward lot reception, and issuance to production',
      isSystem: true,
    },
  });

  const productionHeadRole = await prisma.role.upsert({
    where: { code: 'PRODUCTION_HEAD' },
    update: {},
    create: {
      name: 'Production Head',
      code: 'PRODUCTION_HEAD',
      description: 'Production team lead responsible for floor consumption and batch output',
      isSystem: true,
    },
  });

  const qualityHeadRole = await prisma.role.upsert({
    where: { code: 'QUALITY_HEAD' },
    update: {},
    create: {
      name: 'Quality Assurance Head',
      code: 'QUALITY_HEAD',
      description: 'QA inspection and lot approval',
      isSystem: true,
    },
  });

  const stockNormalRole = await prisma.role.upsert({
    where: { code: 'STOCK_NORMAL' },
    update: {},
    create: {
      name: 'Stock Normal User',
      code: 'STOCK_NORMAL',
      description: 'View-only access to stock and inventory data',
      isSystem: true,
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { code: 'VIEWER' },
    update: {},
    create: {
      name: 'Viewer',
      code: 'VIEWER',
      description: 'Read-only access across the system',
      isSystem: true,
    },
  });

  // 2. Granular Permissions
  const permissionsList = [
    { key: 'dashboard.view', name: 'View Dashboard', module: 'DASHBOARD' },
    { key: 'view_dashboard', name: 'View Dashboard (Legacy)', module: 'DASHBOARD' },
    { key: 'view_inventory', name: 'View Inventory', module: 'INVENTORY' },
    { key: 'inventory.view', name: 'View Inventory (v2)', module: 'INVENTORY' },
    { key: 'inventory.add_opening', name: 'Add Opening Stock', module: 'INVENTORY' },
    { key: 'inventory.receive', name: 'Receive Inward Yarn', module: 'INVENTORY' },
    { key: 'inventory.issue', name: 'Issue Yarn to Production', module: 'INVENTORY' },
    { key: 'inventory.return', name: 'Return Issued Yarn', module: 'INVENTORY' },
    { key: 'inventory.retire', name: 'Retire / Write-off Stock', module: 'INVENTORY' },
    { key: 'inventory.sell', name: 'Sell Stock Externally', module: 'INVENTORY' },
    { key: 'inventory.correct', name: 'Correct / Reverse Transactions', module: 'INVENTORY' },
    { key: 'inventory.export', name: 'Export Inventory Records', module: 'INVENTORY' },
    { key: 'add_yarn', name: 'Add Yarn', module: 'INVENTORY' },
    { key: 'issue_yarn', name: 'Issue Yarn', module: 'INVENTORY' },
    { key: 'update_stock', name: 'Update Stock', module: 'INVENTORY' },
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
    { key: 'manage_suppliers', name: 'Manage Suppliers', module: 'COMMERCIAL' },
    { key: 'manage_parties', name: 'Manage Parties', module: 'COMMERCIAL' },
    { key: 'manage_purchase_orders', name: 'Manage Purchase Orders', module: 'COMMERCIAL' },
    { key: 'purchase_orders.view', name: 'View Purchase Orders', module: 'COMMERCIAL' },
    { key: 'purchase_orders.create', name: 'Create Purchase Orders', module: 'COMMERCIAL' },
    { key: 'purchase_orders.edit', name: 'Edit Purchase Orders', module: 'COMMERCIAL' },
    { key: 'purchase_orders.cancel', name: 'Cancel Purchase Orders', module: 'COMMERCIAL' },
    { key: 'purchase_orders.manage_requirements', name: 'Manage PO Requirements', module: 'COMMERCIAL' },
    { key: 'products.view', name: 'View Output Products', module: 'PRODUCTS' },
    { key: 'products.create', name: 'Register Output Batch', module: 'PRODUCTS' },
    { key: 'products.edit', name: 'Edit Output Batch', module: 'PRODUCTS' },
    { key: 'products.cancel', name: 'Cancel / Quarantine Output Batch', module: 'PRODUCTS' },
    { key: 'products.export', name: 'Export Finished Products', module: 'PRODUCTS' },
    { key: 'view_traceability', name: 'View Traceability', module: 'TRACEABILITY' },
    { key: 'traceability.view', name: 'View Traceability Tree', module: 'TRACEABILITY' },
    { key: 'traceability.export', name: 'Export Traceability Tree', module: 'TRACEABILITY' },
    { key: 'view_reports', name: 'View Reports', module: 'REPORTS' },
    { key: 'manage_users', name: 'Manage Users', module: 'GOVERNANCE' },
    { key: 'manage_roles', name: 'Manage Roles', module: 'GOVERNANCE' },
    { key: 'view_audit_logs', name: 'View Audit Logs', module: 'GOVERNANCE' },
    { key: 'edit_records', name: 'Edit Records', module: 'GOVERNANCE' },
    { key: 'delete_records', name: 'Delete Records', module: 'GOVERNANCE' },
    { key: 'receive_stock', name: 'Receive Stock (Legacy)', module: 'INVENTORY' },
  ];

  for (const p of permissionsList) {
    const perm = await prisma.permission.upsert({
      where: { key: p.key },
      update: {},
      create: {
        key: p.key,
        name: p.name,
        module: p.module,
      },
    });

    // Assign all to admin role
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: perm.id,
      },
    });

    // Assign inventory & commercial permissions to STOCK_HEAD
    if (p.module === 'INVENTORY' || p.module === 'COMMERCIAL' || p.key === 'products.view') {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: stockHeadRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: stockHeadRole.id,
          permissionId: perm.id,
        },
      });
    }

    // Assign view-only inventory permissions to STOCK_NORMAL
    if (
      p.key === 'view_inventory' ||
      p.key === 'inventory.view'
    ) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: stockNormalRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: stockNormalRole.id,
          permissionId: perm.id,
        },
      });
    }

    // Assign production, products, dashboard, and inventory view permissions to PRODUCTION_HEAD
    if (
      p.module === 'PRODUCTION' ||
      p.module === 'PRODUCTS' ||
      p.key === 'view_traceability' ||
      p.key === 'traceability.view' ||
      p.key === 'dashboard.view' ||
      p.key === 'view_dashboard' ||
      p.key === 'inventory.view' ||
      p.key === 'view_inventory' ||
      p.key === 'view_reports'
    ) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: productionHeadRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: productionHeadRole.id,
          permissionId: perm.id,
        },
      });
    }

    // Assign QA, products, traceability, and dashboard permissions to QUALITY_HEAD
    if (
      p.key === 'dashboard.view' ||
      p.key === 'view_dashboard' ||
      p.key === 'inventory.view' ||
      p.key === 'view_inventory' ||
      p.key === 'view_traceability' ||
      p.key === 'traceability.view' ||
      p.key === 'view_reports' ||
      p.key === 'production.view' ||
      p.module === 'PRODUCTS'
    ) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: qualityHeadRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: qualityHeadRole.id,
          permissionId: perm.id,
        },
      });
    }

    // Assign view-only permissions to VIEWER role
    const viewerPermKeys = [
      'dashboard.view', 'view_dashboard',
      'view_inventory', 'inventory.view',
      'view_traceability', 'traceability.view',
      'view_reports',
      'products.view', 'purchase_orders.view',
    ];
    if (viewerPermKeys.includes(p.key)) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: viewerRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: viewerRole.id,
          permissionId: perm.id,
        },
      });
    }
  }

  // 2.0 Default Production Teams
  const defaultTeams = [
    { code: 'SPIN-A', name: 'Spinning Team Alpha', department: 'SPINNING', teamLead: 'Mahesh Patel', remarks: 'Primary ring spinning unit' },
    { code: 'WARP-1', name: 'Warping Unit #1', department: 'WARPING', teamLead: 'Arun Yadav', remarks: 'High speed warping section' },
    { code: 'WEAVE-1', name: 'Weaving Floor Team A', department: 'WEAVING', teamLead: 'Ramesh Kumar', remarks: 'Air-jet loom weaving unit' },
    { code: 'KNIT-1', name: 'Knitting Unit North', department: 'KNITTING', teamLead: 'Kishore Sharma', remarks: 'Circular knitting line' },
  ];

  for (const team of defaultTeams) {
    await prisma.productionTeam.upsert({
      where: { code: team.code },
      update: {},
      create: team,
    });
  }

  // 2.1 Initial Party Master (Suppliers, Dyeing Mills, Customers)
  const defaultParties = [
    { code: 'VARDHMAN', name: 'Vardhman Textiles Ltd', type: PartyType.SUPPLIER, contactPerson: 'Rajesh Sharma', phone: '+919812345678', email: 'sales@vardhman.com' },
    { code: 'TRIDENT', name: 'Trident Group', type: PartyType.SUPPLIER, contactPerson: 'Anil Gupta', phone: '+919823456789', email: 'yarn@trident.com' },
    { code: 'NAHAR', name: 'Nahar Spinning Mills', type: PartyType.SUPPLIER, contactPerson: 'Suresh Verma', phone: '+919834567890', email: 'info@nahar.com' },
    { code: 'AURA_DYE', name: 'Aura Processors & Dyeing Mill', type: PartyType.DYEING_MILL, contactPerson: 'Vikram Singh', phone: '+919845678901', email: 'orders@auradye.com' },
    { code: 'APEX_EXP', name: 'Apex Home Textiles (Customer)', type: PartyType.CUSTOMER, contactPerson: 'Pooja Mehta', phone: '+919856789012', email: 'merch@apextextiles.com' },
  ];

  for (const party of defaultParties) {
    await prisma.party.upsert({
      where: { code: party.code },
      update: {},
      create: party,
    });
  }

  // 3. Default Admin User
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@yarntrace.com' },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: 'admin@yarntrace.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      phoneNumber: '+919876543210',
      status: UserStatus.ACTIVE,
      roleId: adminRole.id,
    },
  });

  console.log('✅ Seed completed successfully!');
  console.log(`👤 Admin user configured:`);
  console.log(`   Email: ${adminUser.email}`);
  console.log(`   Password: Password123!`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
