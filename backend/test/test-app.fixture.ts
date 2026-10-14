import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { Prisma, TransactionType, LotStatus, UserStatus } from '@prisma/client';
import { HashUtil } from '../src/common/utils/hash.util';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

export interface TestAuthTokens {
  adminToken: string;
  managerToken: string;
  operatorToken: string;
  viewerToken: string;
}

export class InMemoryPrismaService {
  // Master data collections
  roles: any[] = [];
  permissions: any[] = [];
  rolePermissions: any[] = [];
  userPermissions: any[] = [];
  users: any[] = [];
  parties: any[] = [];
  yarns: any[] = [];
  lots: any[] = [];
  stockLocations: any[] = [];
  stockBalances: any[] = [];
  transactions: any[] = [];
  transactionItems: any[] = [];
  purchaseOrders: any[] = [];
  poRequirements: any[] = [];
  productionTeams: any[] = [];
  productionOrders: any[] = [];
  yarnAllocations: any[] = [];
  consumptionRecords: any[] = [];
  productionReturns: any[] = [];
  productionOutputs: any[] = [];
  products: any[] = [];
  auditLogs: any[] = [];

  constructor() {
    this.seedDefaultData();
  }

  seedDefaultData() {
    // 1. Roles
    this.roles = [
      { id: 'role-admin', name: 'Admin', code: 'ADMIN', isSystem: true },
      { id: 'role-manager', name: 'Store Manager', code: 'STORE_MANAGER', isSystem: true },
      { id: 'role-operator', name: 'Operator', code: 'OPERATOR', isSystem: true },
      { id: 'role-viewer', name: 'Viewer', code: 'VIEWER', isSystem: true },
    ];

    // 2. Permissions
    const permKeys = [
      'inventory.view', 'view_inventory',
      'inventory.receive', 'add_yarn', 'update_stock',
      'inventory.issue', 'issue_yarn',
      'inventory.add_opening',
      'inventory.return',
      'inventory.retire',
      'inventory.sell',
      'inventory.correct', 'edit_records',
      'inventory.export', 'view_reports',
      'production.view', 'manage_production',
      'production.create',
      'production.allocate',
      'production.consume', 'record_consumption',
      'production.manage_teams',
      'production.complete',
      'production.cancel',
      'traceability.view', 'view_traceability',
      'traceability.export',
    ];

    this.permissions = permKeys.map((key, idx) => ({
      id: `perm-${idx + 1}`,
      key,
      name: key,
      module: key.split('.')[0] || 'general',
    }));

    // 3. Role Permissions mapping
    // STORE_MANAGER gets all permissions
    this.rolePermissions = this.permissions.map((p, idx) => ({
      id: `rp-mgr-${idx}`,
      roleId: 'role-manager',
      permissionId: p.id,
      permission: p,
    }));

    // OPERATOR gets inventory.issue, production.consume, production.view, inventory.view
    const opPermKeys = ['inventory.issue', 'issue_yarn', 'production.consume', 'record_consumption', 'production.view', 'inventory.view', 'view_inventory'];
    this.permissions
      .filter((p) => opPermKeys.includes(p.key))
      .forEach((p, idx) => {
        this.rolePermissions.push({
          id: `rp-op-${idx}`,
          roleId: 'role-operator',
          permissionId: p.id,
          permission: p,
        });
      });

    // VIEWER gets view only
    const viewerPermKeys = ['inventory.view', 'view_inventory', 'traceability.view', 'view_traceability', 'production.view'];
    this.permissions
      .filter((p) => viewerPermKeys.includes(p.key))
      .forEach((p, idx) => {
        this.rolePermissions.push({
          id: `rp-view-${idx}`,
          roleId: 'role-viewer',
          permissionId: p.id,
          permission: p,
        });
      });

    // 4. Default Users
    // Pre-computed hash for password "Test@1234" (cost 10):
    // $2b$10$w81oX0i6Y9wN8xH/0oW57.d4tqW8F7u4LwY7bV8gW6E3X6Y7bV8gW
    // To ensure 100% compatibility, HashUtil.hash('Test@1234') is computed on initialization or we can store a verified bcrypt hash
    // Standard bcrypt hash for "Password@123":
    const defaultPasswordHash = '$2b$10$epRswgWz.h6h1Xj1T5cW2.p374k2f5d92aO5u8rW/rU7qGzM2o1w2'; // Will be replaced in seedWithRealHashes

    this.users = [
      {
        id: 'user-admin',
        email: 'admin@yarntrace.test',
        passwordHash: defaultPasswordHash,
        firstName: 'System',
        lastName: 'Admin',
        status: UserStatus.ACTIVE,
        roleId: 'role-admin',
        refreshTokenHash: null,
      },
      {
        id: 'user-manager',
        email: 'manager@yarntrace.test',
        passwordHash: defaultPasswordHash,
        firstName: 'Store',
        lastName: 'Manager',
        status: UserStatus.ACTIVE,
        roleId: 'role-manager',
        refreshTokenHash: null,
      },
      {
        id: 'user-operator',
        email: 'operator@yarntrace.test',
        passwordHash: defaultPasswordHash,
        firstName: 'Floor',
        lastName: 'Operator',
        status: UserStatus.ACTIVE,
        roleId: 'role-operator',
        refreshTokenHash: null,
      },
      {
        id: 'user-viewer',
        email: 'viewer@yarntrace.test',
        passwordHash: defaultPasswordHash,
        firstName: 'Audit',
        lastName: 'Viewer',
        status: UserStatus.ACTIVE,
        roleId: 'role-viewer',
        refreshTokenHash: null,
      },
      {
        id: 'user-inactive',
        email: 'inactive@yarntrace.test',
        passwordHash: defaultPasswordHash,
        firstName: 'Inactive',
        lastName: 'User',
        status: UserStatus.INACTIVE,
        roleId: 'role-viewer',
        refreshTokenHash: null,
      },
    ];

    // 5. Parties
    this.parties = [
      {
        id: 'd3b07384-d113-467a-9a99-97bc618e7e11',
        code: 'VARDHMAN',
        name: 'Vardhman Textiles Ltd',
        type: 'SUPPLIER',
        isActive: true,
      },
      {
        id: 'd3b07384-d113-467a-9a99-97bc618e7e12',
        code: 'TRIDENT',
        name: 'Trident Mills Ltd',
        type: 'CUSTOMER',
        isActive: true,
      },
    ];

    // 6. Stock Location
    this.stockLocations = [
      {
        id: 'loc-main-wh',
        code: 'MAIN_WH',
        name: 'Main Yarn Warehouse',
        type: 'WAREHOUSE',
        isActive: true,
      },
    ];

    // 7. Yarns
    this.yarns = [
      {
        id: 'yarn-1',
        code: 'YARN-30-COMB',
        name: '30s Combed Cotton',
        type: 'COMBED',
        yarnCount: '30s Combed',
        composition: '100% Cotton',
        isActive: true,
      },
      {
        id: 'yarn-2',
        code: 'YARN-20-RAW',
        name: '20s Raw Grey Yarn',
        type: 'GREY',
        yarnCount: '20s Raw Grey',
        composition: '100% Cotton',
        isActive: true,
      },
      {
        id: 'yarn-3',
        code: 'YARN-20-DYED',
        name: '20s Dyed Red Yarn',
        type: 'DYED',
        yarnCount: '20s Dyed Red',
        composition: '100% Cotton',
        isActive: true,
      },
    ];

    // 8. Lots
    this.lots = [
      {
        id: 'lot-test-100',
        lotNumber: 'LOT-TEST-100',
        yarnCount: '30s Combed',
        yarnId: 'yarn-1',
        supplierId: 'd3b07384-d113-467a-9a99-97bc618e7e11',
        parentLotId: null,
        initialBags: 50,
        initialWeightKg: new Prisma.Decimal(2500.0),
        currentBags: 50,
        currentWeightKg: new Prisma.Decimal(2500.0),
        status: LotStatus.RECEIVED,
        receivedDate: new Date('2026-09-01'),
        millLotNumber: 'MILL-100',
        shadeCode: 'NATURAL',
      },
      {
        id: 'lot-parent-raw',
        lotNumber: 'LOT-PARENT-RAW',
        yarnCount: '20s Raw Grey',
        yarnId: 'yarn-2',
        supplierId: 'd3b07384-d113-467a-9a99-97bc618e7e11',
        parentLotId: null,
        initialBags: 100,
        initialWeightKg: new Prisma.Decimal(5000.0),
        currentBags: 100,
        currentWeightKg: new Prisma.Decimal(5000.0),
        status: LotStatus.RECEIVED,
        receivedDate: new Date('2026-08-15'),
        millLotNumber: 'MILL-PARENT',
        shadeCode: 'GREY',
      },
      {
        id: 'lot-child-dyed',
        lotNumber: 'LOT-CHILD-DYED',
        yarnCount: '20s Dyed Red',
        yarnId: 'yarn-3',
        supplierId: 'd3b07384-d113-467a-9a99-97bc618e7e11',
        parentLotId: 'lot-parent-raw',
        initialBags: 30,
        initialWeightKg: new Prisma.Decimal(1500.0),
        currentBags: 30,
        currentWeightKg: new Prisma.Decimal(1500.0),
        status: LotStatus.RECEIVED,
        receivedDate: new Date('2026-09-10'),
        millLotNumber: 'MILL-DYED-01',
        shadeCode: 'CRIMSON-RED',
      },
    ];

    // 9. Stock Balances
    this.stockBalances = [
      {
        id: 'sb-1',
        lotId: 'lot-test-100',
        locationId: 'loc-main-wh',
        quantityKg: new Prisma.Decimal(2500.0),
        bagsCount: 50,
        conesCount: 0,
        lastUpdated: new Date(),
      },
      {
        id: 'sb-2',
        lotId: 'lot-parent-raw',
        locationId: 'loc-main-wh',
        quantityKg: new Prisma.Decimal(5000.0),
        bagsCount: 100,
        conesCount: 0,
        lastUpdated: new Date(),
      },
      {
        id: 'sb-3',
        lotId: 'lot-child-dyed',
        locationId: 'loc-main-wh',
        quantityKg: new Prisma.Decimal(1500.0),
        bagsCount: 30,
        conesCount: 0,
        lastUpdated: new Date(),
      },
    ];

    // 10. Purchase Orders & Requirements
    this.purchaseOrders = [
      {
        id: 'po-1',
        poNumber: 'PO-2026-TEST1',
        partyId: 'd3b07384-d113-467a-9a99-97bc618e7e12',
        status: 'CONFIRMED',
        orderDate: new Date('2026-09-01'),
      },
      {
        id: 'po-2',
        poNumber: 'PO-2026-CEILING',
        partyId: 'd3b07384-d113-467a-9a99-97bc618e7e12',
        status: 'CONFIRMED',
        orderDate: new Date('2026-09-01'),
      },
    ];

    this.poRequirements = [
      {
        id: 'po-req-1',
        purchaseOrderId: 'po-1',
        poNumber: 'PO-2026-TEST1',
        yarnCount: '30s Combed',
        purpose: 'WEFT',
        requiredKg: new Prisma.Decimal(1000.0),
        issuedKg: new Prisma.Decimal(0.0),
        status: 'PENDING',
      },
      {
        id: 'po-req-2',
        purchaseOrderId: 'po-1',
        poNumber: 'PO-2026-TEST1',
        yarnCount: '40s Combed',
        purpose: 'PILE',
        requiredKg: new Prisma.Decimal(500.0),
        issuedKg: new Prisma.Decimal(0.0),
        status: 'PENDING',
      },
      {
        id: 'po-req-ceiling',
        purchaseOrderId: 'po-2',
        poNumber: 'PO-2026-CEILING',
        yarnCount: '30s Combed',
        purpose: 'WEFT',
        requiredKg: new Prisma.Decimal(1000.0),
        issuedKg: new Prisma.Decimal(950.0), // 1000 * 1.03 = 1030 max. Currently 950 issued. Remaining limit = 80 KG.
        status: 'PARTIAL',
      },
    ];

    // 11. Production Teams
    this.productionTeams = [
      {
        id: 'e3b07384-d113-467a-9a99-97bc618e7e21',
        code: 'WEAV-A',
        name: 'Weaving Team A',
        department: 'WEAVING',
        teamLead: 'John Doe',
        isActive: true,
      },
    ];

    // 12. Production Orders
    this.productionOrders = [
      {
        id: 'c3b07384-d113-467a-9a99-97bc618e7e31',
        orderNumber: 'WO-2026-001',
        status: 'IN_PROGRESS',
        targetQuantity: new Prisma.Decimal(1000.0),
        unit: 'KG',
        priority: 'MEDIUM',
        purpose: 'WEAVING',
        productName: 'Bath Towel White',
        productType: 'TERRY_TOWEL',
        poNumber: 'PO-2026-TEST1',
        partyId: 'd3b07384-d113-467a-9a99-97bc618e7e12',
        productionTeamId: 'e3b07384-d113-467a-9a99-97bc618e7e21',
        startDate: new Date(),
      },
    ];

    // 13. Transactions Baseline
    this.transactions = [
      {
        id: 'tx-rcv-1',
        transactionNumber: 'RCV-2026-0001',
        type: TransactionType.RECEIVED,
        status: 'COMPLETED',
        transactionDate: new Date('2026-09-01'),
        yarnCount: '30s Combed',
        partyId: 'd3b07384-d113-467a-9a99-97bc618e7e11',
        lotId: 'lot-test-100',
        bags: 50,
        kilos: new Prisma.Decimal(2500.0),
        poNumber: 'PO-2026-TEST1',
        purpose: 'WEFT',
      },
    ];
  }

