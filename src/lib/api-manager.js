/**
 * API Manager — wraps all JTGL (交通管理局) REST API endpoints.
 *
 * Ported from Python jtgl_manager.py.
 */

import { REQUEST_TIMEOUT_MS } from '../constants.js';

const MINI_PROGRAM_HEADERS = {
  Accept: '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 ' +
    'Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) ' +
    'NetType/WIFI MiniProgramEnv/Mac MacWechat/WMPF ' +
    'MacWechat/3.8.7(0x13080712) UnifiedPCMacWechat(0xf2641c1d) XWEB/25300',
  Referer: 'https://servicewechat.com/wxebe8663cdfb4efbb/47/page-frame.html',
  xweb_xhr: '1',
  'Sec-Fetch-Site': 'cross-site',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
};

export class ApiManager {
  /**
   * @param {string} baseUrl - API base URL (no trailing slash)
   * @param {string} token - Business accessToken returned by login()
   */
  constructor(baseUrl, token, {
    fetchImpl = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Generic API call.
   *
   * @param {string} path - Endpoint path (appended to baseUrl)
   * @param {object} data - Request body (JSON-serialized for POST)
   * @param {object} extraHeaders - Additional headers to merge
   * @param {string} method - HTTP method (default POST)
   * @returns {Promise<object>} Parsed response JSON
   * @throws if response code !== 200
   */
  async callApi(path, data = {}, extraHeaders = {}, method = 'POST') {
    const url = `${this.baseUrl}/${path}`;
    const headers = {
      Authorization: this.token,
      'Content-Type': 'application/json',
      ...MINI_PROGRAM_HEADERS,
      ...extraHeaders,
    };

    const options = { method, headers, signal: AbortSignal.timeout(this.timeoutMs) };
    if (method === 'POST') {
      options.body = JSON.stringify(data);
    }

    const resp = await this.fetchImpl(url, options);
    if (!resp.ok) {
      throw new Error(`API HTTP error [${path}]: ${resp.status}`);
    }
    const result = await resp.json();

    if (result?.code !== 200) {
      throw new Error(
        `API error [${path}]: code=${result?.code ?? 'unknown'}, msg=${result?.msg || result?.message || 'unknown error'}`,
      );
    }

    return result;
  }

  // ── Vehicle ──────────────────────────────────────────

  async listVehicles() {
    const result = await this.callApi('pro/vehicleController/getUserIdInfo', {});
    return result.data;
  }

  async addVehicle(vehicleDict) {
    return this.callApi('pro/relationController/add', {
      relation: {},
      vehicle: vehicleDict,
    });
  }

  async deleteVehicle(vId) {
    return this.callApi('pro/relationController/deleteRelation', { vId });
  }

  // ── User ─────────────────────────────────────────────

  async getUserInfo() {
    const result = await this.callApi('pro/applyRecordController/getJsrxx', {});
    return result.data;
  }

  async getUserDetailInfo() {
    const result = await this.callApi('pro/userController/userInfo', {});
    return result.data;
  }

  // ── Apply ────────────────────────────────────────────

  async getStateData() {
    const result = await this.callApi('pro/applyRecordController/stateList', {});
    return result.data;
  }

  async submitApply(payload) {
    return this.callApi('pro/applyRecordController/insertApplyRecord', payload);
  }

  async checkHandle(vehicle, entryType) {
    const result = await this.callApi('pro/applyRecordController/checkHandle', {
      vId: vehicle.vId,
      hphm: vehicle.licenseNumber,
      jjzzl: entryType === '六环内' ? '01' : '02',
    });
    return result.data;
  }
}
