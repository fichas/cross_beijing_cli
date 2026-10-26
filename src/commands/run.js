import { getUser, isInitialized } from '../lib/config-manager.js';
import { ApiManager } from '../lib/api-manager.js';
import { API_BASE_URL } from '../constants.js';
import {
  parseStateData, getLatestRecord, calcRemainingDays,
  parseVehicle, parseUserInfo, buildApplyPayload,
  formatDate, getFutureDate,
} from '../lib/models.js';
import { notify } from '../lib/notifier.js';
import { output, success, error } from '../output.js';
import { validateApplyDate } from '../lib/trip-profile.js';

const ACTIVE_STATUSES = ['审核通过(生效中)', '审核中', '审核通过(待生效)'];

function needApply(record) {
  if (!record) return formatDate(new Date());
  const status = record.statusName;
  const remaining = calcRemainingDays(record);
  if (ACTIVE_STATUSES.includes(status)) {
    if (status === '审核通过(生效中)' && remaining <= 1) {
      return getFutureDate(formatDate(new Date()), 1);
    }
    return null;
  }
  return formatDate(new Date());
}

function selectVehicle(state, preferredPlate) {
  const vehicles = state.vehicles || [];
  if (vehicles.length === 0) return null;
  for (const v of vehicles) {
    const record = getLatestRecord(v);
    if (record && ACTIVE_STATUSES.includes(record.statusName)) return v;
  }
  if (preferredPlate) {
    const preferred = vehicles.find((v) => v.licenseNumber === preferredPlate);
    if (preferred) return preferred;
  }
  return vehicles[0];
}

export async function applyPermit(api, user, plate, entryTypeOverride, { date, location = 'outside', purpose, dryRun = false } = {}) {
  if (date !== undefined) validateApplyDate(date);
  const rawState = await api.getStateData();
  const state = parseStateData(rawState);
  const targetPlate = plate || user.preferred_vehicle;
  const vehicle = plate
    ? (state.vehicles || []).find((v) => v.licenseNumber === plate) || null
    : selectVehicle(state, targetPlate);
  if (!vehicle) {
    return { applied: false, message: '未找到绑定车辆', record: null, vehicle: null };
  }
  const record = getLatestRecord(vehicle);
  const entryType = entryTypeOverride || user.entry_type || '六环内';
  const quotaExhausted = entryType === '六环内' && String(vehicle.remainingTimes) === '0' && String(vehicle.remainingDays) === '0';
  if (quotaExhausted) {
    return { applied: false, message: `无法续签（剩余次数和天数已用完）- ${vehicle.licenseNumber}`, record, vehicle };
  }
  const suggestedDate = needApply(record);
  if (!suggestedDate) {
    const remaining = record ? calcRemainingDays(record) : 0;
    return { applied: false, message: `无需续签 - ${vehicle.licenseNumber} 当前状态: ${record?.statusName}，剩余 ${remaining} 天`, record, vehicle };
  }
  const applyDate = date ?? suggestedDate;
  const rawVehicles = await api.listVehicles();
  const fullVehicle = rawVehicles.map(parseVehicle).find((v) => v.licenseNumber === vehicle.licenseNumber);
  if (!fullVehicle) {
    return { applied: false, message: `未找到车辆详细信息: ${vehicle.licenseNumber}`, record, vehicle };
  }
  const rawUserInfo = await api.getUserInfo();
  const userInfo = parseUserInfo(rawUserInfo);
  let tripDefaults = user.trip_defaults;
  if (purpose !== undefined) {
    const result = await api.callApi('pro/ucDicController/queryDic', { type: 'jjmd' });
    const selected = Array.isArray(result.data) ? result.data.find((item) => item.zdbm === purpose) : null;
    if (!selected) throw new Error('进京目的代码不在官方字典中');
    tripDefaults = { ...tripDefaults, purpose: { code: selected.zdbm, name: selected.zdz } };
  }
  const payload = buildApplyPayload(fullVehicle, userInfo, applyDate, entryType, tripDefaults, location);
  const eligibility = await api.checkHandle(vehicle, entryType);
  if (!Array.isArray(eligibility?.jjrqs) || !eligibility.jjrqs.includes(applyDate)) {
    throw new Error(`申请日期 ${applyDate} 不在服务端允许的日期范围内`);
  }
  if (dryRun) {
    return {
      applied: false, dryRun: true, message: '仅预览，未提交申请', applyDate,
      preview: {
        plate: vehicle.licenseNumber, entryType, location,
        destination: `${payload.area} ${payload.xxdz}`,
        addressOrRoad: location === 'inside' ? payload.zjxxdz : payload.jjlkmc,
        purpose: payload.jjmdmc,
      },
    };
  }
  await api.submitApply(payload);
  return { applied: true, message: `已提交续签申请 - ${vehicle.licenseNumber} 申请日期: ${applyDate} 类型: ${entryType}`, record, vehicle, applyDate };
}

