import * as request from 'supertest';
import { createTestApp, TestHarness } from './test-app.fixture';

describe('E2E: Inventory Flow & Production Traceability (Section B)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  // ===========================================================================
  // 1. STOCK RECEIPT ENDPOINT (POST /api/v1/inventory/received)
  // ===========================================================================
  describe('1. Stock Receipt Endpoint', () => {
    it('should successfully record inward yarn stock and create a RECEIVED transaction', async () => {
      const supplier = harness.prisma.parties.find((p) => p.type === 'SUPPLIER');

      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/received')
        .set('Authorization', `Bearer ${harness.tokens.managerToken}`)
        .send({
          count: '30s Combed',
          partyId: supplier?.id || 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-E2E-RCV-01',
          bags: 40,
          kilos: 2000.0,
          poNumber: 'PO-2026-TEST1',
          purpose: 'WEFT',
          remarks: 'E2E inbound delivery test',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('received successfully');
      expect(res.body.data).toBeDefined();
      expect(res.body.data.type).toBe('RECEIVED');
      expect(res.body.data.transactionNumber).toBeDefined();

      // Verify Lot was created in database
      const lot = harness.prisma.lots.find((l) => l.lotNumber === 'LOT-E2E-RCV-01');
      expect(lot).toBeDefined();
      expect(lot?.currentBags).toBe(40);
      expect(Number(lot?.currentWeightKg)).toBe(2000.0);
    });

    it('should reject inward receipt with negative bags or negative weight with 400 Bad Request', async () => {
      const supplier = harness.prisma.parties.find((p) => p.type === 'SUPPLIER');

      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/received')
        .set('Authorization', `Bearer ${harness.tokens.managerToken}`)
        .send({
          count: '30s Combed',
          partyId: supplier?.id || 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-E2E-FAIL',
          bags: -5,
          kilos: -100.0,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeDefined();
    });
  });

  // ===========================================================================
  // 2. STOCK ISSUANCE & NEGATIVE-STOCK PREVENTION
  // ===========================================================================
  describe('2. Stock Issuance & Negative-Stock Prevention', () => {
    it('should successfully issue yarn against existing lot balance', async () => {
      const supplier = harness.prisma.parties.find((p) => p.type === 'SUPPLIER');

      // LOT-TEST-100 starts with 50 bags, 2500 kg
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/issued')
        .set('Authorization', `Bearer ${harness.tokens.managerToken}`)
        .send({
          count: '30s Combed',
          partyId: supplier?.id || 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-TEST-100',
          bags: 5,
          kilos: 250.0,
          purpose: 'WEFT',
          poNumber: 'PO-2026-TEST1',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      const tx = res.body.data.transaction || res.body.data;
      expect(tx.type).toBe('ISSUED');
      expect(res.body.data.remainingStock).toBeDefined();
      expect(res.body.data.remainingStock.currentBags).toBeLessThan(50);
    });

    it('should REJECT issuance exceeding available kilograms in lot with 400 Bad Request', async () => {
      const supplier = harness.prisma.parties.find((p) => p.type === 'SUPPLIER');
      const lot = harness.prisma.lots.find((l) => l.lotNumber === 'LOT-TEST-100');
      const availableKg = Number(lot?.currentWeightKg || 0);

      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/issued')
        .set('Authorization', `Bearer ${harness.tokens.managerToken}`)
        .send({
          count: '30s Combed',
          partyId: supplier?.id || 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-TEST-100',
          bags: 2,
          kilos: availableKg + 500.0, // Exceeds available stock
          purpose: 'WEFT',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Insufficient stock in Lot');
    });

    it('should REJECT issuance exceeding available bags in lot with 400 Bad Request', async () => {
      const supplier = harness.prisma.parties.find((p) => p.type === 'SUPPLIER');
      const lot = harness.prisma.lots.find((l) => l.lotNumber === 'LOT-TEST-100');
      const availableBags = lot?.currentBags || 0;

      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/issued')
        .set('Authorization', `Bearer ${harness.tokens.managerToken}`)
        .send({
          count: '30s Combed',
          partyId: supplier?.id || 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-TEST-100',
          bags: availableBags + 20, // Exceeds available bags
          kilos: 50.0,
          purpose: 'WEFT',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Insufficient bags in Lot');
    });
  });

  // ===========================================================================
  // 3. PO MATCHING & 103% CEILING LIMIT
  // ===========================================================================
  describe('3. PO Matching & 103% Ceiling Enforcement', () => {
    // po-req-ceiling has: required 1000 kg, issued 950 kg, ceiling 1030 kg -> max additional allowable = 80 kg.
    it('should ALLOW issuance within the 103% ceiling (e.g. 50 kg <= 80 kg limit)', async () => {
      const supplier = harness.prisma.parties.find((p) => p.type === 'SUPPLIER');

      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/issued')
        .set('Authorization', `Bearer ${harness.tokens.managerToken}`)
        .send({
          count: '30s Combed',
          partyId: supplier?.id || 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-TEST-100',
          bags: 1,
          kilos: 50.0,
          poNumber: 'PO-2026-CEILING',
          purpose: 'WEFT',
        })
        .expect(201);

      expect(res.body.success).toBe(true);

      // Verify PO requirement issuedKg was incremented: 950 + 50 = 1000 kg
      const req = harness.prisma.poRequirements.find((r) => r.id === 'po-req-ceiling');
      expect(Number(req?.issuedKg)).toBe(1000.0);
    });

    it('should REJECT issuance exceeding the 103% tolerance ceiling limit with 400 Bad Request', async () => {
      const supplier = harness.prisma.parties.find((p) => p.type === 'SUPPLIER');

      // Currently issued: 1000 kg. Ceiling: 1030 kg. Remaining allowable: 30 kg.
      // Requesting 60 kg -> 1000 + 60 = 1060 kg > 1030 kg ceiling!
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/issued')
        .set('Authorization', `Bearer ${harness.tokens.managerToken}`)
        .send({
          count: '30s Combed',
          partyId: supplier?.id || 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-TEST-100',
          bags: 2,
          kilos: 60.0,
          poNumber: 'PO-2026-CEILING',
          purpose: 'WEFT',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('PO 103% Requirement Rule Exceeded');
    });
  });

  // ===========================================================================
  // 4. PRODUCTION ALLOCATION & FORWARD TRACEABILITY
  // ===========================================================================
  describe('4. Production Allocation & Forward Traceability', () => {
    let issuedTransactionId: string;

    beforeAll(async () => {
      const supplier = harness.prisma.parties.find((p) => p.type === 'SUPPLIER');

      // Perform a fresh issuance to obtain an ISSUED transaction for allocation
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/issued')
        .set('Authorization', `Bearer ${harness.tokens.adminToken}`)
        .send({
          count: '30s Combed',
          partyId: supplier?.id || 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-TEST-100',
          bags: 3,
          kilos: 150.0,
          purpose: 'WEFT',
        });

      const tx = res.body.data.transaction || res.body.data;
      issuedTransactionId = tx.id;
    });

    it('should successfully allocate issued yarn to an active production work order', async () => {
      const order = harness.prisma.productionOrders[0];
      const team = harness.prisma.productionTeams[0];

      const res = await request(harness.app.getHttpServer())
        .post(`/api/v1/production/orders/${order.id}/allocations`)
        .set('Authorization', `Bearer ${harness.tokens.managerToken}`)
        .send({
          inventoryTransactionId: issuedTransactionId,
          productionTeamId: team.id,
          allocatedKg: 100.0,
          bags: 2,
          remarks: 'E2E floor allocation to weaving team',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Number(res.body.data.allocatedKg)).toBe(100.0);
    });

    it('should retrieve complete forward traceability trail for yarn lot', async () => {
      const res = await request(harness.app.getHttpServer())
        .get('/api/v1/traceability/forward/lot/LOT-TEST-100')
        .set('Authorization', `Bearer ${harness.tokens.viewerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.root).toBeDefined();
      expect(res.body.data.root.lotNumber).toBe('LOT-TEST-100');
      expect(res.body.data.summary).toBeDefined();
      expect(Array.isArray(res.body.data.timeline)).toBe(true);
    });
  });
});