  async initHashes() {
    const hash = await HashUtil.hash('Password@123');
    for (const u of this.users) {
      u.passwordHash = hash;
    }
  }

  // Snapshot functionality for true atomic rollback testing
  takeSnapshot(): string {
    return JSON.stringify({
      roles: this.roles,
      permissions: this.permissions,
      rolePermissions: this.rolePermissions,
      userPermissions: this.userPermissions,
      users: this.users,
      parties: this.parties,
      yarns: this.yarns,
      lots: this.lots,
      stockLocations: this.stockLocations,
      stockBalances: this.stockBalances,
      transactions: this.transactions,
      transactionItems: this.transactionItems,
      purchaseOrders: this.purchaseOrders,
      poRequirements: this.poRequirements,
      productionTeams: this.productionTeams,
      productionOrders: this.productionOrders,
      yarnAllocations: this.yarnAllocations,
      consumptionRecords: this.consumptionRecords,
      productionReturns: this.productionReturns,
      productionOutputs: this.productionOutputs,
      products: this.products,
      auditLogs: this.auditLogs,
    });
  }

  restoreSnapshot(jsonSnapshot: string) {
    const data = JSON.parse(jsonSnapshot);
    const deserializeDecimals = (val: any): any => {
      if (val === null || val === undefined) return val;
      if (typeof val === 'object' && val.d && Array.isArray(val.d) && typeof val.s === 'number') {
        return new Prisma.Decimal(val);
      }
      if (Array.isArray(val)) return val.map(deserializeDecimals);
      if (typeof val === 'object') {
        const out: any = {};
        for (const k of Object.keys(val)) {
          out[k] = deserializeDecimals(val[k]);
        }
        return out;
      }
      return val;
    };

    for (const key of Object.keys(data)) {
      (this as any)[key] = deserializeDecimals(data[key]);
    }
  }

