/**
 * API Manager — wraps all JTGL (交通管理局) REST API endpoints.
 *
 * Ported from Python jtgl_manager.py.
 */

import { SOURCE } from '../constants.js';

export class ApiManager {
  /**
   * @param {string} baseUrl - API base URL (no trailing slash)
   * @param {string} token - Authorization token from Beijing Tong login
   */
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
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
      ...extraHeaders,
    };

    const options = { method, headers };
    if (method === 'POST') {
      options.body = JSON.stringify(data);
    }

    const resp = await fetch(url, options);
    const result = await resp.json();

    if (result.code !== 200) {
      throw new Error(
        `API error [${path}]: code=${result.code}, msg=${result.msg || result.message || JSON.stringify(result)}`,
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
    const result = await this.callApi(
      'auth/userController/loginUser?state=101000004071',
      { token: this.token, state: '101000004071' },
      { Source: SOURCE },
    );
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
}
