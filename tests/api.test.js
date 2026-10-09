const request = require('supertest');
const express = require('express');
const createRouter = require('../src/routes');
const UrjaClient = require('../src/urjaClient');
const config = require('../src/config');

describe('Flock Energy API Unit and Mock Tests', () => {
  let mockClient;
  let app;

  beforeEach(() => {
    mockClient = {
      login: jest.fn().mockResolvedValue(),
      getMeters: jest.fn().mockResolvedValue({
        data: [
          {
            meterId: 'J100000',
            serialNo: 'SE33962',
            make: 'HPL',
            phaseType: 'single',
            installStatus: 'Decommissioned',
            dtCode: 'DT-001'
          }
        ],
        pagination: {
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1
        }
      }),
      getMeterDetail: jest.fn().mockImplementation(async (id) => {
        if (id === 'J100000') {
          return {
            meterId: 'J100000',
            serialNo: 'SE33962',
            make: 'HPL',
            phaseType: 'single',
            installStatus: 'Decommissioned',
            installationType: 'Whole Current',
            location: {
              latitude: '26.938961',
              longitude: '75.830956'
            },
            hierarchy: {
              zone: 'Jaipur Zone 1 (Z-01)',
              circle: 'Circle 1 (C-01)',
              division: 'Division 1 (D-01)',
              subdivision: 'Subdivision 1 (SD-01)',
              substation: 'Substation 1 (SS-01)',
              feeder: 'Feeder 1 (F-001)',
              dt: 'Malviya Nagar DT 1 (DT-001)'
            }
          };
        }
        return null;
      }),
      getMeterConsumption: jest.fn().mockImplementation(async (id) => {
        if (id === 'J100000') {
          return {
            meterId: 'J100000',
            totalReadings: 2,
            readings: [
              {
                timestamp: '23/06/2026 23:30',
                kwh: 48438.74,
                kvah: 52313.84,
                voltageR: 226
              },
              {
                timestamp: '24/06/2026 00:00',
                kwh: 48439.16,
                kvah: 52314.29,
                voltageR: 229
              }
            ]
          };
        }
        return null;
      }),
      getDistributionTransformers: jest.fn().mockResolvedValue({
        transformers: [
          {
            code: 'DT-001',
            name: 'Malviya Nagar DT 1',
            feederCode: 'F-001',
            capacityKva: 100
          }
        ]
      })
    };

    app = express();
    app.use(express.json());
    app.use(createRouter(mockClient));
  });

  test('GET /health returns 200 and healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.timestamp).toBeDefined();
  });

  test('GET /openapi.json returns valid specification', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.paths['/api/v1/meters']).toBeDefined();
    expect(res.body.paths['/api/v1/meters/{id}']).toBeDefined();
    expect(res.body.paths['/api/v1/meters/{id}/consumption']).toBeDefined();
    expect(res.body.paths['/api/v1/hierarchy']).toBeDefined();
  });

  test('GET /api/v1/meters returns list with pagination', async () => {
    const res = await request(app).get('/api/v1/meters?q=HPL&page=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].meterId).toBe('J100000');
    expect(res.body.pagination.total).toBe(1);
    expect(mockClient.getMeters).toHaveBeenCalledWith('HPL', 1);
  });

  test('GET /api/v1/meters returns 400 for invalid page param', async () => {
    const res = await request(app).get('/api/v1/meters?page=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Page parameter must be an integer');
  });

  test('GET /api/v1/meters/:id returns meter detail', async () => {
    const res = await request(app).get('/api/v1/meters/J100000');
    expect(res.status).toBe(200);
    expect(res.body.meterId).toBe('J100000');
    expect(res.body.serialNo).toBe('SE33962');
    expect(res.body.location.latitude).toBe('26.938961');
    expect(res.body.hierarchy.dt).toBe('Malviya Nagar DT 1 (DT-001)');
  });

  test('GET /api/v1/meters/:id returns 404 for missing meter', async () => {
    const res = await request(app).get('/api/v1/meters/NONEXISTENT');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Meter not found');
  });

  test('GET /api/v1/meters/:id/consumption returns consumption series', async () => {
    const res = await request(app).get('/api/v1/meters/J100000/consumption');
    expect(res.status).toBe(200);
    expect(res.body.meterId).toBe('J100000');
    expect(res.body.totalReadings).toBe(2);
    expect(res.body.readings[0].kwh).toBe(48438.74);
  });

  test('GET /api/v1/meters/:id/consumption returns 404 for missing meter', async () => {
    const res = await request(app).get('/api/v1/meters/UNKNOWN/consumption');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Meter not found');
  });

  test('GET /api/v1/hierarchy returns distribution transformers', async () => {
    const res = await request(app).get('/api/v1/hierarchy');
    expect(res.status).toBe(200);
    expect(res.body.transformers).toHaveLength(1);
    expect(res.body.transformers[0].code).toBe('DT-001');
  });

  test('Handles upstream failures with 502 response', async () => {
    mockClient.getMeters.mockRejectedValue(new Error('Gateway timeout'));
    const res = await request(app).get('/api/v1/meters');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Upstream portal communication failed');
  });
});

