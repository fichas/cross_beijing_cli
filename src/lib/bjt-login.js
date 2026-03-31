/**
 * Beijing Tong (北京通) login module.
 *
 * Handles the full OAuth login flow:
 * 1. Fetch login page to get RSA public key + cookies
 * 2. Fetch and OCR captcha image
 * 3. Encrypt credentials and submit login
 * 4. Follow redirect to obtain authorization token
 */

import { md5, rsaEncrypt } from './crypto-utils.js';
import { recognizeCaptcha } from './ocr.js';

const LOGIN_PAGE_URL =
  'https://bjt.beijing.gov.cn/renzheng/open/m/login/goUserLogin?client_id=100100000343&redirect_uri=https://bjjj.jtgl.beijing.gov.cn/uc/ucfront/userauth&response_type=code&scope=user_info&state=100100004153';
const CAPTCHA_URL = 'https://bjt.beijing.gov.cn/renzheng/common/generateCaptcha';
const LOGIN_URL = 'https://bjt.beijing.gov.cn/renzheng/inner/m/login/doUserLoginByPwd';

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
async function attemptLogin(phone, password) {
  const jar = new CookieJar();

  // Step 1: GET login page (expect 302)
  const resp1 = await fetch(LOGIN_PAGE_URL, { redirect: 'manual' });
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
  const captchaResp = await fetch(`${CAPTCHA_URL}?${Date.now()}`, {
    headers: { Cookie: jar.toString() },
  });
  jar.addFromResponse(captchaResp);
  const imageBuffer = Buffer.from(await captchaResp.arrayBuffer());
  const captcha = await recognizeCaptcha(imageBuffer);

  // Step 3: Encrypt credentials
  const encryptData = rsaEncrypt(
    { userIdentity: phone, resetFlag: false, encryptedPwd: md5(password) },
    pubKey,
  );

  // Step 4: POST login
  const loginResp = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jar.toString(),
    },
    body: `encryptData=${encodeURIComponent(encryptData)}&captcha=${encodeURIComponent(captcha)}`,
  });
  jar.addFromResponse(loginResp);
  const loginJson = await loginResp.json();

  const code = loginJson?.meta?.code;
  if (code === '5019') {
    // 密码错误，不重试
    const err = new Error(loginJson.meta.message || '密码错误');
    err.noRetry = true;
    throw err;
  }
  if (code === '5016') {
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

  // Step 5: Follow redirectUrl (expect 302)
  const resp5 = await fetch(redirectUrl, { redirect: 'manual' });
  if (resp5.status !== 302) {
    throw new Error(`Expected 302 from redirect, got ${resp5.status}`);
  }
  const location5 = resp5.headers.get('location');
  const token = getUrlParam(location5, 'token');
  if (!token) {
    throw new Error('Failed to extract token from final redirect');
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
export async function login(phone, password) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptLogin(phone, password);
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
