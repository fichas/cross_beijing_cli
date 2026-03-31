import { getUser, isInitialized } from '../lib/config-manager.js';
import { ApiManager } from '../lib/api-manager.js';
import { API_BASE_URL } from '../constants.js';
import { parseStateData, getLatestRecord, calcRemainingDays, formatDate, getFutureDate } from '../lib/models.js';
import { notify } from '../lib/notifier.js';
import { output, success, error } from '../output.js';

export function registerStatusCommand(program) {
  program
    .command('status')
    .description('查看进京证状态')
    .option('-v, --verbose', '显示详细配置信息')
    .option('-n, --notify', '将状态通过通知渠道发送')
    .option('--plate <plate>', '指定车牌号（默认使用首选车辆）')
    .action(async (options) => {
      try {
        if (!isInitialized()) {
          output(error('尚未初始化，请先运行 cross-bj init'));
          process.exitCode = 1;
          return;
        }

        const user = getUser();
        const baseUrl = API_BASE_URL;
        const api = new ApiManager(baseUrl, user.auth);

        const rawState = await api.getStateData();
        const state = parseStateData(rawState);

        if (!state.vehicles || state.vehicles.length === 0) {
          output(success({ state }, '未找到绑定车辆'));
          return;
        }

        // 选车：--plate 指定 > 首选车辆 > 第一辆
        const targetPlate = options.plate || user.preferred_vehicle;
        const vehicle = (targetPlate && state.vehicles.find((v) => v.licenseNumber === targetPlate))
          || state.vehicles[0];
        const record = getLatestRecord(vehicle);
        const remaining = record ? calcRemainingDays(record) : 0;

        // 判断是否需要续签（和 Python 版逻辑一致）
        const ACTIVE_STATUSES = ['审核通过(生效中)', '审核中', '审核通过(待生效)'];
        const quotaExhausted = String(vehicle.remainingTimes) === '0' && String(vehicle.remainingDays) === '0';
        let needRenew;
        if (!record) {
          needRenew = true;
        } else if (ACTIVE_STATUSES.includes(record.statusName)) {
          needRenew = record.statusName === '审核通过(生效中)' && remaining <= 1;
        } else {
          needRenew = true; // 已失效、审核失败等
        }

        // 统一构建消息（终端和通知共用，格式与 Python 版一致）
        const startDate = record ? record.validFrom : '';
        const endDate = record ? (record.validTo || getFutureDate(record.validFrom, 6)) : '';
        let msg;
        if (quotaExhausted && needRenew) {
          msg = '无法续签（剩余次数和天数已用完）';
        } else {
          msg = needRenew ? '需要续签' : '无需续签';
        }
        const now = new Date();
        const formattedTime = `${formatDate(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

        const title = record
          ? `进京证${msg}: ${startDate.substring(5)}~${endDate.substring(5)}`
          : '进京证: 无记录';

        let body = `${msg}\n`;
        body += `车牌: ${vehicle.licenseNumber}\n`;
        body += `状态: ${record ? record.statusName : '无记录'}\n`;
        if (record) {
          body += `有效期: ${startDate}至${endDate}\n`;
          body += `剩余天数: ${remaining}\n`;
          body += `类型: ${record.entryTypeName || ''}\n`;
          body += `申请时间: ${record.applyTime || ''}\n`;
        }
        body += `执行时间: ${formattedTime}\n`;
        body += `剩余申请次数: ${vehicle.remainingTimes}\n`;

        if (options.verbose) {
          const maskedPhone = user.bjt_phone
            ? user.bjt_phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
            : '未设置';
          body += `\n--- 配置信息 ---\n`;
          body += `手机号: ${maskedPhone}\n`;
          body += `进京证类型: ${user.entry_type || '六环内'}\n`;
          body += `通知渠道数: ${(user.notify_urls || []).length}\n`;
          body += `首选车辆: ${user.preferred_vehicle || '未设置'}\n`;
        }

        // 通知
        if (options.notify && user.notify_urls && user.notify_urls.length > 0) {
          await notify(user.notify_urls, title, body);
        }

        output(success({ state, record, needRenew }, `${title}\n${body}`));
      } catch (err) {
        output(error(`查询状态失败: ${err.message}`));
        process.exitCode = 1;
      }
    });
}
