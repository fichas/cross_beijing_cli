/**
 * Beijing Tong (北京通) login module.
 *
 * Handles the full OAuth login flow:
 * 1. Fetch login page to get RSA public key + cookies
 * 2. Fetch and OCR captcha image
 * 3. Encrypt credentials and submit login
 * 4. Follow the SSO callback to obtain an intermediate token
 * 5. Exchange it for the JTGL business accessToken
 */

import { md5, rsaEncrypt } from './crypto-utils.js';
import { recognizeCaptcha } from './ocr.js';
import { API_BASE_URL, REQUEST_TIMEOUT_MS, SOURCE } from '../constants.js';

const SSO_CALLBACK_URL = 'https://ssp.jtgl.beijing.gov.cn/sso/callback/userauth';
const LOGIN_PAGE_URL =
  `https://bjt.beijing.gov.cn/renzheng/open/m/login/goUserLogin?client_id=100100001423&redirect_uri=${SSO_CALLBACK_URL}&response_type=code&scope=user_info&state=300002`;
const CAPTCHA_URL = 'https://bjt.beijing.gov.cn/renzheng/common/generateCaptcha';
const LOGIN_URL = 'https://bjt.beijing.gov.cn/renzheng/inner/m/login/doUserLoginByPwd';
const BUSINESS_LOGIN_STATE = '101000004072';
const PORTAL_ORIGIN = 'https://portal.bjt.beijing.gov.cn';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

const MAX_ATTEMPTS = 3;

/**
 * Extract a query/hash parameter from a URL string.
 */
