import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTripFields, validateApplyDate } from '../src/lib/trip-profile.js';
import { buildApplyPayload, formatDate } from '../src/lib/models.js';
import { applyPermit } from '../src/commands/run.js';

const INNER = '\u516d\u73af\u5185';
const OUTER = '\u516d\u73af\u5916';
const defaults = {
  outside: { code: 'test-road', name: 'Test checkpoint', longitude: '116.1', latitude: '39.6' },
  inside: { address: 'Test east gate', longitude: '116.2', latitude: '40.1' },
  destination: { area: 'Test district', district_code: 'test-district', address: 'Test destination', longitude: '116.3', latitude: '40.2' },
  purpose: { name: 'Test purpose', code: '06' },
};
const vehicle = { licenseNumber: 'test-plate', licensePlateType: '02', vehicleType: 'K33', vehicleId: 'vehicle-id' };
const driver = { name: 'Test driver', idNumber: 'test-driver-id' };

test('outside profile sends checkpoint, destination and exact date, clearing inside fields', () => {
  const before = structuredClone(defaults);
  const p = buildApplyPayload(vehicle, driver, '2026-10-05', OUTER, defaults, 'outside');
  assert.equal(p.sfzj, '0');
  assert.equal(p.jjlk, defaults.outside.code);
  assert.equal(p.jjlkmc, defaults.outside.name);
  assert.equal(p.jjlkgdjd, defaults.outside.longitude);
  assert.equal(p.jjlkgdwd, defaults.outside.latitude);
  assert.equal(p.jjdq, defaults.destination.district_code);
  assert.equal(p.xxdz, defaults.destination.address);
  assert.equal(p.jjdzgdjd, defaults.destination.longitude);
  assert.equal(p.jjdzgdwd, defaults.destination.latitude);
  assert.equal(p.jjmd, defaults.purpose.code);
  assert.equal(p.jjmdmc, defaults.purpose.name);
  assert.equal(p.zjxxdz, '');
  assert.equal(p.zjxxdzgdjd, '');
  assert.equal(p.zjxxdzgdwd, '');
  assert.equal(p.sqdzgdjd, '');
  assert.equal(p.sqdzgdwd, '');
  assert.equal(p.jjrq, '2026-10-05');
  assert.equal(p.jjzzl, '02');
  assert.equal(p.jszh, driver.idNumber);
  assert.deepEqual(defaults, before);
});

test('inside profile uses the east gate and clears all checkpoint fields', () => {
  const p = buildApplyPayload(vehicle, driver, '2026-10-05', INNER, defaults, 'inside');
  assert.equal(p.sfzj, '1');
  assert.equal(p.zjxxdz, defaults.inside.address);
  assert.equal(p.zjxxdzgdjd, defaults.inside.longitude);
  assert.equal(p.zjxxdzgdwd, defaults.inside.latitude);
  for (const key of ['jjlk', 'jjlkmc', 'jjlkgdjd', 'jjlkgdwd']) assert.equal(p[key], '');
  assert.equal(p.jjzzl, '01');
});

for (const location of [undefined, null, '', 'outer']) {
  test(`location must be explicitly selected: ${location}`, () => {
    assert.throws(() => buildTripFields(defaults, location), /--location/);
  });
}

for (const [field, value] of [['destination', null], ['purpose', undefined], ['outside', {}]]) {
  test(`incomplete profile fails closed: ${field}`, () => {
    assert.throws(() => buildTripFields({ ...defaults, [field]: value }, 'outside'), /trip/);
  });
}

for (const value of ['', ' ', null, true, 'NaN', Infinity, 181]) {
  test(`invalid coordinate is never sent: ${value}`, () => {
    assert.throws(() => buildTripFields({ ...defaults, outside: { ...defaults.outside, longitude: value } }, 'outside'), /coordinate/);
  });
}

test('real current coordinates stay separate from destination and checkpoint', () => {
  const p = buildTripFields({ ...defaults, current_location: { longitude: 115, latitude: 39 } }, 'outside');
  assert.equal(p.sqdzgdjd, '115');
  assert.equal(p.sqdzgdwd, '39');
  assert.notEqual(p.sqdzgdjd, p.jjdzgdjd);
});

for (const date of ['', '2026-2-1', '2026-02-29', '2026-13-01', null]) {
  test(`invalid date rejected: ${date}`, () => assert.throws(() => validateApplyDate(date)));
}
test('leap day accepted', () => assert.equal(validateApplyDate('2028-02-29'), '2028-02-29'));
test('invalid permit type and empty driver fail before submission', () => {
  assert.throws(() => buildApplyPayload(vehicle, driver, '2026-10-05', 'invalid', defaults, 'outside'));
  assert.throws(() => buildApplyPayload(vehicle, {}, '2026-10-05', OUTER, defaults, 'outside'));
});