describe('UrjaClient Session and Reauthentication', () => {
  test('reauthenticates automatically if session is expired', async () => {
    const client = new UrjaClient({
      urjaBaseUrl: 'http://fake-host',
      urjaUsername: 'operator@urja.local',
      urjaPassword: 'password'
    });

    let loginCalls = 0;
    client.login = jest.fn().mockImplementation(async () => {
      loginCalls++;
      client.isAuthenticated = true;
    });

    let attempts = 0;
    const mockRequest = jest.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        return { status: 401, data: 'Unauthorized' };
      }
      return { status: 200, data: { ok: true } };
    });

    const response = await client.executeWithAuth(mockRequest);
    expect(response.status).toBe(200);
    expect(response.data.ok).toBe(true);
    expect(loginCalls).toBe(2);
  });
});

const runLiveTests = process.env.RUN_LIVE_TESTS === 'true';
const describeLive = runLiveTests ? describe : describe.skip;

describeLive('Live Portal Integration (Urja Ops)', () => {
  let liveApp;

  beforeAll(() => {
    if (config.urjaUsername && config.urjaPassword) {
      const realClient = new UrjaClient();
      liveApp = express();
      liveApp.use(express.json());
      liveApp.use(createRouter(realClient));
    }
  });

  test('live GET /api/v1/meters fetches real smart meters', async () => {
    const res = await request(liveApp).get('/api/v1/meters?page=1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.pagination.total).toBe(403);
  });

  test('live GET /api/v1/meters/J100000 retrieves real detail and hierarchy', async () => {
    const res = await request(liveApp).get('/api/v1/meters/J100000');
    expect(res.status).toBe(200);
    expect(res.body.meterId).toBe('J100000');
    expect(res.body.serialNo).toBe('SE33962');
    expect(res.body.hierarchy.dt).toBe('Malviya Nagar DT 1 (DT-001)');
  });

  test('live GET /api/v1/meters/J100000/consumption retrieves real energy series', async () => {
    const res = await request(liveApp).get('/api/v1/meters/J100000/consumption');
    expect(res.status).toBe(200);
    expect(res.body.meterId).toBe('J100000');
    expect(res.body.totalReadings).toBe(337);
  });

  test('live GET /api/v1/hierarchy retrieves distribution transformers', async () => {
    const res = await request(liveApp).get('/api/v1/hierarchy');
    expect(res.status).toBe(200);
    expect(res.body.transformers.length).toBeGreaterThan(0);
  });

  test('live GET /api/v1/meters/NON_EXISTENT returns 404', async () => {
    const res = await request(liveApp).get('/api/v1/meters/NON_EXISTENT');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Meter not found');
  });
});

