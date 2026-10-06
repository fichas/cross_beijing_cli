import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { login } from '../src/lib/bjt-login.js';
import { API_BASE_URL, SOURCE } from '../src/constants.js';

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pubKey = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const callback = 'https://ssp.jtgl.beijing.gov.cn/sso/callback/userauth';
const intermediateToken = 'sso+token%2F==';

function loginFixture({
  codes = ['0'],
  exchange = { code: 200, data: { accessToken: 'business-token' } },
  exchangeStatus = 200,
  redirectUrl = `${callback}?code=test-code`,
  callbackLocation = `https://jjz.jtgl.beijing.gov.cn:1443/login?token=${intermediateToken}`,
} = {}) {
  const calls = [];
  let attempt = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    assert.ok(options.signal instanceof AbortSignal);
    const path = new URL(url).pathname;
    if (path.endsWith('/goUserLogin')) {
      return new Response(null, { status: 302, headers: {
        location: `https://portal.bjt.beijing.gov.cn/m/index.html?pubKey=${pubKey}`,
        'set-cookie': 'session=test-session; Path=/; Secure',
      } });
    }
    if (path.endsWith('/generateCaptcha')) {
      assert.match(options.headers.Cookie, /session=test-session/);
      return new Response('fake-captcha', { headers: { 'content-type': 'image/png' } });
    }
    if (path.endsWith('/doUserLoginByPwd')) {
      assert.equal(options.headers.Origin, 'https://portal.bjt.beijing.gov.cn');
      assert.match(options.headers.Cookie, /session=test-session/);
      assert.equal(new URLSearchParams(options.body).get('captcha'), '1234');
      assert.ok(new URLSearchParams(options.body).get('encryptData'));
      assert.ok(!options.body.includes('test-password'));
      const code = codes[Math.min(attempt++, codes.length - 1)];
      return Response.json({
        meta: { code, message: 'login rejected' },
        data: String(code) === '0' ? { redirectUrl } : {},
      });
    }
    if (path === '/sso/callback/userauth') {
      return new Response(null, { status: 302, headers: { location: callbackLocation } });
    }
    if (path.endsWith('/loginUserByUserCenter')) {
      return Response.json(exchange, { status: exchangeStatus });
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  return {
    calls,
    options: {
      fetchImpl,
      recognizeCaptchaImpl: async (buffer) => {
        assert.equal(buffer.toString(), 'fake-captcha');
        return '1234';
      },
    },
  };
}

test('login exchanges the new SSO token for a business token', async () => {
  const fixture = loginFixture();
  const token = await login('test-phone', 'test-password', fixture.options);
  assert.equal(token, 'business-token');
  assert.equal(fixture.calls.length, 5);
  const entry = fixture.calls[0].url;
  assert.equal(entry.searchParams.get('client_id'), '100100001423');
  assert.equal(entry.searchParams.get('state'), '300002');
  assert.equal(entry.searchParams.get('redirect_uri'), callback);
  const exchange = fixture.calls.at(-1);
  assert.equal(exchange.url.origin, API_BASE_URL);
  assert.equal(exchange.url.port, '1443');
  assert.equal(exchange.url.searchParams.get('state'), '101000004072');
  assert.equal(exchange.options.headers.source, SOURCE);
  assert.deepEqual(JSON.parse(exchange.options.body), {
    token: intermediateToken, state: '101000004072',
  });
  assert.equal(fixture.calls[3].options.redirect, 'manual');
});

for (const data of [
  { code: 200, data: 'string-token' },
  { code: 200, accessToken: 'top-level-token' },
]) {
  test(`login accepts exchange response ${Object.keys(data).join(',')}`, async () => {
    const fixture = loginFixture({ exchange: data });
    assert.equal(await login('test-phone', 'test-password', fixture.options),
      data.data || data.accessToken);
  });
}

test('numeric password error stops without retry or token exchange', async () => {
  const fixture = loginFixture({ codes: [5019] });
  await assert.rejects(login('test-phone', 'test-password', fixture.options), /login rejected/);
  assert.equal(fixture.calls.length, 3);
});

for (const code of ['5016', '5017', '5021']) {
  test(`captcha error ${code} retries and completes the exchange`, async () => {
    const fixture = loginFixture({ codes: [code, '0'] });
    assert.equal(await login('test-phone', 'test-password', fixture.options), 'business-token');
    assert.equal(fixture.calls.filter(c => c.url.pathname.endsWith('/goUserLogin')).length, 2);
    assert.equal(fixture.calls.filter(c => c.url.pathname.endsWith('/loginUserByUserCenter')).length, 1);
  });
}

for (const exchange of [null, { code: 401 }, { code: 200 },
  { code: 200, data: null }, { code: 200, data: { accessToken: '' } },
  { code: 200, data: { accessToken: '  ' } }, { code: 200, data: { accessToken: 123 } }]) {
  test(`invalid exchange response is rejected: ${JSON.stringify(exchange)}`, async () => {
    const fixture = loginFixture({ exchange });
    await assert.rejects(login('test-phone', 'test-password', fixture.options), /Business token exchange/);
    assert.equal(fixture.calls.filter(c => c.url.pathname.endsWith('/goUserLogin')).length, 3);
  });
}

test('HTTP failure cannot be mistaken for a successful token exchange', async () => {
  const fixture = loginFixture({ exchangeStatus: 503 });
  await assert.rejects(login('test-phone', 'test-password', fixture.options), /HTTP 503/);
});

test('missing SSO token never reaches business exchange', async () => {
  const fixture = loginFixture({ callbackLocation: 'https://jjz.jtgl.beijing.gov.cn:1443/login' });
  await assert.rejects(login('test-phone', 'test-password', fixture.options), /intermediate token/);
  assert.ok(fixture.calls.every(c => !c.url.pathname.endsWith('/loginUserByUserCenter')));
});

test('unexpected callback is not fetched', async () => {
  const fixture = loginFixture({ redirectUrl: 'https://example.com/unexpected?code=test' });
  await assert.rejects(login('test-phone', 'test-password', fixture.options), /Unexpected SSO callback/);
  assert.ok(fixture.calls.every(c => c.url.hostname === 'bjt.beijing.gov.cn'));
});

test('login network requests time out after bounded retries', async () => {
  let calls = 0;
  await assert.rejects(login('test-phone', 'test-password', {
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => {
      calls++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1000);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(signal.reason);
        }, { once: true });
      });
    },
  }), { name: 'TimeoutError' });
  assert.equal(calls, 3);
});