/**
 * Complete flow: apply + status + notify.
 * Matches Python cross_bj.py exec() logic and notification format.
 */
export async function runCommand({ plate, entryType, noNotify, date, location = 'outside', purpose, dryRun } = {}) {
  noNotify ||= dryRun;
  try {
    if (!isInitialized()) {
      output(error('尚未初始化，请先运行 cross-bj init'));
      process.exitCode = 1;
      return;
    }

    const user = getUser();
    const baseUrl = API_BASE_URL;
    const api = new ApiManager(baseUrl, user.auth);

    // Step 1: Apply
    const applyResult = await applyPermit(api, user, plate, entryType, { date, location, purpose, dryRun });
    if (applyResult.dryRun) {
      const p = applyResult.preview;
      const previewText = [
        applyResult.message,
        `车牌: ${p.plate}`,
        `申请日期: ${applyResult.applyDate}`,
        `类型: ${p.entryType}`,
        `是否在京: ${p.location === 'inside' ? '在京' : '不在京'}`,
        `地址/道路: ${p.addressOrRoad}`,
        `目的地: ${p.destination}`,
        `进京目的: ${p.purpose}`,
      ].join('\n');
      output(success({ apply: applyResult }, previewText));
      return;
    }
    let msg;
    if (!applyResult.applied) {
      msg = '无需续签';
    } else {
      msg = '已提交申请';
    }

    // A successful submission is not proof of approval; query the server again.
    let record = applyResult.record;
    let vehicle = applyResult.vehicle;
    if (applyResult.applied) {
      try {
        const latest = parseStateData(await api.getStateData());
        vehicle = latest.vehicles.find((v) => v.licenseNumber === vehicle.licenseNumber);
        record = vehicle ? getLatestRecord(vehicle) : null;
        applyResult.vehicle = vehicle;
        applyResult.record = record;
      } catch {
        output(success({ apply: { applied: true, applyDate: applyResult.applyDate } }, '申请已提交，但状态复查失败；请先查询状态，不要重复提交'));
        return;
      }
    }

    if (!record || !vehicle) {
      if (!noNotify) {
        const urls = user.notify_urls || [];
        if (urls.length > 0) {
          await notify(urls, '进京证', `${msg}\n无法获取状态信息`);
        }
      }
      output(success({ apply: applyResult }, `${msg}\n无法获取状态信息`));
      return;
    }

    // Build notification — match Python exec() format exactly
    const startDate = record.validFrom;
    const endDate = record.validTo || getFutureDate(record.validFrom, 6);
    const statusText = record.statusName;
    const applyType = record.entryTypeName;
    const applyDate = record.applyTime;
    const remainingDays = calcRemainingDays(record);
    const remainingTimes = vehicle.remainingTimes;
    const now = new Date();
    const formattedTime = `${formatDate(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const title = `进京证${msg}: ${startDate.substring(5)}~${endDate.substring(5)}`;

    let body = `${msg}\n`;
    body += `状态: ${statusText}\n`;
    body += `有效期: ${startDate}至${endDate}\n`;
    body += `剩余天数: ${remainingDays}\n`;
    body += `类型: ${applyType}\n`;
    body += `申请时间: ${applyDate}\n`;
    body += `执行时间: ${formattedTime}\n`;
    body += `剩余申请次数: ${remainingTimes}\n`;

    // Step 3: Notify (unless --no-notify)
    if (!noNotify) {
      const urls = user.notify_urls || [];
      if (urls.length > 0) {
        await notify(urls, title, body);
      }
    }

    // Step 4: Output
    output(success({ apply: applyResult }, `${title}\n${body}`));
  } catch (err) {
    try {
      const user = getUser();
      const urls = user?.notify_urls || [];
      if (!noNotify && urls.length > 0) {
        await notify(urls, '进京证续签失败', `续签执行失败: ${err.message}`);
      }
    } catch {
      // ignore notification errors
    }
    output(error(`运行失败: ${err.message}`));
    process.exitCode = 1;
  }
}

export function registerRunCommand(program) {
  program
    .command('run')
    .description('续签进京证（检查→申请→通知）')
    .option('--plate <plate>', '指定车牌号（默认使用首选车辆）')
    .option('--entry-type <type>', '进京证类型: 六环内/六环外（默认使用配置值）')
    .option('--date <YYYY-MM-DD>', '指定申请日期（以服务端允许日期为准）')
    .option('--location <inside|outside>', '本次是否在京，默认 outside（不在京）')
    .option('--purpose <code>', '本次进京目的代码，按官方字典校验，不覆盖默认值')
    .option('--dry-run', '仅校验并预览，不提交申请或发送通知')
    .option('--no-notify', '不发送通知')
    .action(async (options) => {
      await runCommand({
        plate: options.plate,
        entryType: options.entryType,
        noNotify: options.notify === false,
        date: options.date,
        location: options.location,
        purpose: options.purpose,
        dryRun: options.dryRun,
      });
    });
}
