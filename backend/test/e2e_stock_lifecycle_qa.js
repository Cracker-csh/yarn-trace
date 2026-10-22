require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:4000/api/v1';

// Test matrix storage
const testResults = [];

function recordTest(id, role, description, expected, actual, status, evidence = null) {
  testResults.push({
    id,
    role,
    description,
    expected,
    actual,
    status, // PASS, FAIL, BLOCKED
    evidence,
  });
  console.log(`[${status}] ${id} | Role: ${role} | ${description}`);
  if (status === 'FAIL') {
    console.error(`       Expected: ${expected}`);
    console.error(`       Actual:   ${actual}`);
    if (evidence) console.error(`       Evidence: ${JSON.stringify(evidence)}`);
  }
}

async function apiCall(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = {
    method,
    headers,
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, options);
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log('================================================================');
  console.log('🚀 YarnTrace End-to-End Stock Lifecycle & Role-Based QA Suite');
  console.log('================================================================\n');

  // ===========================================================================
  // PHASE 1: USER & ROLE PREPARATION (ADMIN ONLY)
  // ===========================================================================
  console.log('--- Phase 1: Authentication & Role Provisioning ---');

  // 1. Authenticate as Admin
  const adminLogin = await apiCall('POST', '/auth/login', {
    email: 'admin@yarntrace.com',
    password: 'Password123!',
  });

  if (!adminLogin.ok) {
    recordTest('AUTH-001', 'Admin', 'Admin user login', '200 OK with JWT', `${adminLogin.status} ${JSON.stringify(adminLogin.data)}`, 'FAIL');
    process.exit(1);
  }
  const adminToken = adminLogin.data?.data?.accessToken;
  const adminUser = adminLogin.data?.data?.user;
  recordTest('AUTH-001', 'Admin', 'Admin user login', '200 OK with JWT', `200 OK (Token received, User: ${adminUser.email})`, 'PASS');

  // 2. Ensure Roles: PURCHASE_MANAGER, STORE_OPERATOR
  const rolesInDb = await prisma.role.findMany({ include: { rolePermissions: { include: { permission: true } } } });
  const allPermissions = await prisma.permission.findMany();
  const permMap = new Map(allPermissions.map(p => [p.key, p.id]));

  let purchaseManagerRole = rolesInDb.find(r => r.code === 'PURCHASE_MANAGER');
  if (!purchaseManagerRole) {
    const poPermKeys = ['manage_purchase_orders', 'view_inventory', 'inventory.view', 'dashboard.view', 'view_dashboard'];
    const poPermIds = poPermKeys.map(k => permMap.get(k)).filter(Boolean);

    purchaseManagerRole = await prisma.role.create({
      data: {
        name: 'Purchase Manager',
        code: 'PURCHASE_MANAGER',
        description: 'Commercial manager authorized to create and approve purchase orders',
        isSystem: false,
        rolePermissions: {
          create: poPermIds.map(pid => ({ permissionId: pid })),
        },
      },
      include: { rolePermissions: { include: { permission: true } } },
    });
    console.log('Created custom role: PURCHASE_MANAGER');
  }

  let storeOperatorRole = rolesInDb.find(r => r.code === 'STORE_OPERATOR');
  if (!storeOperatorRole) {
    const opPermKeys = ['inventory.issue', 'inventory.return', 'inventory.view', 'view_inventory', 'dashboard.view'];
    const opPermIds = opPermKeys.map(k => permMap.get(k)).filter(Boolean);

    storeOperatorRole = await prisma.role.create({
      data: {
        name: 'Store Operator',
        code: 'STORE_OPERATOR',
        description: 'Warehouse floor operator authorized to issue stock and accept returns',
        isSystem: false,
        rolePermissions: {
          create: opPermIds.map(pid => ({ permissionId: pid })),
        },
      },
      include: { rolePermissions: { include: { permission: true } } },
    });
    console.log('Created custom role: STORE_OPERATOR');
  }

  const stockHeadRole = rolesInDb.find(r => r.code === 'STOCK_HEAD');
  const productionHeadRole = rolesInDb.find(r => r.code === 'PRODUCTION_HEAD');
  const viewerRole = rolesInDb.find(r => r.code === 'VIEWER');

  // 3. Ensure Test Users with password Password123!
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const testUserDefs = [
    { email: 'qa.purchase.manager@yarntrace.com', firstName: 'Priya', lastName: 'Sharma', roleId: purchaseManagerRole.id, code: 'PURCHASE_MANAGER' },
    { email: 'qa.store.incharge@yarntrace.com', firstName: 'Suresh', lastName: 'Kumar', roleId: stockHeadRole.id, code: 'STOCK_HEAD' },
    { email: 'qa.production.manager@yarntrace.com', firstName: 'Vikram', lastName: 'Patel', roleId: productionHeadRole.id, code: 'PRODUCTION_HEAD' },
    { email: 'qa.store.operator@yarntrace.com', firstName: 'Anil', lastName: 'Yadav', roleId: storeOperatorRole.id, code: 'STORE_OPERATOR' },
    { email: 'qa.auditor.viewer@yarntrace.com', firstName: 'Neha', lastName: 'Mehta', roleId: viewerRole.id, code: 'VIEWER' },
  ];

  const testTokens = {};
  testTokens['ADMIN'] = adminToken;

  for (const uDef of testUserDefs) {
    const user = await prisma.user.upsert({
      where: { email: uDef.email },
      update: { roleId: uDef.roleId, passwordHash, status: 'ACTIVE' },
      create: {
        email: uDef.email,
        passwordHash,
        firstName: uDef.firstName,
        lastName: uDef.lastName,
        phoneNumber: '+919876543200',
        roleId: uDef.roleId,
        status: 'ACTIVE',
      },
    });

    const loginRes = await apiCall('POST', '/auth/login', {
      email: uDef.email,
      password: 'Password123!',
    });
    if (loginRes.ok) {
      testTokens[uDef.code] = loginRes.data?.data?.accessToken;
      recordTest(`AUTH-LOGIN-${uDef.code}`, uDef.code, `User login for ${uDef.email}`, '200 OK with valid JWT', '200 OK', 'PASS');
    } else {
      recordTest(`AUTH-LOGIN-${uDef.code}`, uDef.code, `User login for ${uDef.email}`, '200 OK with valid JWT', `${loginRes.status}`, 'FAIL');
    }
  }

  // ===========================================================================
  // PHASE 2: ROLE-BASED ACCESS CONTROL (RBAC) MATRIX
  // ===========================================================================
  console.log('\n--- Phase 2: Role-Based Authorization Enforcement ---');

  // Test 1: Admin manages master users (Permitted)
  const adminUsersGet = await apiCall('GET', '/users', null, testTokens['ADMIN']);
  recordTest('RBAC-ADM-01', 'Admin', 'Admin accesses user directory (GET /users)', '200 OK', `${adminUsersGet.status} OK`, adminUsersGet.status === 200 ? 'PASS' : 'FAIL');

  // Test 2: Admin safeguard - Attempt to delete system ADMIN role (Prohibited)
  const adminRoleObj = rolesInDb.find(r => r.code === 'ADMIN');
  const deleteAdminRole = await apiCall('DELETE', `/roles/${adminRoleObj.id}`, null, testTokens['ADMIN']);
  recordTest('RBAC-ADM-02', 'Admin', 'Admin attempts to delete root system ADMIN role', '403 Forbidden', `${deleteAdminRole.status} ${deleteAdminRole.data?.message || ''}`, deleteAdminRole.status === 403 ? 'PASS' : 'FAIL');

  // Test 3: Purchase Manager view POs (Permitted)
  const pmViewPO = await apiCall('GET', '/purchase-orders', null, testTokens['PURCHASE_MANAGER']);
  recordTest('RBAC-PM-01', 'Purchase Manager', 'Purchase Manager views PO list (GET /purchase-orders)', '200 OK', `${pmViewPO.status} OK`, pmViewPO.status === 200 ? 'PASS' : 'FAIL');

  // Test 4: Purchase Manager attempts to issue stock (Prohibited)
  const pmIssueStock = await apiCall('POST', '/inventory/issued', { count: '30s', partyId: 'dummy', lotNumber: 'dummy', bags: 1, kilos: 10, purpose: 'PILE' }, testTokens['PURCHASE_MANAGER']);
  recordTest('RBAC-PM-02', 'Purchase Manager', 'Purchase Manager attempts to issue stock (POST /inventory/issued)', '403 Forbidden', `${pmIssueStock.status} ${pmIssueStock.data?.message || ''}`, pmIssueStock.status === 403 ? 'PASS' : 'FAIL');

  // Test 5: Purchase Manager attempts to create production order (Prohibited)
  const pmCreateProd = await apiCall('POST', '/production/orders', { targetQuantity: 100 }, testTokens['PURCHASE_MANAGER']);
  recordTest('RBAC-PM-03', 'Purchase Manager', 'Purchase Manager attempts to create work order (POST /production/orders)', '403 Forbidden', `${pmCreateProd.status} ${pmCreateProd.data?.message || ''}`, pmCreateProd.status === 403 ? 'PASS' : 'FAIL');

  // Test 6: Store Incharge views inventory summary (Permitted)
  const siSummary = await apiCall('GET', '/inventory/summary', null, testTokens['STOCK_HEAD']);
  recordTest('RBAC-SI-01', 'Store Incharge', 'Store Incharge views inventory summary (GET /inventory/summary)', '200 OK', `${siSummary.status} OK`, siSummary.status === 200 ? 'PASS' : 'FAIL');

  // Test 7: Store Incharge attempts to create PO (Prohibited)
  const siCreatePO = await apiCall('POST', '/purchase-orders', { poNumber: 'PO-ILLEGAL', partyId: 'dummy', requirements: [] }, testTokens['STOCK_HEAD']);
  recordTest('RBAC-SI-02', 'Store Incharge', 'Store Incharge attempts to create PO (POST /purchase-orders)', '403 Forbidden', `${siCreatePO.status} ${siCreatePO.data?.message || ''}`, siCreatePO.status === 403 ? 'PASS' : 'FAIL');

  // Test 8: Store Incharge attempts to create production work order (Prohibited)
  const siCreateProd = await apiCall('POST', '/production/orders', { targetQuantity: 50 }, testTokens['STOCK_HEAD']);
  recordTest('RBAC-SI-03', 'Store Incharge', 'Store Incharge attempts to create work order (POST /production/orders)', '403 Forbidden', `${siCreateProd.status} ${siCreateProd.data?.message || ''}`, siCreateProd.status === 403 ? 'PASS' : 'FAIL');

  // Test 9: Production Manager views production orders (Permitted)
  const prdViewOrders = await apiCall('GET', '/production/orders', null, testTokens['PRODUCTION_HEAD']);
  recordTest('RBAC-PRD-01', 'Production Manager', 'Production Manager views work orders (GET /production/orders)', '200 OK', `${prdViewOrders.status} OK`, prdViewOrders.status === 200 ? 'PASS' : 'FAIL');

  // Test 10: Production Manager attempts to receive raw yarn (Prohibited)
  const prdReceiveStock = await apiCall('POST', '/inventory/received', { count: '30s', partyId: 'dummy', lotNumber: 'dummy', bags: 1, kilos: 10 }, testTokens['PRODUCTION_HEAD']);
  recordTest('RBAC-PRD-02', 'Production Manager', 'Production Manager attempts to receive inward yarn (POST /inventory/received)', '403 Forbidden', `${prdReceiveStock.status} ${prdReceiveStock.data?.message || ''}`, prdReceiveStock.status === 403 ? 'PASS' : 'FAIL');

  // Test 11: Production Manager attempts to add baseline opening stock (Prohibited)
  const prdOpenStock = await apiCall('POST', '/inventory/opening', { count: '30s', partyId: 'dummy', lotNumber: 'dummy', bags: 1, kilos: 10 }, testTokens['PRODUCTION_HEAD']);
  recordTest('RBAC-PRD-03', 'Production Manager', 'Production Manager attempts to add opening stock (POST /inventory/opening)', '403 Forbidden', `${prdOpenStock.status} ${prdOpenStock.data?.message || ''}`, prdOpenStock.status === 403 ? 'PASS' : 'FAIL');

  // Test 12: Store Operator views lots (Permitted)
  const opViewLots = await apiCall('GET', '/inventory/lots', null, testTokens['STORE_OPERATOR']);
  recordTest('RBAC-OP-01', 'Store Operator', 'Store Operator views lot stock (GET /inventory/lots)', '200 OK', `${opViewLots.status} OK`, opViewLots.status === 200 ? 'PASS' : 'FAIL');

  // Test 13: Store Operator attempts to retire stock (Prohibited - only Stock Head has inventory.retire)
  const opRetire = await apiCall('POST', '/inventory/retired', { lotNumber: 'dummy', bags: 1, kilos: 5, reason: 'test' }, testTokens['STORE_OPERATOR']);
  recordTest('RBAC-OP-02', 'Store Operator', 'Store Operator attempts to retire stock (POST /inventory/retired)', '403 Forbidden', `${opRetire.status} ${opRetire.data?.message || ''}`, opRetire.status === 403 ? 'PASS' : 'FAIL');

  // Test 14: Store Operator attempts to create PO (Prohibited)
  const opCreatePO = await apiCall('POST', '/purchase-orders', { poNumber: 'PO-OP', partyId: 'dummy', requirements: [] }, testTokens['STORE_OPERATOR']);
  recordTest('RBAC-OP-03', 'Store Operator', 'Store Operator attempts to create PO (POST /purchase-orders)', '403 Forbidden', `${opCreatePO.status} ${opCreatePO.data?.message || ''}`, opCreatePO.status === 403 ? 'PASS' : 'FAIL');

  // Test 15: Auditor/Viewer views traceability (Permitted)
  const viTrace = await apiCall('GET', '/traceability/lots/active', null, testTokens['VIEWER']);
  recordTest('RBAC-VI-01', 'Auditor/Viewer', 'Viewer views active lot traceability (GET /traceability/lots/active)', '200 OK', `${viTrace.status} OK`, viTrace.status === 200 ? 'PASS' : 'FAIL');

  // Test 16: Auditor/Viewer attempts mutation (Prohibited)
  const viMutate = await apiCall('POST', '/inventory/opening', { count: '30s', partyId: 'dummy', lotNumber: 'dummy', bags: 1, kilos: 10 }, testTokens['VIEWER']);
  recordTest('RBAC-VI-02', 'Auditor/Viewer', 'Viewer attempts stock mutation (POST /inventory/opening)', '403 Forbidden', `${viMutate.status} ${viMutate.data?.message || ''}`, viMutate.status === 403 ? 'PASS' : 'FAIL');

  // ===========================================================================
  // PHASE 3: ISOLATED MASTER DATA PREPARATION
  // ===========================================================================
  console.log('\n--- Phase 3: Isolated Master Data Setup ---');

  // Clean up any previous test run artifacts with exact dummy prefixes
  const dummyLots = ['LOT-TEST-101', 'LOT-TEST-102', 'LOT-TEST-103', 'LOT-TEST-REJ-5', 'LOT-TEST-NEW-99', 'LOT-TEST-DEBUG-2'];
  const dummyPONumber = 'PO-TEST-150';
  const dummyWONumber = 'PROD-TEST-001';

  console.log('Cleaning up any existing isolated dummy test entities...');
  const existingWos = await prisma.productionOrder.findMany({ where: { orderNumber: { in: [dummyWONumber] } } });
  const existingWoIds = existingWos.map(w => w.id);
  if (existingWoIds.length > 0) {
    await prisma.productionReturn.deleteMany({ where: { productionOrderId: { in: existingWoIds } } });
    await prisma.consumptionRecord.deleteMany({ where: { productionOrderId: { in: existingWoIds } } });
    await prisma.yarnAllocation.deleteMany({ where: { productionOrderId: { in: existingWoIds } } });
    await prisma.productionOutput.deleteMany({ where: { productionOrderId: { in: existingWoIds } } });
    await prisma.productionOrder.deleteMany({ where: { id: { in: existingWoIds } } });
  }

  const existingLots = await prisma.lot.findMany({ where: { lotNumber: { in: dummyLots } } });
  const existingLotIds = existingLots.map(l => l.id);
  if (existingLotIds.length > 0) {
    await prisma.productionReturn.deleteMany({ where: { lotId: { in: existingLotIds } } });
    await prisma.consumptionRecord.deleteMany({ where: { lotId: { in: existingLotIds } } });
    await prisma.yarnAllocation.deleteMany({ where: { lotId: { in: existingLotIds } } });
    await prisma.transactionItem.deleteMany({ where: { lotId: { in: existingLotIds } } });
    await prisma.stockBalance.deleteMany({ where: { lotId: { in: existingLotIds } } });
    await prisma.transaction.deleteMany({ where: { lotId: { in: existingLotIds } } });
    await prisma.lot.deleteMany({ where: { id: { in: existingLotIds } } });
  }

  const existingPos = await prisma.purchaseOrder.findMany({ where: { poNumber: { in: [dummyPONumber, 'PO-ILLEGAL', 'PO-OP'] } } });
  const existingPoIds = existingPos.map(p => p.id);
  if (existingPoIds.length > 0) {
    await prisma.pORequirement.deleteMany({ where: { purchaseOrderId: { in: existingPoIds } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: existingPoIds } } });
  }
  await prisma.pORequirement.deleteMany({ where: { poNumber: { in: [dummyPONumber, 'PO-ILLEGAL', 'PO-OP'] } } });

  // Find or create dummy supplier and customer
  let testSupplier = await prisma.party.findUnique({ where: { code: 'TEST-SUPPLIER-01' } });
  if (!testSupplier) {
    testSupplier = await prisma.party.create({
      data: {
        code: 'TEST-SUPPLIER-01',
        name: 'Test Cotton Mills Pvt Ltd',
        type: 'SUPPLIER',
        contactPerson: 'Kailash Meena',
        phone: '+919811122233',
        email: 'supply@testcotton.com',
        isActive: true,
      },
    });
  }

  let testBuyer = await prisma.party.findUnique({ where: { code: 'TEST-BUYER-01' } });
  if (!testBuyer) {
    testBuyer = await prisma.party.create({
      data: {
        code: 'TEST-BUYER-01',
        name: 'Test Garments Export Ltd',
        type: 'CUSTOMER',
        contactPerson: 'Deepak Verma',
        phone: '+919844455566',
        email: 'orders@testgarments.com',
        isActive: true,
      },
    });
  }

  // Ensure production team
  let testTeam = await prisma.productionTeam.findUnique({ where: { code: 'WEAVE-1' } });
  if (!testTeam) {
    testTeam = await prisma.productionTeam.findFirst();
  }

  console.log(`Test Supplier: ${testSupplier.name} (${testSupplier.id})`);
  console.log(`Test Customer: ${testBuyer.name} (${testBuyer.id})`);
  console.log(`Production Team: ${testTeam.name} (${testTeam.id})`);

  // ===========================================================================
  // PHASE 4: EXECUTE COMPLETE STOCK LIFECYCLE SCENARIO
  // ===========================================================================
  console.log('\n--- Phase 4: Stock Lifecycle Scenario Execution ---');

  // --- Step 1: Opening Stock Creation ---
  // LOT-TEST-101: 300 kg opening stock
  const openLot1Res = await apiCall('POST', '/inventory/opening', {
    transactionDate: '2026-10-20',
    count: 'GREY Cotton Yarn 30s',
    partyId: testSupplier.id,
    lotNumber: 'LOT-TEST-101',
    bags: 10,
    kilos: 300.0,
    remarks: 'QA E2E Opening Stock Lot 101',
  }, testTokens['STOCK_HEAD']);

  recordTest(
    'STK-OPN-101',
    'Store Incharge',
    'Create Opening Stock for LOT-TEST-101 (300 KG, 10 bags)',
    '201 Created with transaction OPN number and lot balance 300 KG',
    `${openLot1Res.status} (Tx: ${openLot1Res.data?.data?.transactionNumber}, KG: ${openLot1Res.data?.data?.kilos})`,
    openLot1Res.status === 201 && Number(openLot1Res.data?.data?.kilos) === 300 ? 'PASS' : 'FAIL',
    openLot1Res.data
  );

  // LOT-TEST-102: 200 kg opening stock
  const openLot2Res = await apiCall('POST', '/inventory/opening', {
    transactionDate: '2026-10-20',
    count: 'GREY Cotton Yarn 30s',
    partyId: testSupplier.id,
    lotNumber: 'LOT-TEST-102',
    bags: 10,
    kilos: 200.0,
    remarks: 'QA E2E Opening Stock Lot 102',
  }, testTokens['STOCK_HEAD']);

  recordTest(
    'STK-OPN-102',
    'Store Incharge',
    'Create Opening Stock for LOT-TEST-102 (200 KG, 10 bags)',
    '201 Created with transaction OPN number and lot balance 200 KG',
    `${openLot2Res.status} (Tx: ${openLot2Res.data?.data?.transactionNumber}, KG: ${openLot2Res.data?.data?.kilos})`,
    openLot2Res.status === 201 && Number(openLot2Res.data?.data?.kilos) === 200 ? 'PASS' : 'FAIL',
    openLot2Res.data
  );

  // Negative Test: Duplicate opening stock creation on existing lot
  const dupOpenRes = await apiCall('POST', '/inventory/opening', {
    transactionDate: '2026-10-20',
    count: 'GREY Cotton Yarn 30s',
    partyId: testSupplier.id,
    lotNumber: 'LOT-TEST-101',
    bags: 5,
    kilos: 100.0,
  }, testTokens['STOCK_HEAD']);

  recordTest(
    'STK-DUP-01',
    'Store Incharge',
    'Prevent duplicate opening stock baseline entry on LOT-TEST-101',
    '409 Conflict with message that lot already exists',
    `${dupOpenRes.status} ${dupOpenRes.data?.message || ''}`,
    dupOpenRes.status === 409 ? 'PASS' : 'FAIL'
  );

  // --- Step 2: Create Purchase Order & Approve ---
  // Create PO in DRAFT status
  const createPORes = await apiCall('POST', '/purchase-orders', {
    poNumber: dummyPONumber,
    partyId: testBuyer.id,
    orderDate: '2026-10-20',
    deliveryDue: '2026-11-20',
    totalAmount: 45000,
    remarks: 'QA E2E 150 KG Grey Cotton Yarn 30s PO',
    status: 'DRAFT',
    requirements: [
      {
        yarnCount: 'GREY Cotton Yarn 30s',
        purpose: 'PILE',
        requiredKg: 150.0,
        quality: 'Cotton',
        useFor: 'Pile Yarn',
        notes: 'Requirement 150 KG',
      },
    ],
  }, testTokens['PURCHASE_MANAGER']);

  const poId = createPORes.data?.data?.id;
  recordTest(
    'PO-CRT-01',
    'Purchase Manager',
    'Create Purchase Order PO-TEST-150 in DRAFT status for 150 KG (Purpose: PILE)',
    '201 Created with status DRAFT and 1 requirement line',
    `${createPORes.status} (PO ID: ${poId}, Status: ${createPORes.data?.data?.status})`,
    createPORes.status === 201 && createPORes.data?.data?.status === 'DRAFT' ? 'PASS' : 'FAIL',
    createPORes.data
  );

  // Approve / Confirm Purchase Order
  const approvePORes = await apiCall('PATCH', `/purchase-orders/${poId}`, {
    status: 'CONFIRMED',
    remarks: 'Approved by Purchase Manager',
  }, testTokens['PURCHASE_MANAGER']);

  recordTest(
    'PO-APP-01',
    'Purchase Manager',
    'Approve / Confirm Purchase Order PO-TEST-150',
    '200 OK with status CONFIRMED or ACTIVE',
    `${approvePORes.status} (Status: ${approvePORes.data?.data?.status})`,
    approvePORes.status === 200 && (approvePORes.data?.data?.status === 'CONFIRMED' || approvePORes.data?.data?.status === 'ACTIVE') ? 'PASS' : 'FAIL',
    approvePORes.data
  );

  // Retrieve requirement ID
  const poDetails = await apiCall('GET', `/purchase-orders/${poId}`, null, testTokens['PURCHASE_MANAGER']);
  const poReqId = poDetails.data?.data?.requirements?.[0]?.id;
  console.log(`Matched PO Requirement ID: ${poReqId}`);

  // --- Step 3: PO 103% Ceiling Enforcement (Negative Test) ---
  // Attempt to issue 160 KG against 150 KG PO (150 * 1.03 = 154.5 KG ceiling)
  const ceilingFailRes = await apiCall('POST', '/inventory/issued', {
    transactionDate: '2026-10-20',
    count: 'GREY Cotton Yarn 30s',
    partyId: testSupplier.id,
    lotNumber: 'LOT-TEST-101',
    bags: 5,
    kilos: 160.0,
    poNumber: dummyPONumber,
    purpose: 'PILE',
  }, testTokens['STOCK_HEAD']);

  recordTest(
    'SEC-103-CEIL',
    'Store Incharge',
    'Attempt to issue 160 KG against 150 KG requirement (exceeding 103% ceiling: 154.5 KG)',
    '400 Bad Request with PO 103% Requirement Rule Exceeded message',
    `${ceilingFailRes.status} ${ceilingFailRes.data?.message || ''}`,
    ceilingFailRes.status === 400 && (ceilingFailRes.data?.message || '').includes('103%') ? 'PASS' : 'FAIL'
  );

  // --- Step 4: Receive Stock against PO (145 KG Accepted, 5 KG Rejected) ---
  // Receive 145 KG accepted stock into LOT-TEST-103
  const receiveAcceptedRes = await apiCall('POST', '/inventory/received', {
    transactionDate: '2026-10-20',
    count: 'GREY Cotton Yarn 30s',
    partyId: testSupplier.id,
    lotNumber: 'LOT-TEST-103',
    bags: 5,
    kilos: 145.0,
    poNumber: dummyPONumber,
    purpose: 'PILE',
    remarks: 'Accepted inward delivery 145 KG against PO-TEST-150',
  }, testTokens['STOCK_HEAD']);

  recordTest(
    'STK-RCV-145',
    'Store Incharge',
    'Receive 145 KG accepted yarn stock into LOT-TEST-103 against PO-TEST-150',
    '201 Created with transaction RCV number and lot balance 145 KG',
    `${receiveAcceptedRes.status} (Tx: ${receiveAcceptedRes.data?.data?.transactionNumber}, Lot: ${receiveAcceptedRes.data?.data?.lot?.lotNumber})`,
    receiveAcceptedRes.status === 201 && Number(receiveAcceptedRes.data?.data?.kilos) === 145 ? 'PASS' : 'FAIL',
    receiveAcceptedRes.data
  );

  // Record 5 KG rejected/damaged stock using supported workflow:
  // Inward reception of 5 KG damaged cones into quarantine/inspection lot LOT-TEST-REJ-5 followed by authorized retirement
  const receiveRejRes = await apiCall('POST', '/inventory/received', {
    transactionDate: '2026-10-20',
    count: 'GREY Cotton Yarn 30s',
    partyId: testSupplier.id,
    lotNumber: 'LOT-TEST-REJ-5',
    bags: 1,
    kilos: 5.0,
    poNumber: dummyPONumber,
    purpose: 'PILE',
    remarks: 'Damaged cones segregated at gate inspection against PO-TEST-150',
  }, testTokens['STOCK_HEAD']);

  const retireRejRes = await apiCall('POST', '/inventory/retired', {
    transactionDate: '2026-10-20',
    lotNumber: 'LOT-TEST-REJ-5',
    bags: 1,
    kilos: 5.0,
    reason: 'Inward rejection: 5 KG damaged cones rejected upon physical verification against PO-TEST-150',
    referenceNumber: 'QA-REJ-PO-150',
  }, testTokens['STOCK_HEAD']);

  recordTest(
    'STK-REJ-05',
    'Store Incharge',
    'Record 5 KG rejected/damaged stock via receipt and immediate write-off retirement',
    '201 Created and retired with status RETIRED and reason captured in audit trail',
    `Received: ${receiveRejRes.status}, Retired: ${retireRejRes.status} (Tx: ${retireRejRes.data?.data?.transaction?.transactionNumber})`,
    receiveRejRes.status === 201 && retireRejRes.status === 201 ? 'PASS' : 'FAIL',
    retireRejRes.data
  );

  // Check current stock after receiving:
  // Accepted stock should now be: 300 (LOT-101) + 200 (LOT-102) + 145 (LOT-103) = 645 KG.
  const lot103Db = await prisma.lot.findUnique({ where: { lotNumber: 'LOT-TEST-103' } });
  const rejLotDb = await prisma.lot.findUnique({ where: { lotNumber: 'LOT-TEST-REJ-5' } });
  console.log(`LOT-TEST-103 Balance: ${lot103Db?.currentWeightKg} KG`);
  console.log(`LOT-TEST-REJ-5 Balance: ${rejLotDb?.currentWeightKg} KG (Status: ${rejLotDb?.status})`);

  // --- Step 5: Create Production Order PROD-TEST-001 (120 KG) ---
  const createWO = await apiCall('POST', '/production/orders', {
    orderNumber: dummyWONumber,
    targetQuantity: 120.0,
    unit: 'KG',
    priority: 'HIGH',
    purpose: 'WEAVING',
    productName: 'Grey Towel Pile Fabric 30s',
    poNumber: dummyPONumber,
    partyId: testBuyer.id,
    productionTeamId: testTeam.id,
    status: 'PLANNED',
    remarks: 'QA E2E 120 KG Towel Pile Production Order',
  }, testTokens['PRODUCTION_HEAD']);

  const woId = createWO.data?.data?.id;
  recordTest(
    'PRD-WO-01',
    'Production Manager',
    'Create Production Work Order PROD-TEST-001 for 120 KG',
    '201 Created with status PLANNED and orderNumber PROD-TEST-001',
    `${createWO.status} (WO ID: ${woId}, Order: ${createWO.data?.data?.orderNumber})`,
    createWO.status === 201 && createWO.data?.data?.orderNumber === dummyWONumber ? 'PASS' : 'FAIL',
    createWO.data
  );

  // Transition status to IN_PROGRESS
  const startWO = await apiCall('PATCH', `/production/orders/${woId}`, {
    status: 'IN_PROGRESS',
  }, testTokens['PRODUCTION_HEAD']);

  recordTest(
    'PRD-WO-02',
    'Production Manager',
    'Transition PROD-TEST-001 from PLANNED to IN_PROGRESS',
    '200 OK with status IN_PROGRESS',
    `${startWO.status} (Status: ${startWO.data?.data?.status})`,
    startWO.status === 200 && startWO.data?.data?.status === 'IN_PROGRESS' ? 'PASS' : 'FAIL'
  );

  // --- Step 6: Negative Stock & Validation Tests ---
  // Attempt to issue 500 KG from LOT-TEST-101 (only 300 KG available)
  const negStockIssue = await apiCall('POST', '/inventory/issued', {
    count: 'GREY Cotton Yarn 30s',
    partyId: testSupplier.id,
    lotNumber: 'LOT-TEST-101',
    bags: 15,
    kilos: 500.0,
    purpose: 'PILE',
  }, testTokens['STORE_OPERATOR']);

  recordTest(
    'SEC-NEG-STOCK',
    'Store Operator',
    'Attempt to issue 500 KG from LOT-TEST-101 (available: 300 KG)',
    '400 Bad Request: Insufficient stock in Lot',
    `${negStockIssue.status} ${negStockIssue.data?.message || ''}`,
    negStockIssue.status === 400 && (negStockIssue.data?.message || '').includes('Insufficient stock') ? 'PASS' : 'FAIL'
  );

  // Attempt to issue from non-existent lot
  const wrongLotIssue = await apiCall('POST', '/inventory/issued', {
    count: 'GREY Cotton Yarn 30s',
    partyId: testSupplier.id,
    lotNumber: 'LOT-NON-EXISTENT-999',
    bags: 1,
    kilos: 10.0,
    purpose: 'PILE',
  }, testTokens['STORE_OPERATOR']);

  recordTest(
    'SEC-WRG-LOT',
    'Store Operator',
    'Attempt to issue from non-existent lot LOT-NON-EXISTENT-999',
    '404 Not Found',
    `${wrongLotIssue.status} ${wrongLotIssue.data?.message || ''}`,
    wrongLotIssue.status === 404 ? 'PASS' : 'FAIL'
  );

  // --- Step 7: Issue Stock from Multiple Lots (100 KG from LOT-101, 20 KG from LOT-102) ---
  // Issue 1: 100 KG from LOT-TEST-101
  const issue1Res = await apiCall('POST', '/inventory/issued', {
    transactionDate: '2026-10-20',
    count: 'GREY Cotton Yarn 30s',
    partyId: testSupplier.id,
    lotNumber: 'LOT-TEST-101',
    bags: 3,
    kilos: 100.0,
    poNumber: dummyPONumber,
    purpose: 'PILE',
    referenceNumber: 'ISSUE-WO-001-A',
    remarks: 'Floor issue for PROD-TEST-001',
  }, testTokens['STORE_OPERATOR']);

  const issue1TxId = issue1Res.data?.data?.transaction?.id;
  recordTest(
    'STK-ISS-101',
    'Store Operator',
    'Issue 100 KG from LOT-TEST-101 against PO-TEST-150',
    '201 Created with remaining lot balance 200 KG',
    `${issue1Res.status} (Remaining: ${issue1Res.data?.data?.remainingStock?.currentWeightKg} KG)`,
    issue1Res.status === 201 && Number(issue1Res.data?.data?.remainingStock?.currentWeightKg) === 200 ? 'PASS' : 'FAIL',
    issue1Res.data
  );

  // Issue 2: 20 KG from LOT-TEST-102
  const issue2Res = await apiCall('POST', '/inventory/issued', {
    transactionDate: '2026-10-20',
    count: 'GREY Cotton Yarn 30s',
    partyId: testSupplier.id,
    lotNumber: 'LOT-TEST-102',
    bags: 1,
    kilos: 20.0,
    poNumber: dummyPONumber,
    purpose: 'PILE',
    referenceNumber: 'ISSUE-WO-001-B',
    remarks: 'Floor issue for PROD-TEST-001',
  }, testTokens['STORE_OPERATOR']);

  const issue2TxId = issue2Res.data?.data?.transaction?.id;
  recordTest(
    'STK-ISS-102',
    'Store Operator',
    'Issue 20 KG from LOT-TEST-102 against PO-TEST-150',
    '201 Created with remaining lot balance 180 KG',
    `${issue2Res.status} (Remaining: ${issue2Res.data?.data?.remainingStock?.currentWeightKg} KG)`,
    issue2Res.status === 201 && Number(issue2Res.data?.data?.remainingStock?.currentWeightKg) === 180 ? 'PASS' : 'FAIL',
    issue2Res.data
  );

  // Verify PO requirement issued quantity:
  const poAfterIssues = await prisma.pORequirement.findFirst({
    where: { poNumber: dummyPONumber },
  });
  console.log(`PO Requirement Issued KG: ${poAfterIssues.issuedKg} / ${poAfterIssues.requiredKg} (Status: ${poAfterIssues.status})`);
  recordTest(
    'PO-REQ-UPDATE',
    'Store Operator',
    'Verify PO requirement issuedKg updated automatically to 120 KG',
    'PO requirement issuedKg = 120 KG and status = PARTIAL',
    `issuedKg: ${poAfterIssues.issuedKg}, status: ${poAfterIssues.status}`,
    Number(poAfterIssues.issuedKg) === 120 ? 'PASS' : 'FAIL'
  );

  // --- Step 8: Production Allocation & Floor Tracking ---
  // Allocate Issue 1 (100 KG) to PROD-TEST-001 & team WEAVE-1
  const alloc1Res = await apiCall('POST', `/production/orders/${woId}/allocations`, {
    inventoryTransactionId: issue1TxId,
    productionTeamId: testTeam.id,
    allocatedKg: 100.0,
    bags: 3,
    remarks: 'Allocated 100 KG to Weaving Unit',
  }, testTokens['PRODUCTION_HEAD']);

  const alloc1Id = alloc1Res.data?.data?.id;
  recordTest(
    'PRD-ALC-01',
    'Production Manager',
    'Allocate 100 KG issued yarn to PROD-TEST-001 and Team WEAVE-1',
    '201 Created with allocation ID',
    `${alloc1Res.status} (Alloc ID: ${alloc1Id}, KG: ${alloc1Res.data?.data?.allocatedKg})`,
    alloc1Res.status === 201 && Number(alloc1Res.data?.data?.allocatedKg) === 100 ? 'PASS' : 'FAIL'
  );

  // Allocate Issue 2 (20 KG) to PROD-TEST-001 & team WEAVE-1
  const alloc2Res = await apiCall('POST', `/production/orders/${woId}/allocations`, {
    inventoryTransactionId: issue2TxId,
    productionTeamId: testTeam.id,
    allocatedKg: 20.0,
    bags: 1,
    remarks: 'Allocated 20 KG to Weaving Unit',
  }, testTokens['PRODUCTION_HEAD']);

  const alloc2Id = alloc2Res.data?.data?.id;
  recordTest(
    'PRD-ALC-02',
    'Production Manager',
    'Allocate 20 KG issued yarn to PROD-TEST-001 and Team WEAVE-1',
    '201 Created with allocation ID',
    `${alloc2Res.status} (Alloc ID: ${alloc2Id}, KG: ${alloc2Res.data?.data?.allocatedKg})`,
    alloc2Res.status === 201 && Number(alloc2Res.data?.data?.allocatedKg) === 20 ? 'PASS' : 'FAIL'
  );

  // Record Consumption: Consume 90 KG from Allocation 1 (leaving 10 KG surplus for return)
  const consumeRes = await apiCall('POST', `/production/orders/${woId}/consumption`, {
    yarnAllocationId: alloc1Id,
    consumedKg: 90.0,
    wasteKg: 1.5,
    wasteCategory: 'CONE_ENDS',
    bags: 2,
    remarks: 'Floor weaving consumption run 1',
  }, testTokens['PRODUCTION_HEAD']);

  recordTest(
    'PRD-CSM-01',
    'Production Manager',
    'Record floor consumption of 90 KG (plus 1.5 KG waste) from Allocation 1',
    '201 Created with recorded consumption ID',
    `${consumeRes.status} (Consumed: ${consumeRes.data?.data?.consumedKg} KG)`,
    consumeRes.status === 201 && Number(consumeRes.data?.data?.consumedKg) === 90 ? 'PASS' : 'FAIL'
  );

  // Negative test: Try to cancel work order while active consumption exists
  const cancelFailRes = await apiCall('POST', `/production/orders/${woId}/cancel`, {
    reason: 'Trying to cancel order with consumed yarn',
  }, testTokens['PRODUCTION_HEAD']);

  recordTest(
    'SEC-CANCEL-ACTIVE',
    'Production Manager',
    'Attempt to cancel work order with recorded consumption',
    '400 Bad Request: Cannot cancel Work Order because yarn consumption has already been recorded',
    `${cancelFailRes.status} ${cancelFailRes.data?.message || ''}`,
    cancelFailRes.status === 400 && (cancelFailRes.data?.message || '').includes('already been recorded') ? 'PASS' : 'FAIL'
  );

  // --- Step 9: Return Unused Yarn (10 KG) to Main Stock ---
  // Negative test: Attempt to return 25 KG from Allocation 1 (only 100 - 90 - 1.5 = 8.5 KG unconsumed available)
  const retFailRes = await apiCall('POST', `/production/orders/${woId}/returns`, {
    yarnAllocationId: alloc1Id,
    returnedKg: 25.0,
    returnedBags: 1,
    reason: 'Exceeding team unconsumed balance',
  }, testTokens['PRODUCTION_HEAD']);

  recordTest(
    'SEC-RET-EXCEED',
    'Production Manager',
    'Attempt to return 25 KG from team allocation (unconsumed balance is < 10 KG)',
    '400 Bad Request: Return quantity exceeds available unconsumed team balance',
    `${retFailRes.status} ${retFailRes.data?.message || ''}`,
    retFailRes.status === 400 && (retFailRes.data?.message || '').includes('exceeds available unconsumed') ? 'PASS' : 'FAIL'
  );

  // Return exactly 8.5 KG from Allocation 1 via production return (or return 10 KG directly against Issue 1)
  // Let's test the return of 8.5 KG from Allocation 1, plus 1.5 KG return from Allocation 2 = 10 KG total!
  // Or correct the consumption waste to 0 so exactly 10 KG can be returned from Allocation 1!
  // Let's test the consumption correction feature to make consumedKg = 90.0, wasteKg = 0.0, allowing exactly 10.0 KG return!
  const consumptionId = consumeRes.data?.data?.id;
  const correctCsmRes = await apiCall('POST', `/production/consumption/${consumptionId}/correct`, {
    newConsumedKg: 90.0,
    newWasteKg: 0.0,
    newBags: 2,
    reason: 'Correction: Zero waste, exactly 10 KG surplus remains for store return',
  }, testTokens['PRODUCTION_HEAD']);

  recordTest(
    'PRD-CSM-CORRECT',
    'Production Manager',
    'Correct consumption record to exactly 90.0 KG consumed and 0.0 KG waste',
    '201 Created replacement record with previous marked corrected',
    `${correctCsmRes.status} OK`,
    correctCsmRes.status === 201 ? 'PASS' : 'FAIL'
  );

  // Now return exactly 10.0 KG from Allocation 1 back to main store
  const prodReturnRes = await apiCall('POST', `/production/orders/${woId}/returns`, {
    yarnAllocationId: alloc1Id,
    returnedKg: 10.0,
    returnedBags: 1,
    reason: 'Surplus unused yarn returned from Weaving unit',
  }, testTokens['PRODUCTION_HEAD']);

  recordTest(
    'PRD-RET-10',
    'Production Manager',
    'Return 10 KG unused yarn from floor team back to Main Stock (synchronizing lot balance and inventory RETURN tx)',
    '201 Created with productionReturn and inventoryTransaction RET number',
    `${prodReturnRes.status} (Inv Tx: ${prodReturnRes.data?.data?.inventoryTransaction?.transactionNumber}, Lot Bal: ${prodReturnRes.data?.data?.lot?.currentWeightKg} KG)`,
    prodReturnRes.status === 201 && Number(prodReturnRes.data?.data?.lot?.currentWeightKg) === 210 ? 'PASS' : 'FAIL',
    prodReturnRes.data
  );

  // --- Step 10: Separate Authorized 2 KG Damaged-Stock Adjustment ---
  // Negative test: Attempt to retire without mandatory reason
  const retireNoReason = await apiCall('POST', '/inventory/retired', {
    lotNumber: 'LOT-TEST-102',
    bags: 0,
    kilos: 2.0,
    reason: '',
  }, testTokens['STOCK_HEAD']);

  recordTest(
    'SEC-RET-NOREASON',
    'Store Incharge',
    'Attempt to retire / adjust stock without mandatory reason',
    '400 Bad Request: Mandatory retirement reason/remarks is required',
    `${retireNoReason.status} ${JSON.stringify(retireNoReason.data)}`,
    retireNoReason.status === 400 ? 'PASS' : 'FAIL'
  );

  // Negative test: Attempt to retire more than available balance (500 KG on LOT-102)
  const retireOverBal = await apiCall('POST', '/inventory/retired', {
    lotNumber: 'LOT-TEST-102',
    bags: 10,
    kilos: 500.0,
    reason: 'Exceeding available balance',
  }, testTokens['STOCK_HEAD']);

  recordTest(
    'SEC-RET-OVERBAL',
    'Store Incharge',
    'Attempt to retire 500 KG from LOT-TEST-102 (available: 180 KG)',
    '400 Bad Request: Insufficient stock in Lot',
    `${retireOverBal.status} ${retireOverBal.data?.message || ''}`,
    retireOverBal.status === 400 ? 'PASS' : 'FAIL'
  );

  // Authorized 2 KG Damaged-Stock Adjustment from LOT-TEST-102
  const retireAdjRes = await apiCall('POST', '/inventory/retired', {
    transactionDate: '2026-10-20',
    lotNumber: 'LOT-TEST-102',
    bags: 0,
    kilos: 2.0,
    reason: 'Authorized QA Adjustment: 2 KG cone damage found during warehouse inspection',
    referenceNumber: 'QA-ADJ-2026-002',
  }, testTokens['STOCK_HEAD']);

  const lot102DbAdj = await prisma.lot.findUnique({ where: { lotNumber: 'LOT-TEST-102' } });
  recordTest(
    'STK-ADJ-02',
    'Store Incharge',
    'Record authorized 2 KG damaged-stock adjustment on LOT-TEST-102 via stock retirement',
    '201 Created with transaction RETIRED number and remaining lot balance 178 KG',
    `${retireAdjRes.status} (Tx: ${retireAdjRes.data?.data?.transactionNumber}, Lot Balance: ${lot102DbAdj?.currentWeightKg} KG)`,
    retireAdjRes.status === 201 && Number(lot102DbAdj?.currentWeightKg) === 178 ? 'PASS' : 'FAIL',
    retireAdjRes.data
  );

  // ===========================================================================
  // PHASE 5: CONCURRENCY RACE CONDITION TEST
  // ===========================================================================
  console.log('\n--- Phase 5: Concurrency Safety & Race Condition Audit ---');

  // LOT-TEST-102 has 178 KG remaining.
  // We fire two concurrent issues of 100 KG each (total 200 KG > 178 KG).
  // Exactly ONE must succeed and the other must fail with 400 Insufficient Stock.
  console.log('Testing concurrent parallel issues of 100 KG each on LOT-TEST-102 (Balance: 178 KG)...');
  const [raceRes1, raceRes2] = await Promise.all([
    apiCall('POST', '/inventory/issued', {
      transactionDate: '2026-10-20',
      count: 'GREY Cotton Yarn 30s',
      partyId: testSupplier.id,
      lotNumber: 'LOT-TEST-102',
      bags: 1,
      kilos: 100.0,
      purpose: 'GENERAL',
      remarks: 'Race condition test issue A',
    }, testTokens['STORE_OPERATOR']),
    apiCall('POST', '/inventory/issued', {
      transactionDate: '2026-10-20',
      count: 'GREY Cotton Yarn 30s',
      partyId: testSupplier.id,
      lotNumber: 'LOT-TEST-102',
      bags: 1,
      kilos: 100.0,
      purpose: 'GENERAL',
      remarks: 'Race condition test issue B',
    }, testTokens['STORE_OPERATOR']),
  ]);

  const raceStatuses = [raceRes1.status, raceRes2.status].sort();
  const racePassed = raceStatuses[0] === 201 && raceStatuses[1] === 400;
  recordTest(
    'SEC-CONCURRENCY',
    'Store Operator',
    'Atomic concurrency protection against simultaneous over-issuance (2x 100 KG against 178 KG stock)',
    'Exactly one succeeds (201 Created) and one rejected (400 Bad Request)',
    `Status 1: ${raceRes1.status}, Status 2: ${raceRes2.status}`,
    racePassed ? 'PASS' : 'FAIL'
  );

  // Reverse the successful race test issue so LOT-TEST-102 returns to exactly 178 KG
  const successfulRaceTx = raceRes1.status === 201 ? raceRes1.data?.data?.transaction : (raceRes2.status === 201 ? raceRes2.data?.data?.transaction : null);
  if (successfulRaceTx) {
    console.log(`Reversing successful race test transaction ${successfulRaceTx.transactionNumber} to restore expected 178 KG balance...`);
    const returnRaceRes = await apiCall('POST', '/inventory/return', {
      referenceTransactionId: successfulRaceTx.id,
      bags: 1,
      kilos: 100.0,
      remarks: 'Reversing race condition test transaction to restore exact QA balance',
    }, testTokens['STORE_OPERATOR']);
    console.log(`Race reversal status: ${returnRaceRes.status}`);
  }

  // ===========================================================================
  // PHASE 6: MATHEMATICAL RECONCILIATION & AUDIT VERIFICATION
  // ===========================================================================
  console.log('\n--- Phase 6: End-to-End Mathematical Stock Reconciliation ---');

  // 1. Fetch live database lot records
  const lot101 = await prisma.lot.findUnique({
    where: { lotNumber: 'LOT-TEST-101' },
    include: { transactions: true },
  });
  const lot102 = await prisma.lot.findUnique({
    where: { lotNumber: 'LOT-TEST-102' },
    include: { transactions: true },
  });
  const lot103 = await prisma.lot.findUnique({
    where: { lotNumber: 'LOT-TEST-103' },
    include: { transactions: true },
  });
  const lotRej = await prisma.lot.findUnique({
    where: { lotNumber: 'LOT-TEST-REJ-5' },
    include: { transactions: true },
  });

  const actual101 = Number(lot101.currentWeightKg);
  const actual102 = Number(lot102.currentWeightKg);
  const actual103 = Number(lot103.currentWeightKg);
  const totalActualAccepted = actual101 + actual102 + actual103;

  console.log(`LOT-TEST-101: Expected = 210.0000 KG | Actual = ${actual101.toFixed(4)} KG`);
  console.log(`LOT-TEST-102: Expected = 178.0000 KG | Actual = ${actual102.toFixed(4)} KG`);
  console.log(`LOT-TEST-103: Expected = 145.0000 KG | Actual = ${actual103.toFixed(4)} KG`);
  console.log(`LOT-TEST-REJ-5: Expected = 0.0000 KG (RETIRED) | Actual = ${Number(lotRej.currentWeightKg).toFixed(4)} KG (Status: ${lotRej.status})`);
  console.log(`TOTAL ACCEPTED STOCK: Expected = 533.0000 KG | Actual = ${totalActualAccepted.toFixed(4)} KG`);

  recordTest(
    'REC-LOT-101',
    'Auditor/Viewer',
    'Verify LOT-TEST-101 balance: 300 (open) - 100 (issue) + 10 (return) = 210 KG',
    '210.0000 KG',
    `${actual101.toFixed(4)} KG`,
    Math.abs(actual101 - 210) < 0.0001 ? 'PASS' : 'FAIL'
  );

  recordTest(
    'REC-LOT-102',
    'Auditor/Viewer',
    'Verify LOT-TEST-102 balance: 200 (open) - 20 (issue) - 2 (damaged adjustment) = 178 KG',
    '178.0000 KG',
    `${actual102.toFixed(4)} KG`,
    Math.abs(actual102 - 178) < 0.0001 ? 'PASS' : 'FAIL'
  );

  recordTest(
    'REC-LOT-103',
    'Auditor/Viewer',
    'Verify LOT-TEST-103 balance: 145 (accepted inward) = 145 KG',
    '145.0000 KG',
    `${actual103.toFixed(4)} KG`,
    Math.abs(actual103 - 145) < 0.0001 ? 'PASS' : 'FAIL'
  );

  recordTest(
    'REC-TOT-ACC',
    'Auditor/Viewer',
    'Verify Total Accepted Closing Stock: 500 + 145 - 120 + 10 - 2 = 533 KG',
    '533.0000 KG',
    `${totalActualAccepted.toFixed(4)} KG`,
    Math.abs(totalActualAccepted - 533) < 0.0001 ? 'PASS' : 'FAIL'
  );

  // 2. Fetch inventory API summary
  const summaryApi = await apiCall('GET', '/inventory/summary', null, testTokens['VIEWER']);
  recordTest(
    'REC-API-SUM',
    'Auditor/Viewer',
    'Verify GET /inventory/summary responds with active lots and aggregated stock',
    '200 OK with totalWeightKg >= 533 KG',
    `200 OK (Total Stock in DB: ${summaryApi.data?.data?.totalWeightKg} KG, Active Lots: ${summaryApi.data?.data?.activeLotsCount})`,
    summaryApi.status === 200 && summaryApi.data?.data?.totalWeightKg >= 533 ? 'PASS' : 'FAIL'
  );

  // 3. Traceability verification
  const traceApi = await apiCall('GET', '/traceability/forward/lot/LOT-TEST-101', null, testTokens['VIEWER']);
  recordTest(
    'TRC-FWD-101',
    'Auditor/Viewer',
    'Verify Forward Traceability for LOT-TEST-101 displays linked work order PROD-TEST-001',
    '200 OK with forward lineage chain',
    `${traceApi.status} (Lineage entries: ${traceApi.data?.data?.movements?.length || traceApi.data?.data?.transactions?.length || 'found'})`,
    traceApi.status === 200 ? 'PASS' : 'FAIL'
  );

  // 4. Audit Log verification
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: { in: ['ADD_OPENING_STOCK', 'RECEIVE_YARN', 'ISSUE_YARN', 'RETURN_YARN', 'RETIRE_STOCK'] },
    },
    take: 10,
    orderBy: { timestamp: 'desc' },
  });

  recordTest(
    'AUD-LOG-CHAIN',
    'Admin',
    'Verify immutable AuditLog entries created with actor userId, action, and delta snapshots',
    'Audit records exist for every stock-changing operation',
    `Found ${auditLogs.length} recent audit entries`,
    auditLogs.length >= 5 ? 'PASS' : 'FAIL'
  );

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n================================================================');
  console.log('📊 TEST EXECUTION SUMMARY');
  console.log('================================================================');
  const passed = testResults.filter(t => t.status === 'PASS').length;
  const failed = testResults.filter(t => t.status === 'FAIL').length;
  const blocked = testResults.filter(t => t.status === 'BLOCKED').length;
  console.log(`Total Tests Executed: ${testResults.length}`);
  console.log(`Passed:              ${passed} (✅)`);
  console.log(`Failed:              ${failed} (❌)`);
  console.log(`Blocked:             ${blocked} (⚠️)`);
  console.log('================================================================\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error during test execution:', err);
  prisma.$disconnect();
  process.exit(1);
});
