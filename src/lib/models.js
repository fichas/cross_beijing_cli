/**
 * Data models — parse API responses into friendly objects,
 * build request payloads, and date helpers.
 *
 * Uses plain objects + helper functions (no classes).
 * Ported from Python model.py.
 */

import { VEHICLE_TYPE_MAP, LICENSE_PLATE_TYPE_MAP } from '../constants.js';

// ── Vehicle ────────────────────────────────────────────

/**
 * Parse a vehicle object from API response.
 */
export function parseVehicle(data) {
  return {
    licenseNumber: data.hphm || '',
    licensePlateType: data.hpzl || '',
    licensePlateTypeName: LICENSE_PLATE_TYPE_MAP[data.hpzl] || data.hpzl || '',
    vehicleType: data.cllx || '',
    vehicleTypeName: VEHICLE_TYPE_MAP[data.cllx] || data.cllx || '',
    engineNumber: data.fdjh || '',
    brand: data.ppxh || '',
    registrationDate: data.zcsj || '',
    vehicleId: data.vId || '',
    // Preserve all fields for round-trip (swap/re-add)
    collectionDate: data.cjsj || null,
    enableStatus: data.qyzt ?? 1,
    registrationChannelKey: data.zcqdKey || null,
    identityNumber: data.sfzmhm || null,
    kz3: data.kz3 || '',
    kz5: data.kz5 || null,
  };
}

/**
 * Convert a friendly vehicle object back to API dict format.
 */
export function vehicleToApiDict(v) {
  const result = {
    hphm: v.licenseNumber || '',
    hpzl: v.licensePlateType || '',
    hpzlmc: LICENSE_PLATE_TYPE_MAP[v.licensePlateType] || v.licensePlateTypeName || '',
    cllx: v.vehicleType || '',
    cllxmc: VEHICLE_TYPE_MAP[v.vehicleType] || v.vehicleTypeName || '',
    fdjh: v.engineNumber || '',
    ppxh: v.brand || '',
    zcsj: v.registrationDate || '',
    kz3: v.kz3 || '',
  };
  // Optional fields (match Python VehicleInfo.to_dict())
  if (v.collectionDate) result.cjsj = v.collectionDate;
  if (v.enableStatus != null) result.qyzt = v.enableStatus;
  if (v.registrationChannelKey) result.zcqdKey = v.registrationChannelKey;
  if (v.identityNumber) result.sfzmhm = v.identityNumber;
  if (v.kz5) result.kz5 = v.kz5;
  if (v.vehicleId) result.vId = v.vehicleId;
  return result;
}

// ── User ───────────────────────────────────────────────

/**
 * Parse user info from API response.
 */
export function parseUserInfo(data) {
  return {
    idNumber: data.jszh || '',
    name: data.jsrxm || '',
  };
}

// ── Record ─────────────────────────────────────────────

/**
 * Parse an apply record from API response.
 */
export function parseRecord(data) {
  return {
    vehicleId: data.vId || '',
    applyId: data.applyId || '',
    statusCode: data.blzt || '',
    statusName: data.blztmc || '',
    validFrom: data.yxqs || '',
    validTo: data.yxqz || '',
    remainingDays: data.sxsyts ?? '',
    entryType: data.jjzzl || '',
    entryTypeName: data.jjzzlmc || '',
    applyTime: data.sqsj || '',
    licenseNumber: data.hphm || '',
  };
}

/**
 * Calculate remaining days from today to record.validTo (inclusive).
 * Matches Python: days_between_dates(today, validTo) = (validTo - today).days + 1
 * Uses pure string-based date math to avoid timezone issues.
 */
export function calcRemainingDays(record) {
  if (!record.validTo) return 0;
  const todayStr = formatDate(new Date());
  return daysBetween(todayStr, record.validTo);
}

/**
 * Calculate days between two YYYY-MM-DD strings (inclusive).
 * Matches Python: (date2 - date1).days + 1
 */
function daysBetween(date1Str, date2Str) {
  const [y1, m1, d1] = date1Str.split('-').map(Number);
  const [y2, m2, d2] = date2Str.split('-').map(Number);
  // Use UTC to avoid DST/timezone issues
  const d1utc = Date.UTC(y1, m1 - 1, d1);
  const d2utc = Date.UTC(y2, m2 - 1, d2);
  const diff = Math.floor((d2utc - d1utc) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
}

// ── State Data ─────────────────────────────────────────

/**
 * Parse the full state data structure from stateList API.
 */
export function parseStateData(data) {
  return {
    idNumber: data.sfzmhm || '',
    vehicles: (data.bzclxx || []).map((v) => ({
      vId: v.vId || '',
      licensePlateType: v.hpzl || '',
      licenseNumber: v.hphm || '',
      usedTimes: v.ybcs ?? 0,
      totalDays: v.bzts ?? 0,
      availableDays: v.kjts ?? 0,
      remainingTimes: String(v.sycs ?? ''),
      remainingDays: String(v.syts ?? ''),
      canApplyType1: !!v.ylzsfkb,
      canApplyType2: !!v.elzsfkb,
      cannotApplyReason: v.bnbzyy || '',
      vehicleType: v.cllx || '',
      records: (v.bzxx || []).map(parseRecord),
      secondaryRecords: (v.ecbzxx || []).map(parseRecord),
    })),
  };
}

/**
 * Get the latest record from a state vehicle.
 * Prefers secondaryRecords over records.
 */
export function getLatestRecord(stateVehicle) {
  const secondary = stateVehicle.secondaryRecords || [];
  if (secondary.length > 0) return secondary[0];
  const records = stateVehicle.records || [];
  if (records.length > 0) return records[0];
  return null;
}

// ── Apply Payload ──────────────────────────────────────

/**
 * Build the payload for submitting a new apply record.
 *
 * @param {object} vehicle - Parsed vehicle object
 * @param {object} userInfo - Parsed user info ({ name, idNumber })
 * @param {string} applyDate - Date string YYYY-MM-DD
 * @param {string} entryType - '六环内' or '六环外'
 * @returns {object} API payload
 */
export function buildApplyPayload(vehicle, userInfo, applyDate, entryType) {
  return {
    sfzj: 1,
    sqdzgdjd: '116.4',
    sqdzgdwd: '39.9',
    zjxxdzgdjd: '116.4',
    zjxxdzgdwd: '39.9',
    zjxxdz: '北京动物园',
    xxdz: '北京动物园',
    jjmdmc: '其它',
    jjmd: '06',
    area: '海淀区',
    jjdq: '006',
    applyIdOld: '',
    jjrq: applyDate,
    jsrxm: userInfo.name,
    jszh: userInfo.idNumber,
    jjzzl: entryType === '六环内' ? '01' : '02',
    txrxx: [],
    hphm: vehicle.licenseNumber,
    hpzl: vehicle.licensePlateType,
    cllx: vehicle.vehicleType,
    vId: vehicle.vehicleId || '',
  };
}

// ── Date Helpers ───────────────────────────────────────

/**
 * Format a Date object as YYYY-MM-DD.
 */
export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Add days to a date string and return a new YYYY-MM-DD string.
 *
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {number} days - Number of days to add
 * @returns {string} New date in YYYY-MM-DD format
 */
export function getFutureDate(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}