  // Model accessors
  get user() {
    return {
      findUnique: async (args: any) => {
        let u: any = null;
        if (args.where?.id) u = this.users.find((x) => x.id === args.where.id);
        else if (args.where?.email) u = this.users.find((x) => x.email.toLowerCase() === args.where.email.toLowerCase());
        if (!u) return null;

        const res = { ...u };
        if (args.include?.role) {
          const r = this.roles.find((x) => x.id === u.roleId);
          res.role = r ? { ...r } : null;
          if (res.role && args.include.role.include?.rolePermissions) {
            res.role.rolePermissions = this.rolePermissions
              .filter((rp) => rp.roleId === r?.id)
              .map((rp) => ({
                ...rp,
                permission: this.permissions.find((p) => p.id === rp.permissionId),
              }));
          }
        }
        if (args.include?.userPermissions) {
          res.userPermissions = this.userPermissions
            .filter((up) => up.userId === u.id)
            .map((up) => ({
              ...up,
              permission: this.permissions.find((p) => p.id === up.permissionId),
            }));
        }
        return res;
      },
      findMany: async () => this.users.map((x) => ({ ...x })),
      create: async (args: any) => {
        const id = args.data.id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const user = { id, ...args.data };
        this.users.push(user);
        if (args.include?.role) {
          const r = this.roles.find((x) => x.id === user.roleId);
          user.role = r ? { ...r } : null;
        }
        return { ...user };
      },
      update: async (args: any) => {
        const u = this.users.find((x) => x.id === args.where.id);
        if (!u) throw new Error(`User not found: ${args.where.id}`);
        Object.assign(u, args.data);
        return { ...u };
      },
    };
  }

