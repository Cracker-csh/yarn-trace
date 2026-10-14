import * as request from 'supertest';
import { createTestApp, TestHarness } from './test-app.fixture';

describe('E2E: Authentication & Authorization (Section A)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('1. Login Endpoint (POST /api/v1/auth/login)', () => {
    it('should successfully authenticate with valid credentials and return JWT tokens + profile', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@yarntrace.test',
          password: 'Password@123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Login successful');
      expect(res.body.data).toBeDefined();
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('admin@yarntrace.test');
      expect(res.body.data.user.role.code).toBe('ADMIN');
    });

    it('should reject login with incorrect password with 401 Unauthorized', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@yarntrace.test',
          password: 'WrongPassword@999',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('should reject login with non-existent email with 401 Unauthorized', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'unknown-user@yarntrace.test',
          password: 'Password@123',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('should reject login for INACTIVE user with 401 Unauthorized', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'inactive@yarntrace.test',
          password: 'Password@123',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Account is not active');
    });

    it('should reject login with missing fields via ValidationPipe with 400 Bad Request', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email-format',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeDefined();
    });
  });

  describe('2. Protected Endpoint Access & Token Validation', () => {
    it('should reject requests to protected endpoints without Authorization header with 401', async () => {
      const res = await request(harness.app.getHttpServer())
        .get('/api/v1/inventory/summary')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should reject requests with invalid / malformed JWT token with 401 Unauthorized', async () => {
      const res = await request(harness.app.getHttpServer())
        .get('/api/v1/inventory/summary')
        .set('Authorization', 'Bearer invalid.malformed.token.value')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should reject requests with expired JWT token with 401 Unauthorized', async () => {
      const secret = 'yarntrace_super_secure_access_secret_token_2026_key';
      const expiredToken = harness.jwtService.sign(
        { sub: 'user-admin', email: 'admin@yarntrace.test', role: 'ADMIN' },
        { secret, expiresIn: '-10s' },
      );

      const res = await request(harness.app.getHttpServer())
        .get('/api/v1/inventory/summary')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should allow authenticated user to retrieve their profile via GET /api/v1/auth/profile', async () => {
      const res = await request(harness.app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${harness.tokens.adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('admin@yarntrace.test');
      expect(res.body.data.role.code).toBe('ADMIN');
    });
  });

  describe('3. Role & Permission Enforcement', () => {
    it('should allow user with inventory.view permission (VIEWER) to view inventory summary', async () => {
      const res = await request(harness.app.getHttpServer())
        .get('/api/v1/inventory/summary')
        .set('Authorization', `Bearer ${harness.tokens.viewerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should reject unauthorized stock receipt attempt by VIEWER with 403 Forbidden', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/received')
        .set('Authorization', `Bearer ${harness.tokens.viewerToken}`)
        .send({
          count: '30s Combed',
          partyId: 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-UNAUTH-01',
          bags: 10,
          kilos: 500,
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject unauthorized stock issuance attempt by VIEWER with 403 Forbidden', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/issued')
        .set('Authorization', `Bearer ${harness.tokens.viewerToken}`)
        .send({
          count: '30s Combed',
          partyId: 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-TEST-100',
          bags: 5,
          kilos: 250,
          purpose: 'WEFT',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject unauthorized opening stock registration attempt by VIEWER with 403 Forbidden', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/opening')
        .set('Authorization', `Bearer ${harness.tokens.viewerToken}`)
        .send({
          count: '30s Combed',
          partyId: 'd3b07384-d113-467a-9a99-97bc618e7e11',
          lotNumber: 'LOT-OPEN-01',
          bags: 20,
          kilos: 1000,
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should allow ADMIN role to perform stock operations (admin bypasses granular permission checks)', async () => {
      // First, get supplier id from in-memory fixture
      const supplier = harness.prisma.parties.find((p) => p.type === 'SUPPLIER');

      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/received')
        .set('Authorization', `Bearer ${harness.tokens.adminToken}`)
        .send({
          count: '30s Combed',
          partyId: supplier?.id || 'party-supplier-1',
          lotNumber: 'LOT-ADMIN-RCV',
          bags: 10,
          kilos: 500.0,
          remarks: 'Admin receipt test',
        });

      // Should succeed (201 Created)
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.transactionNumber).toBeDefined();
    });

    it('should allow STORE_MANAGER (with granular inventory.issue permission) to perform issuance', async () => {
      const supplier = harness.prisma.parties.find((p) => p.type === 'SUPPLIER');

      const res = await request(harness.app.getHttpServer())
        .post('/api/v1/inventory/issued')
        .set('Authorization', `Bearer ${harness.tokens.managerToken}`)
        .send({
          count: '30s Combed',
          partyId: supplier?.id || 'party-supplier-1',
          lotNumber: 'LOT-TEST-100',
          bags: 2,
          kilos: 100.0,
          purpose: 'WEFT',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const txType = res.body.data.transaction ? res.body.data.transaction.type : res.body.data.type;
      expect(txType).toBe('ISSUED');
    });
  });
});
