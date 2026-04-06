import { test, expect } from '@playwright/test';

const API_BASE = process.env.OPEN_KRAKEN_BROWSER_BASE_URL || 'http://localhost:8080';

test.describe('Backend API health', () => {
  test('healthz returns ok', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/healthz`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe('ok');
  });

  test('metrics endpoint returns prometheus format', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/metrics`);
    expect(resp.status()).toBe(200);
    const text = await resp.text();
    expect(text).toContain('kraken_http_requests_total');
    expect(text).toContain('kraken_go_goroutines');
  });
});

test.describe('API CRUD smoke', () => {
  test('node registration flow', async ({ request }) => {
    // Register a node.
    const registerResp = await request.post(`${API_BASE}/api/v1/nodes/register`, {
      data: {
        id: 'e2e-node-1',
        hostname: 'e2e-host',
        nodeType: 'bare_metal',
        labels: {},
      },
    });
    expect(registerResp.status()).toBe(201);
    const node = await registerResp.json();
    expect(node.id).toBe('e2e-node-1');
    expect(node.status).toBe('online');

    // List nodes.
    const listResp = await request.get(`${API_BASE}/api/v1/nodes`);
    expect(listResp.status()).toBe(200);

    // Heartbeat.
    const hbResp = await request.post(`${API_BASE}/api/v1/nodes/e2e-node-1/heartbeat`);
    expect(hbResp.status()).toBe(200);

    // Cleanup: deregister.
    const delResp = await request.delete(`${API_BASE}/api/v1/nodes/e2e-node-1`);
    expect(delResp.status()).toBe(204);
  });

  test('token event recording', async ({ request }) => {
    const resp = await request.post(`${API_BASE}/api/v1/tokens/events`, {
      data: {
        memberId: 'e2e-member',
        nodeId: 'e2e-node',
        model: 'claude-3.5-sonnet',
        inputTokens: 200,
        outputTokens: 100,
        cost: 0.003,
      },
    });
    expect(resp.status()).toBe(201);
    const event = await resp.json();
    expect(event.id).toBeTruthy();
  });

  test('ledger event recording', async ({ request }) => {
    const resp = await request.post(`${API_BASE}/api/v1/ledger/events`, {
      data: {
        workspaceId: 'ws-e2e',
        memberId: 'e2e-member',
        eventType: 'test.e2e',
        summary: 'e2e smoke test',
      },
    });
    expect(resp.status()).toBe(201);
    const event = await resp.json();
    expect(event.id).toBeTruthy();
  });
});
