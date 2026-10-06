import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiManager } from '../src/lib/api-manager.js';
import { API_BASE_URL } from '../src/constants.js';

test('state query uses business token directly with no legacy activation', async () => {
  const calls = [];
  const state = { bzclxx: [] };
  const api = new ApiManager(API_BASE_URL, 'business-token', {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ code: 200, data: state });
    },
  });
  assert.deepEqual(await api.getStateData(), state);
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(new URL(url).port, '1443');
  assert.equal(new URL(url).pathname, '/pro/applyRecordController/stateList');
  assert.equal(options.headers.Authorization, 'business-token');
  assert.match(options.headers['User-Agent'], /MicroMessenger/);
  assert.match(options.headers.Referer, /^https:\/\/servicewechat\.com\//);
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.body, '{}');
});

test('vehicle, driver and user detail reads stay on business endpoints', async () => {
  const paths = [];
  const api = new ApiManager(API_BASE_URL, 'business-token', {
    fetchImpl: async (url) => {
      paths.push(new URL(url).pathname);
      return Response.json({ code: 200, data: {} });
    },
  });
  await api.listVehicles();
  await api.getUserInfo();
  await api.getUserDetailInfo();
  assert.deepEqual(paths, [
    '/pro/vehicleController/getUserIdInfo',
    '/pro/applyRecordController/getJsrxx',
    '/pro/userController/userInfo',
  ]);
});

test('permit and vehicle mutations retain their payloads and send once', async () => {
  const calls = [];
  const api = new ApiManager(API_BASE_URL, 'business-token', {
    fetchImpl: async (url, options) => {
      calls.push({ path: new URL(url).pathname, body: JSON.parse(options.body) });
      return Response.json({ code: 200 });
    },
  });
  const permit = { jjzzl: '02', jjrq: '2026-10-04', vId: 'test-vehicle' };
  const vehicle = { hphm: 'test-plate', hpzl: '02' };
  await api.submitApply(permit);
  await api.addVehicle(vehicle);
  await api.deleteVehicle('test-vehicle');
  assert.deepEqual(calls, [
    { path: '/pro/applyRecordController/insertApplyRecord', body: permit },
    { path: '/pro/relationController/add', body: { relation: {}, vehicle } },
    { path: '/pro/relationController/deleteRelation', body: { vId: 'test-vehicle' } },
  ]);
});

test('eligibility check sends the selected vehicle and permit type without submitting', async () => {
  const calls = [];
  const api = new ApiManager(API_BASE_URL, 'business-token', {
    fetchImpl: async (url, options) => {
      calls.push({ path: new URL(url).pathname, body: JSON.parse(options.body) });
      return Response.json({ code: 200, data: { jjrqs: ['2026-10-05'] } });
    },
  });
  const result = await api.checkHandle({ vId: 'test-vehicle', licenseNumber: 'test-plate' }, '\u516d\u73af\u5916');
  assert.deepEqual(result, { jjrqs: ['2026-10-05'] });
  assert.deepEqual(calls, [{
    path: '/pro/applyRecordController/checkHandle',
    body: { vId: 'test-vehicle', hphm: 'test-plate', jjzzl: '02' },
  }]);
});

for (const result of [{ code: 401, msg: 'token expired' }, null, { code: 500 }]) {
  test(`business error fails without retry: ${JSON.stringify(result)}`, async () => {
    let calls = 0;
    const api = new ApiManager(API_BASE_URL, 'business-token', {
      fetchImpl: async () => { calls++; return Response.json(result); },
    });
    await assert.rejects(api.submitApply({}), /API error/);
    assert.equal(calls, 1);
  });
}

test('HTTP errors are reported before parsing a non-JSON response', async () => {
  const api = new ApiManager(API_BASE_URL, 'business-token', {
    fetchImpl: async () => new Response('<html>unavailable</html>', { status: 503 }),
  });
  await assert.rejects(api.getStateData(), /API HTTP error.*503/);
});

for (const stage of ['fetch', 'body']) {
  test(`timeout covers ${stage} and never retries a permit submission`, async () => {
    let calls = 0;
    const api = new ApiManager(API_BASE_URL, 'business-token', {
      timeoutMs: 10,
      fetchImpl: async (_url, { signal }) => {
        calls++;
        const stalled = () => new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1000);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason);
          }, { once: true });
        });
        return stage === 'fetch' ? stalled() : { ok: true, json: stalled };
      },
    });
    await assert.rejects(api.submitApply({}), { name: 'TimeoutError' });
    assert.equal(calls, 1);
  });
}
