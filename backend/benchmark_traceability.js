const BASE_URL = 'http://localhost:4000/api/v1';

async function benchmark() {
  console.log('=== BENCHMARKING TRACEABILITY QUERIES ===');

  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@yarntrace.com', password: 'Password123!' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data.accessToken;
  const headers = { Authorization: `Bearer ${token}` };

  const targets = [
    { name: 'Forward: Lot 1014', url: `${BASE_URL}/traceability/forward/lot/Lot%201014` },
    { name: 'Forward: DEMO-LOT-001', url: `${BASE_URL}/traceability/forward/lot/DEMO-LOT-001` },
    { name: 'Forward: Lot 2014', url: `${BASE_URL}/traceability/forward/lot/Lot%202014` },
    { name: 'Backward: TEST_ORDER_001', url: `${BASE_URL}/traceability/backward/TEST_ORDER_001` },
  ];

  for (const t of targets) {
    const times = [];
    let status = 0;
    let nodeCount = 0;

    // Run 3 iterations
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const res = await fetch(t.url, { headers });
      const t1 = performance.now();
      status = res.status;
      const data = await res.json();
      times.push(t1 - t0);
      nodeCount = data?.data?.timeline?.length || data?.data?.consumedLots?.length || 0;
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`${t.name}: Status=${status}, Nodes/Lots=${nodeCount}, Times=[${times.map((x) => x.toFixed(1) + 'ms').join(', ')}], Avg=${avg.toFixed(1)}ms`);
  }
}

benchmark().catch(console.error);