  get role() {
    return {
      findUnique: async (args: any) => {
        if (args.where?.id) return this.roles.find((x) => x.id === args.where.id) || null;
        if (args.where?.code) return this.roles.find((x) => x.code === args.where.code) || null;
        if (args.where?.name) return this.roles.find((x) => x.name === args.where.name) || null;
        return null;
      },
      findMany: async () => this.roles.map((x) => ({ ...x })),
      create: async (args: any) => {
        const id = args.data.id || `role-${Date.now()}`;
        const r = { id, ...args.data };
        this.roles.push(r);
        return { ...r };
      },
    };
  }

  get party() {
    return {
      findUnique: async (args: any) => {
        if (args.where?.id) return this.parties.find((x) => x.id === args.where.id) || null;
        if (args.where?.code) return this.parties.find((x) => x.code === args.where.code) || null;
        return null;
      },
      findMany: async () => this.parties.map((x) => ({ ...x })),
      count: async () => this.parties.length,
      create: async (args: any) => {
        const id = args.data.id || `party-${Date.now()}`;
        const p = { id, ...args.data };
        this.parties.push(p);
        return { ...p };
      },
    };
  }

  get lot() {
    return {
      findUnique: async (args: any) => {
        const lot = this.lots.find(
          (x) => (args.where?.id && x.id === args.where.id) || (args.where?.lotNumber && x.lotNumber === args.where.lotNumber),
        );
        if (!lot) return null;
        return this.formatLotWithIncludes(lot, args.include);
      },
      findFirst: async (args: any) => {
        const lot = this.lots.find((x) => {
          if (!args.where) return true;
          if (args.where.OR) {
            return args.where.OR.some((cond: any) => {
              if (cond.id && x.id === cond.id) return true;
              if (cond.lotNumber?.equals && x.lotNumber.toLowerCase() === cond.lotNumber.equals.toLowerCase()) return true;
              if (cond.lotNumber && x.lotNumber === cond.lotNumber) return true;
              return false;
            });
          }
          if (args.where.lotNumber && x.lotNumber !== args.where.lotNumber) return false;
          if (args.where.id && x.id !== args.where.id) return false;
          return true;
        });
        if (!lot) return null;
        return this.formatLotWithIncludes(lot, args.include);
      },
      findMany: async (args: any = {}) => {
        let results = [...this.lots];
        if (args.where) {
          if (args.where.status) results = results.filter((x) => x.status === args.where.status);
          if (args.where.yarnCount) results = results.filter((x) => x.yarnCount === args.where.yarnCount);
        }
        return results.map((l) => this.formatLotWithIncludes(l, args.include));
      },
      count: async () => this.lots.length,
      aggregate: async (_args?: any) => {
        let weightSum = 0;
        let bagsSum = 0;
        for (const lot of this.lots) {
          weightSum += Number(lot.currentWeightKg || 0);
          bagsSum += Number(lot.currentBags || 0);
        }
        return {
          _sum: {
            currentWeightKg: new Prisma.Decimal(weightSum),
            currentBags: bagsSum,
          },
        };
      },
      create: async (args: any) => {
        const id = args.data.id || `lot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const lot = {
          id,
          ...args.data,
          currentWeightKg: new Prisma.Decimal(args.data.currentWeightKg ?? args.data.initialWeightKg ?? 0),
          initialWeightKg: new Prisma.Decimal(args.data.initialWeightKg ?? 0),
          currentBags: args.data.currentBags ?? args.data.initialBags ?? 0,
          initialBags: args.data.initialBags ?? 0,
          status: args.data.status || LotStatus.RECEIVED,
          receivedDate: args.data.receivedDate || new Date(),
        };
        this.lots.push(lot);
        return this.formatLotWithIncludes(lot, args.include);
      },
      update: async (args: any) => {
        const lot = this.lots.find((x) => x.id === args.where.id);
        if (!lot) throw new Error(`Lot not found: ${args.where.id}`);
        for (const k of Object.keys(args.data)) {
          if (k === 'currentWeightKg' || k === 'initialWeightKg') {
            lot[k] = new Prisma.Decimal(args.data[k]);
          } else {
            lot[k] = args.data[k];
          }
        }
        return this.formatLotWithIncludes(lot, args.include);
      },
      updateMany: async (args: any) => {
        let count = 0;
        for (const lot of this.lots) {
          if (args.where?.id && lot.id !== args.where.id) continue;
          if (args.where?.lotNumber && lot.lotNumber !== args.where.lotNumber) continue;
          if (args.where?.currentWeightKg?.gte) {
            const currentWeight = lot.currentWeightKg instanceof Prisma.Decimal ? lot.currentWeightKg : new Prisma.Decimal(lot.currentWeightKg || 0);
            const minKg = new Prisma.Decimal(args.where.currentWeightKg.gte);
            if (currentWeight.lessThan(minKg)) continue;
          }
          if (args.where?.currentBags?.gte && lot.currentBags < args.where.currentBags.gte) continue;

          for (const k of Object.keys(args.data)) {
            if (args.data[k] && typeof args.data[k] === 'object' && 'decrement' in args.data[k]) {
              const dec = new Prisma.Decimal(args.data[k].decrement);
              if (k === 'currentWeightKg') {
                const currentWeight = lot.currentWeightKg instanceof Prisma.Decimal ? lot.currentWeightKg : new Prisma.Decimal(lot.currentWeightKg || 0);
                lot.currentWeightKg = Prisma.Decimal.sub(currentWeight, dec);
              } else if (k === 'currentBags') {
                lot.currentBags -= Number(dec);
              }
            } else if (k === 'currentWeightKg' || k === 'initialWeightKg') {
              lot[k] = new Prisma.Decimal(args.data[k]);
            } else {
              lot[k] = args.data[k];
            }
          }
          count++;
        }
        return { count };
      },
      delete: async (args: any) => {
        const idx = this.lots.findIndex((x) => x.id === args.where.id);
        if (idx >= 0) this.lots.splice(idx, 1);
        return { success: true };
      },
    };
  }

  private formatLotWithIncludes(lot: any, include: any): any {
    const res = { ...lot };
    if (include?.yarn) res.yarn = this.yarns.find((y) => y.id === lot.yarnId) || null;
    if (include?.supplier) res.supplier = this.parties.find((p) => p.id === lot.supplierId) || null;
    if (include?.parentLot) {
      const parent = this.lots.find((l) => l.id === lot.parentLotId);
      if (parent) {
        res.parentLot = this.formatLotWithIncludes(parent, include.parentLot.include);
      } else {
        res.parentLot = null;
      }
    }
    if (include?.childLots) {
      res.childLots = this.lots.filter((l) => l.parentLotId === lot.id);
    }
    if (include?.stockBalances) {
      res.stockBalances = this.stockBalances.filter((sb) => sb.lotId === lot.id);
    }
    if (include?.transactions) {
      res.transactions = this.transactions
        .filter((t) => t.lotId === lot.id)
        .map((t) => ({
          ...t,
          party: this.parties.find((p) => p.id === t.partyId) || null,
        }));
    }
    if (include?.yarnAllocations) {
      res.yarnAllocations = this.yarnAllocations
        .filter((a) => a.lotId === lot.id)
        .map((a) => ({
          ...a,
          productionTeam: this.productionTeams.find((pt) => pt.id === a.productionTeamId) || null,
          productionOrder: this.productionOrders.find((po) => po.id === a.productionOrderId) || null,
        }));
    }
    if (include?.consumptionRecords) {
      res.consumptionRecords = this.consumptionRecords.filter((c) => c.lotId === lot.id);
    }
    if (include?.productionReturns) {
      res.productionReturns = this.productionReturns.filter((r) => r.lotId === lot.id);
    }
    return res;
  }

  get transaction() {
    return {
      findUnique: async (args: any) => {
        const tx = this.transactions.find(
          (x) => (args.where?.id && x.id === args.where.id) || (args.where?.transactionNumber && x.transactionNumber === args.where.transactionNumber),
        );
        if (!tx) return null;
        return this.formatTransactionWithIncludes(tx, args.include);
      },
      findMany: async (args: any = {}) => {
        let results = [...this.transactions];
        if (args.where) {
          if (args.where.type) results = results.filter((x) => x.type === args.where.type);
          if (args.where.lotId) results = results.filter((x) => x.lotId === args.where.lotId);
        }
        return results.map((t) => this.formatTransactionWithIncludes(t, args.include));
      },
      count: async () => this.transactions.length,
      create: async (args: any) => {
        const id = args.data.id || randomUUID();
        const tx = {
          id,
          ...args.data,
          kilos: new Prisma.Decimal(args.data.kilos || 0),
          bags: args.data.bags || 0,
          transactionDate: args.data.transactionDate || new Date(),
          createdAt: new Date(),
        };
        this.transactions.push(tx);
        return this.formatTransactionWithIncludes(tx, args.include);
      },
      update: async (args: any) => {
        const tx = this.transactions.find((x) => x.id === args.where.id);
        if (!tx) throw new Error(`Transaction not found: ${args.where.id}`);
        Object.assign(tx, args.data);
        return this.formatTransactionWithIncludes(tx, args.include);
      },
    };
  }

  private formatTransactionWithIncludes(tx: any, include: any): any {
    const res = { ...tx };
    if (include?.party) res.party = this.parties.find((p) => p.id === tx.partyId) || null;
    if (include?.lot) res.lot = this.lots.find((l) => l.id === tx.lotId) || null;
    if (include?.poRequirement) res.poRequirement = this.poRequirements.find((r) => r.id === tx.poRequirementId) || null;
    if (include?.createdBy) res.createdBy = this.users.find((u) => u.id === tx.createdById) || null;
    if (include?.allocations) res.allocations = this.yarnAllocations.filter((a) => a.inventoryTransactionId === tx.id);
    return res;
  }

  get stockLocation() {
    return {
      findFirst: async (args: any) => {
        if (!args?.where) return this.stockLocations[0] || null;
        if (args.where.code) return this.stockLocations.find((x) => x.code === args.where.code) || null;
        return this.stockLocations[0] || null;
      },
      findUnique: async (args: any) => {
        if (args.where?.id) return this.stockLocations.find((x) => x.id === args.where.id) || null;
        if (args.where?.code) return this.stockLocations.find((x) => x.code === args.where.code) || null;
        return null;
      },
      findMany: async () => this.stockLocations.map((x) => ({ ...x })),
      create: async (args: any) => {
        const id = args.data.id || `loc-${Date.now()}`;
        const loc = { id, ...args.data };
        this.stockLocations.push(loc);
        return { ...loc };
      },
    };
  }

  get stockBalance() {
    return {
      findFirst: async (args: any) => {
        return this.stockBalances.find((x) => {
          if (args.where?.lotId && x.lotId !== args.where.lotId) return false;
          if (args.where?.locationId && x.locationId !== args.where.locationId) return false;
          return true;
        }) || null;
      },
      findUnique: async (args: any) => {
        if (args.where?.id) return this.stockBalances.find((x) => x.id === args.where.id) || null;
        if (args.where?.lotId_locationId) {
          return this.stockBalances.find(
            (x) => x.lotId === args.where.lotId_locationId.lotId && x.locationId === args.where.lotId_locationId.locationId,
          ) || null;
        }
        return null;
      },
      findMany: async () => this.stockBalances.map((x) => ({ ...x })),
      upsert: async (args: any) => {
        const existing = this.stockBalances.find(
          (x) => x.lotId === (args.where.lotId_locationId?.lotId || args.create.lotId) &&
                 x.locationId === (args.where.lotId_locationId?.locationId || args.create.locationId),
        );
        if (existing) {
          for (const k of Object.keys(args.update)) {
            if (k === 'quantityKg') existing.quantityKg = new Prisma.Decimal(args.update[k]);
            else existing[k] = args.update[k];
          }
          existing.lastUpdated = new Date();
          return { ...existing };
        } else {
          const id = `sb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const created = {
            id,
            ...args.create,
            quantityKg: new Prisma.Decimal(args.create.quantityKg || 0),
            bagsCount: args.create.bagsCount || 0,
            conesCount: args.create.conesCount || 0,
            lastUpdated: new Date(),
          };
          this.stockBalances.push(created);
          return { ...created };
        }
      },
      update: async (args: any) => {
        const b = this.stockBalances.find((x) => x.id === args.where.id);
        if (!b) throw new Error('Stock balance not found');
        Object.assign(b, args.data);
        return { ...b };
      },
    };
  }

  get pORequirement() {
    return {
      findFirst: async (args: any) => {
        const item = this.poRequirements.find((x) => {
          if (!args.where) return true;
          if (args.where.OR) {
            return args.where.OR.some((cond: any) => {
              const poMatch = cond.poNumber?.equals
                ? x.poNumber.toLowerCase() === cond.poNumber.equals.toLowerCase()
                : cond.purchaseOrder?.poNumber?.equals
                ? x.poNumber.toLowerCase() === cond.purchaseOrder.poNumber.equals.toLowerCase()
                : true;
              const countMatch = cond.yarnCount?.equals
                ? x.yarnCount.toLowerCase() === cond.yarnCount.equals.toLowerCase()
                : true;
              const purposeMatch = cond.purpose?.equals
                ? x.purpose.toUpperCase() === cond.purpose.equals.toUpperCase()
                : true;
              return poMatch && countMatch && purposeMatch;
            });
          }
          if (args.where.id && x.id !== args.where.id) return false;
          if (args.where.poNumber && x.poNumber !== args.where.poNumber) return false;
          return true;
        });
        if (!item) return null;
        const res = { ...item };
        if (args.include?.purchaseOrder) {
          res.purchaseOrder = this.purchaseOrders.find((po) => po.id === item.purchaseOrderId) || null;
        }
        return res;
      },
      findUnique: async (args: any) => {
        const item = this.poRequirements.find((x) => x.id === args.where.id);
        if (!item) return null;
        const res = { ...item };
        if (args.include?.purchaseOrder) {
          res.purchaseOrder = this.purchaseOrders.find((po) => po.id === item.purchaseOrderId) || null;
        }
        return res;
      },
      findMany: async (args: any = {}) => {
        let results = [...this.poRequirements];
        if (args.where?.purchaseOrderId) results = results.filter((x) => x.purchaseOrderId === args.where.purchaseOrderId);
        return results.map((r) => {
          const res = { ...r };
          if (args.include?.purchaseOrder) {
            res.purchaseOrder = this.purchaseOrders.find((po) => po.id === r.purchaseOrderId) || null;
          }
          return res;
        });
      },
      update: async (args: any) => {
        const r = this.poRequirements.find((x) => x.id === args.where.id);
        if (!r) throw new Error(`PO Requirement not found: ${args.where.id}`);
        for (const k of Object.keys(args.data)) {
          if (k === 'issuedKg' || k === 'requiredKg') {
            r[k] = new Prisma.Decimal(args.data[k]);
          } else {
            r[k] = args.data[k];
          }
        }
        return { ...r };
      },
      create: async (args: any) => {
        const id = args.data.id || `po-req-${Date.now()}`;
        const item = {
          id,
          ...args.data,
          requiredKg: new Prisma.Decimal(args.data.requiredKg || 0),
          issuedKg: new Prisma.Decimal(args.data.issuedKg || 0),
        };
        this.poRequirements.push(item);
        return { ...item };
      },
    };
  }

  get purchaseOrder() {
    return {
      findFirst: async (args: any) => {
        if (!args.where) return this.purchaseOrders[0] || null;
        if (args.where.poNumber) return this.purchaseOrders.find((x) => x.poNumber === args.where.poNumber) || null;
        return this.purchaseOrders[0] || null;
      },
      findUnique: async (args: any) => {
        if (args.where?.id) return this.purchaseOrders.find((x) => x.id === args.where.id) || null;
        if (args.where?.poNumber) return this.purchaseOrders.find((x) => x.poNumber === args.where.poNumber) || null;
        return null;
      },
      findMany: async () => this.purchaseOrders.map((x) => ({ ...x })),
      create: async (args: any) => {
        const id = args.data.id || `po-${Date.now()}`;
        const po = { id, ...args.data };
        this.purchaseOrders.push(po);
        return { ...po };
      },
    };
  }

  get productionTeam() {
    return {
      findUnique: async (args: any) => {
        return this.productionTeams.find((x) => x.id === args.where.id) || null;
      },
      findMany: async () => this.productionTeams.map((x) => ({ ...x })),
      create: async (args: any) => {
        const id = args.data.id || `team-${Date.now()}`;
        const item = { id, ...args.data };
        this.productionTeams.push(item);
        return { ...item };
      },
      update: async (args: any) => {
        const item = this.productionTeams.find((x) => x.id === args.where.id);
        if (!item) throw new Error('Team not found');
        Object.assign(item, args.data);
        return { ...item };
      },
    };
  }

  get productionOrder() {
    return {
      findUnique: async (args: any) => {
        const po = this.productionOrders.find((x) => x.id === args.where.id || x.orderNumber === args.where.orderNumber);
        if (!po) return null;
        const res = { ...po };
        if (args.include?.party) res.party = this.parties.find((p) => p.id === po.partyId) || null;
        if (args.include?.productionTeam) res.productionTeam = this.productionTeams.find((t) => t.id === po.productionTeamId) || null;
        if (args.include?.allocations) res.allocations = this.yarnAllocations.filter((a) => a.productionOrderId === po.id);
        if (args.include?.consumptionRecords) res.consumptionRecords = this.consumptionRecords.filter((c) => c.productionOrderId === po.id);
        return res;
      },
      findFirst: async (args: any) => {
        return this.productionOrders[0] || null;
      },
      findMany: async () => this.productionOrders.map((x) => ({ ...x })),
      create: async (args: any) => {
        const id = args.data.id || `order-${Date.now()}`;
        const po = {
          id,
          ...args.data,
          targetQuantity: new Prisma.Decimal(args.data.targetQuantity || 0),
        };
        this.productionOrders.push(po);
        return { ...po };
      },
      update: async (args: any) => {
        const po = this.productionOrders.find((x) => x.id === args.where.id);
        if (!po) throw new Error('Production order not found');
        Object.assign(po, args.data);
        return { ...po };
      },
    };
  }

  get yarnAllocation() {
    return {
      findUnique: async (args: any) => {
        const alloc = this.yarnAllocations.find((x) => x.id === args.where.id);
        if (!alloc) return null;
        const res = { ...alloc };
        if (args.include?.lot) res.lot = this.lots.find((l) => l.id === alloc.lotId) || null;
        if (args.include?.productionOrder) res.productionOrder = this.productionOrders.find((po) => po.id === alloc.productionOrderId) || null;
        if (args.include?.productionTeam) res.productionTeam = this.productionTeams.find((pt) => pt.id === alloc.productionTeamId) || null;
        return res;
      },
      findMany: async (args: any = {}) => {
        return this.yarnAllocations.map((a) => ({ ...a }));
      },
      create: async (args: any) => {
        const id = args.data.id || randomUUID();
        const alloc = {
          id,
          ...args.data,
          allocatedKg: new Prisma.Decimal(args.data.allocatedKg || 0),
          bags: args.data.bags || 0,
          allocatedDate: args.data.allocatedDate || new Date(),
        };
        this.yarnAllocations.push(alloc);
        return { ...alloc };
      },
      update: async (args: any) => {
        const a = this.yarnAllocations.find((x) => x.id === args.where.id);
        if (!a) throw new Error('Allocation not found');
        Object.assign(a, args.data);
        return { ...a };
      },
    };
  }

  get consumptionRecord() {
    return {
      findUnique: async (args: any) => {
        return this.consumptionRecords.find((x) => x.id === args.where.id) || null;
      },
      findMany: async (args: any = {}) => {
        return this.consumptionRecords.map((x) => ({ ...x }));
      },
      create: async (args: any) => {
        const id = args.data.id || `cons-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const rec = {
          id,
          ...args.data,
          consumedKg: new Prisma.Decimal(args.data.consumedKg || 0),
          wasteKg: new Prisma.Decimal(args.data.wasteKg || 0),
          netProducedKg: args.data.netProducedKg ? new Prisma.Decimal(args.data.netProducedKg) : null,
          consumptionDate: args.data.consumptionDate || new Date(),
        };
        this.consumptionRecords.push(rec);
        return { ...rec };
      },
      update: async (args: any) => {
        const rec = this.consumptionRecords.find((x) => x.id === args.where.id);
        if (!rec) throw new Error('Consumption record not found');
        Object.assign(rec, args.data);
        return { ...rec };
      },
    };
  }

  get auditLog() {
    return {
      create: async (args: any) => {
        const id = `audit-${Date.now()}`;
        const log = { id, ...args.data, timestamp: new Date() };
        this.auditLogs.push(log);
        return { ...log };
      },
    };
  }

  // Row-level locking mock (SELECT ... FOR UPDATE)
  async $queryRaw(...args: any[]) {
    return [];
  }

  // Transaction support with automatic rollback on error
  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const snapshot = this.takeSnapshot();
    try {
      // Provide transactional client that writes to this in-memory instance
      const result = await fn(this);
      return result;
    } catch (error) {
      // Roll back all changes if an exception occurs
      this.restoreSnapshot(snapshot);
      throw error;
    }
  }

  async $connect() {
    // Isolated in-memory connect (no-op)
  }

  async $disconnect() {
    // Isolated in-memory disconnect (no-op)
  }
}

export interface TestHarness {
  app: INestApplication;
  prisma: InMemoryPrismaService;
  jwtService: JwtService;
  tokens: TestAuthTokens;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestHarness> {
  const inMemoryPrisma = new InMemoryPrismaService();
  await inMemoryPrisma.initHashes();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(inMemoryPrisma)
    .compile();

  const app = moduleFixture.createNestApplication();

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.init();

  const jwtService = app.get(JwtService);
  const secret = 'yarntrace_super_secure_access_secret_token_2026_key';

  // Mint valid JWT tokens for each test role
  const adminToken = jwtService.sign(
    { sub: 'user-admin', email: 'admin@yarntrace.test', role: 'ADMIN' },
    { secret, expiresIn: '1h' },
  );

  const managerToken = jwtService.sign(
    { sub: 'user-manager', email: 'manager@yarntrace.test', role: 'STORE_MANAGER' },
    { secret, expiresIn: '1h' },
  );

  const operatorToken = jwtService.sign(
    { sub: 'user-operator', email: 'operator@yarntrace.test', role: 'OPERATOR' },
    { secret, expiresIn: '1h' },
  );

  const viewerToken = jwtService.sign(
    { sub: 'user-viewer', email: 'viewer@yarntrace.test', role: 'VIEWER' },
    { secret, expiresIn: '1h' },
  );

  return {
    app,
    prisma: inMemoryPrisma,
    jwtService,
    tokens: {
      adminToken,
      managerToken,
      operatorToken,
      viewerToken,
    },
    close: async () => {
      await app.close();
    },
  };
}
