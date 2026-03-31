import { isInitialized, updateUser } from '../lib/config-manager.js';
import { output, success, error } from '../output.js';

const VALID_KEYS = {
  'entry-type': {
    configKey: 'entry_type',
    validValues: ['六环内', '六环外'],
    description: '进京证类型',
  },
};

export function registerSetCommand(program) {
  program
    .command('set <key> <value>')
    .description('修改配置项（支持: entry-type）')
    .action(async (key, value) => {
      try {
        if (!isInitialized()) {
          output(error('尚未初始化，请先运行 cross-bj init'));
          process.exitCode = 1;
          return;
        }

        const keyDef = VALID_KEYS[key];
        if (!keyDef) {
          const validKeys = Object.keys(VALID_KEYS).join(', ');
          output(error(`不支持的配置项: ${key}，支持的配置项: ${validKeys}`));
          process.exitCode = 1;
          return;
        }

        if (!keyDef.validValues.includes(value)) {
          output(error(`无效的值: ${value}，${keyDef.description}必须是: ${keyDef.validValues.join(' 或 ')}`));
          process.exitCode = 1;
          return;
        }

        updateUser({ [keyDef.configKey]: value });
        output(success({ key, value }, `${keyDef.description}已设置为: ${value}`));
      } catch (err) {
        output(error(`设置失败: ${err.message}`));
        process.exitCode = 1;
      }
    });
}
