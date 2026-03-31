import { login } from '../lib/bjt-login.js';
import { saveConfig, isInitialized } from '../lib/config-manager.js';
import { output, success, error } from '../output.js';

export function registerInitCommand(program) {
  program
    .command('init')
    .description('初始化配置（无参数=交互式，有参数=非交互式）')
    .option('--phone <phone>', '北京通手机号')
    .option('--password <password>', '北京通密码')
    .option('--entry-type <type>', '进京证类型（六环内/六环外）', '六环内')
    .option('--notify <urls...>', '通知渠道URL')
    .option('-f, --force', '强制覆盖已有配置')
    .action(async (options) => {
      try {
        const isInteractive = !(options.phone && options.password);

        // 检查是否已初始化
        if (isInitialized()) {
          if (isInteractive) {
            const { confirm } = await import('@inquirer/prompts');
            const overwrite = await confirm({ message: '已存在配置，是否覆盖？', default: false });
            if (!overwrite) {
              output(success(null, '已取消'));
              return;
            }
          } else if (!options.force) {
            output(error('已存在配置，使用 -f/--force 强制覆盖'));
            process.exitCode = 1;
            return;
          }
        }

        let phone, password, entryType, notifyUrls;

        if (!isInteractive) {
          // Non-interactive mode
          phone = options.phone;
          password = options.password;
          entryType = options.entryType;
          notifyUrls = options.notify || [];
        } else {
          // Interactive mode
          const { input, password: passwordPrompt, select } = await import('@inquirer/prompts');
          phone = await input({ message: '请输入北京通手机号:', validate: (v) => v.length > 0 || '手机号不能为空' });
          password = await passwordPrompt({ message: '请输入北京通密码:', mask: '*', validate: (v) => v.length > 0 || '密码不能为空' });
          entryType = await select({ message: '请选择进京证类型:', choices: [{ value: '六环内' }, { value: '六环外' }], default: '六环内' });
          const notifyInput = await input({ message: '通知渠道URL（多个用逗号分隔，可留空）:' });
          notifyUrls = notifyInput ? notifyInput.split(',').map((u) => u.trim()).filter(Boolean) : [];
        }

        // Validate entry type
        if (entryType !== '六环内' && entryType !== '六环外') {
          output(error(`无效的进京证类型: ${entryType}，必须是 六环内 或 六环外`));
          process.exitCode = 1;
          return;
        }

        // Login to get token
        output(success(null, '正在登录北京通...'));
        const token = await login(phone, password);

        const config = {
          users: [
            {
              name: '',
              auth: token,
              bjt_phone: phone,
              bjt_pwd: password,
              entry_type: entryType,
              notify_urls: notifyUrls,
              preferred_vehicle: '',
            },
          ],
        };

        saveConfig(config);
        output(success({ phone, entryType }, '初始化成功！配置已保存。'));
      } catch (err) {
        output(error(`初始化失败: ${err.message}`));
        process.exitCode = 1;
      }
    });
}
