import { getUser, isInitialized, updateUser } from '../lib/config-manager.js';
import { testNotify } from '../lib/notifier.js';
import { output, success, error } from '../output.js';

export function registerNotifyCommand(program) {
  const notify = program.command('notify').description('通知渠道管理');

  notify
    .command('add <url>')
    .description('添加通知渠道')
    .action(async (url) => {
      try {
        if (!isInitialized()) {
          output(error('尚未初始化，请先运行 cross-bj init'));
          process.exitCode = 1;
          return;
        }

        const user = getUser();
        const urls = user.notify_urls || [];

        if (urls.includes(url)) {
          output(success({ notify_urls: urls }, '该通知渠道已存在'));
          return;
        }

        urls.push(url);
        updateUser({ notify_urls: urls });
        output(success({ notify_urls: urls }, `通知渠道已添加: ${url}`));
      } catch (err) {
        output(error(`添加通知渠道失败: ${err.message}`));
        process.exitCode = 1;
      }
    });

  notify
    .command('remove <url>')
    .description('移除通知渠道')
    .action(async (url) => {
      try {
        if (!isInitialized()) {
          output(error('尚未初始化，请先运行 cross-bj init'));
          process.exitCode = 1;
          return;
        }

        const user = getUser();
        const urls = (user.notify_urls || []).filter((u) => u !== url);
        updateUser({ notify_urls: urls });
        output(success({ notify_urls: urls }, `通知渠道已移除: ${url}`));
      } catch (err) {
        output(error(`移除通知渠道失败: ${err.message}`));
        process.exitCode = 1;
      }
    });

  notify
    .command('test')
    .description('发送测试通知')
    .action(async () => {
      try {
        if (!isInitialized()) {
          output(error('尚未初始化，请先运行 cross-bj init'));
          process.exitCode = 1;
          return;
        }

        const user = getUser();
        const urls = user.notify_urls || [];

        if (urls.length === 0) {
          output(error('未配置通知渠道，请先运行 cross-bj notify add <url>'));
          process.exitCode = 1;
          return;
        }

        const results = await testNotify(urls);
        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected').length;

        output(
          success(
            { succeeded, failed, total: urls.length },
            `测试通知已发送: ${succeeded} 成功, ${failed} 失败 (共 ${urls.length} 个渠道)`,
          ),
        );
      } catch (err) {
        output(error(`测试通知失败: ${err.message}`));
        process.exitCode = 1;
      }
    });
}