function mockApi({ records = [], quota = '9', dates = ['2026-10-05'] } = {}) {
  const submissions = [];
  return {
    submissions,
    getStateData: async () => ({ bzclxx: [{ vId: vehicle.vehicleId, hphm: vehicle.licenseNumber, sycs: quota, syts: '0', bzxx: records }] }),
    listVehicles: async () => [{ vId: vehicle.vehicleId, hphm: vehicle.licenseNumber, hpzl: '02', cllx: 'K33' }],
    getUserInfo: async () => ({ jsrxm: driver.name, jszh: driver.idNumber }),
    callApi: async (path, data) => {
      assert.equal(path, 'pro/ucDicController/queryDic');
      assert.deepEqual(data, { type: 'jjmd' });
      return { data: [{ zdbm: '04', zdz: 'Training' }] };
    },
    checkHandle: async (v, type) => {
      assert.equal(v.vId, vehicle.vehicleId);
      assert.ok([INNER, OUTER].includes(type));
      return { jjrqs: dates };
    },
    submitApply: async (payload) => submissions.push(payload),
  };
}
const user = { trip_defaults: defaults };
const options = { date: '2026-10-05', location: 'outside' };

test('explicit date survives the complete apply flow and submits only once', async () => {
  const api = mockApi();
  const result = await applyPermit(api, user, vehicle.licenseNumber, OUTER, options);
  assert.equal(result.applied, true);
  assert.equal(api.submissions.length, 1);
  assert.equal(api.submissions[0].jjrq, options.date);
  assert.equal(api.submissions[0].sfzj, '0');
});

test('dry-run checks eligibility without submission or identity in preview', async () => {
  const api = mockApi();
  const result = await applyPermit(api, user, undefined, OUTER, { ...options, dryRun: true });
  assert.equal(result.applied, false);
  assert.equal(result.dryRun, true);
  assert.equal(api.submissions.length, 0);
  assert.equal(result.preview.destination, 'Test district Test destination');
  assert.ok(!JSON.stringify(result).includes(driver.idNumber));
});

test('server eligibility is authoritative and never silently replaces a date', async () => {
  for (const dates of [undefined, [], ['2026-10-04']]) {
    const api = mockApi();
    api.checkHandle = async () => ({ jjrqs: dates });
    await assert.rejects(applyPermit(api, user, undefined, OUTER, options));
    assert.equal(api.submissions.length, 0);
  }
});

test('missing purpose blocks the apply flow', async () => {
  const api = mockApi();
  await assert.rejects(applyPermit(api, { trip_defaults: { ...defaults, purpose: undefined } }, undefined, OUTER, options), /purpose/);
  assert.equal(api.submissions.length, 0);
});

test('one-time purpose is resolved from official dictionary without changing defaults', async () => {
  const api = mockApi();
  const before = structuredClone(user);
  await applyPermit(api, user, undefined, OUTER, { ...options, purpose: '04' });
  assert.equal(api.submissions[0].jjmd, '04');
  assert.equal(api.submissions[0].jjmdmc, 'Training');
  assert.deepEqual(user, before);
});

test('unknown purpose code blocks submission', async () => {
  const api = mockApi();
  await assert.rejects(applyPermit(api, user, undefined, OUTER, { ...options, purpose: 'invalid' }));
  assert.equal(api.submissions.length, 0);
});

test('active or pending permit prevents a duplicate submission', async () => {
  for (const blztmc of ['\u5ba1\u6838\u4e2d', '\u5ba1\u6838\u901a\u8fc7(\u5f85\u751f\u6548)', '\u5ba1\u6838\u901a\u8fc7(\u751f\u6548\u4e2d)']) {
    const api = mockApi({ records: [{ blztmc, yxqz: '2099-12-31' }] });
    assert.equal((await applyPermit(api, user, undefined, OUTER, options)).applied, false);
    assert.equal(api.submissions.length, 0);
  }
});

test('inner quota does not prevent an otherwise eligible outer permit', async () => {
  const api = mockApi({ quota: '0' });
  assert.equal((await applyPermit(api, user, undefined, INNER, options)).applied, false);
  assert.equal((await applyPermit(api, user, undefined, OUTER, options)).applied, true);
});

test('omitting date retains today selection but still requires a trip profile', async () => {
  const today = formatDate(new Date());
  const api = mockApi({ dates: [today] });
  assert.equal((await applyPermit(api, user, undefined, OUTER, { location: 'inside' })).applyDate, today);
  assert.equal(api.submissions[0].sfzj, '1');
});

test('legacy run calls default to outside and retain the configured road', async () => {
  const api = mockApi();
  const result = await applyPermit(api, user, undefined, OUTER, { date: options.date });
  assert.equal(result.applied, true);
  assert.equal(api.submissions.length, 1);
  assert.equal(api.submissions[0].sfzj, '0');
  assert.equal(api.submissions[0].jjlk, defaults.outside.code);
  assert.equal(api.submissions[0].zjxxdz, '');
});

test('default outside dry-run previews the actual selected profile without submitting', async () => {
  const api = mockApi();
  const result = await applyPermit(api, user, undefined, OUTER, { date: options.date, dryRun: true });
  assert.equal(result.preview.location, 'outside');
  assert.equal(result.preview.addressOrRoad, defaults.outside.name);
  assert.equal(api.submissions.length, 0);
});

test('default outside still rejects missing road information', async () => {
  const api = mockApi();
  await assert.rejects(applyPermit(api, { trip_defaults: { ...defaults, outside: undefined } }, undefined, OUTER, { date: options.date }), /outside/);
  assert.equal(api.submissions.length, 0);
});