function getUrlParam(url, key) {
  // Must NOT url-decode values — Python version returns raw params.
  // URLSearchParams.get() decodes, which corrupts base64 (+ → space).
  try {
    const parsed = new URL(url);
    for (const param of parsed.search.slice(1).split('&')) {
      const eqIdx = param.indexOf('=');
      if (eqIdx > 0 && param.substring(0, eqIdx) === key) {
        return param.substring(eqIdx + 1);
      }
    }
    if (parsed.hash) {
      for (const param of parsed.hash.slice(1).split('&')) {
        const eqIdx = param.indexOf('=');
        if (eqIdx > 0 && param.substring(0, eqIdx) === key) {
          return param.substring(eqIdx + 1);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Minimal cookie jar that accumulates Set-Cookie headers.
 */
class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  /**
   * Parse a single Set-Cookie header value and store name=value.
   */
  add(setCookieHeader) {
    if (!setCookieHeader) return;
    // First segment before ';' is name=value
    const pair = setCookieHeader.split(';')[0].trim();
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      this.cookies.set(name, value);
    }
  }

  /**
   * Add all Set-Cookie headers from a fetch Response.
   */
  addFromResponse(resp) {
    const setCookies =
      resp.headers.getSetCookie?.() ||
      resp.headers.raw?.()?.['set-cookie'] ||
      [];
    for (const header of setCookies) {
      this.add(header);
    }
  }

  toString() {
    return [...this.cookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

/**
 * Perform a single login attempt.
 *
 * @returns {string} Authorization token
 * @throws on non-retryable errors (bad credentials, etc.)
 */
async function attemptLogin(phone, password, request, recognizeCaptchaImpl) {
  const jar = new CookieJar();

  // Step 1: GET login page (expect 302)
  const resp1 = await request(LOGIN_PAGE_URL, {
    redirect: 'manual',
    headers: { 'User-Agent': USER_AGENT },
  });
  if (resp1.status !== 302) {
    throw new Error(`Expected 302 from login page, got ${resp1.status}`);
  }
  jar.addFromResponse(resp1);
  const location1 = resp1.headers.get('location');
  const pubKey = getUrlParam(location1, 'pubKey');
  if (!pubKey) {
    throw new Error('Failed to extract pubKey from login redirect');
  }

  // Step 2: GET captcha image
  const captchaResp = await request(`${CAPTCHA_URL}?${Date.now()}`, {
    headers: {
      Cookie: jar.toString(),
      Referer: location1,
      'User-Agent': USER_AGENT,
    },
  });
  if (!captchaResp.ok) {
    throw new Error(`Captcha request failed: HTTP ${captchaResp.status}`);
  }
  jar.addFromResponse(captchaResp);
  const imageBuffer = Buffer.from(await captchaResp.arrayBuffer());
  const captcha = await recognizeCaptchaImpl(imageBuffer);

  // Step 3: Encrypt credentials
  const encryptData = rsaEncrypt(
    { userIdentity: phone, resetFlag: false, encryptedPwd: md5(password) },
    pubKey,
  );

  // Step 4: POST login
  const loginResp = await request(LOGIN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jar.toString(),
      Origin: PORTAL_ORIGIN,
      Referer: location1,
      'User-Agent': USER_AGENT,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: `encryptData=${encodeURIComponent(encryptData)}&captcha=${encodeURIComponent(captcha)}`,
  });
  if (!loginResp.ok) {
    throw new Error(`Login request failed: HTTP ${loginResp.status}`);
  }
  jar.addFromResponse(loginResp);
  const loginJson = await loginResp.json();

  const code = String(loginJson?.meta?.code ?? '');
  if (code === '5019') {
    // 密码错误，不重试
    const err = new Error(loginJson.meta.message || '密码错误');
    err.noRetry = true;
    throw err;
  }
  if (['5016', '5017', '5021'].includes(code)) {
    // 验证码错误，可重试
    throw new Error(loginJson.meta.message || '验证码错误');
  }

  const redirectUrl = loginJson?.data?.redirectUrl;
  if (!redirectUrl) {
    // Retryable — likely captcha OCR failure
    throw Object.assign(
      new Error(loginJson?.meta?.message || 'No redirectUrl in login response'),
      { retryable: true },
    );
  }

  // Step 5: The SSO callback returns an intermediate token, not a business token.
  const callback = new URL(redirectUrl);
  if (`${callback.origin}${callback.pathname}` !== SSO_CALLBACK_URL) {
    throw new Error('Unexpected SSO callback URL');
  }
  const resp5 = await request(redirectUrl, {
    redirect: 'manual',
    headers: { 'User-Agent': USER_AGENT },
  });
  if (resp5.status !== 302) {
    throw new Error(`Expected 302 from redirect, got ${resp5.status}`);
  }
  const location5 = resp5.headers.get('location');
  const intermediateToken = getUrlParam(location5, 'token');
  if (!intermediateToken) {
    throw new Error('Failed to extract intermediate token from SSO callback');
  }

  // Step 6: Exchange the SSO token before using any business API.
  const exchangeResp = await request(
    `${API_BASE_URL}/auth/userController/loginUserByUserCenter?state=${BUSINESS_LOGIN_STATE}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', source: SOURCE },
      body: JSON.stringify({ token: intermediateToken, state: BUSINESS_LOGIN_STATE }),
    },
  );
  if (!exchangeResp.ok) {
    throw new Error(`Business token exchange HTTP ${exchangeResp.status}`);
  }
  const result = await exchangeResp.json();
  if (result?.code !== 200) {
    throw new Error(`Business token exchange failed: code=${result?.code ?? 'unknown'}`);
  }
  const token = (typeof result.data === 'string' ? result.data : result.data?.accessToken)
    || result.accessToken;
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Business token exchange did not return accessToken');
  }
  return token;
}

/**
 * Login to Beijing Tong and obtain an authorization token.
 *
 * Retries up to 3 times (captcha OCR may fail).
 *
 * @param {string} phone - User's phone number
 * @param {string} password - User's password
 * @returns {Promise<string>} Authorization token
 */
export async function login(phone, password, {
  fetchImpl = globalThis.fetch,
  recognizeCaptchaImpl = recognizeCaptcha,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const request = (url, options = {}) => fetchImpl(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptLogin(phone, password, request, recognizeCaptchaImpl);
    } catch (err) {
      lastError = err;
      if (err.noRetry) throw err;
      if (attempt < MAX_ATTEMPTS) {
        continue;
      }
    }
  }
  throw lastError;
}
