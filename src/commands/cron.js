import { execSync } from 'node:child_process';
import { output, success, error } from '../output.js';

const MARKER = '# cross-bj auto renewal';
const SCHEDULE = '0 9 * * *';

function getCurrentCrontab() {
  try {
    return execSync('crontab -l', { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

function getBinPath() {
  try {
    return execSync('which cross-bj', { encoding: 'utf-8' }).trim();
  } catch {
    return 'cross-bj';
  }
}

export function registerCronCommand(program) {
  const cron = program.command('cron').description('定时任务管理');

  cron
    .command('setup')
    .description('设置自动续签定时任务（默认每天 9:00）')
    .option('--schedule <cron>', 'cron 表达式（如 "0 8 * * *"）', SCHEDULE)
    .action(async (options) => {
      try {
        let current = getCurrentCrontab();

        // 如果已存在，先移除旧的再写入新的
        if (current.includes(MARKER)) {
          current = current.split('\n').filter((l) => !l.includes(MARKER)).join('\n');
        }

        const binPath = getBinPath();
        const schedule = options.schedule;
        const cronLine = `${schedule} ${binPath} run --json >> /tmp/cross-bj.log 2>&1 ${MARKER}`;
        const newCrontab = current.trimEnd() + (current.trim() ? '\n' : '') + cronLine + '\n';
        const escapedCrontab = newCrontab.replace(/'/g, "'\\''");

        execSync(`printf '%s' '${escapedCrontab}' | crontab -`, { encoding: 'utf-8' });
        output(success({ schedule, command: cronLine }, `定时任务已设置: ${schedule}`));
      } catch (err) {
        output(error(`设置定时任务失败: ${err.message}`));
        process.exitCode = 1;
      }
    });

  cron
    .command('remove')
    .description('移除自动续签定时任务')
    .action(async () => {
      try {
        const current = getCurrentCrontab();

        if (!current.includes(MARKER)) {
          output(success(null, '未找到 cross-bj 定时任务'));
          return;
        }

        const filtered = current
          .split('\n')
          .filter((line) => !line.includes(MARKER))
          .join('\n');

        const escapedCrontab = filtered.replace(/'/g, "'\\''");
        execSync(`printf '%s' '${escapedCrontab}' | crontab -`, { encoding: 'utf-8' });
        output(success(null, '定时任务已移除'));
      } catch (err) {
        output(error(`移除定时任务失败: ${err.message}`));
        process.exitCode = 1;
      }
    });

  cron
    .command('status')
    .description('查看定时任务状态')
    .action(async () => {
      try {
        const current = getCurrentCrontab();
        const exists = current.includes(MARKER);

        if (exists) {
          const line = current.split('\n').find((l) => l.includes(MARKER));
          output(success({ active: true, line }, `定时任务已启用: ${line}`));
        } else {
          output(success({ active: false }, '定时任务未设置'));
        }
      } catch (err) {
        output(error(`查询定时任务状态失败: ${err.message}`));
        process.exitCode = 1;
      }
    });
}
