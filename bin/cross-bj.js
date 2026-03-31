#!/usr/bin/env node

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

import { program } from 'commander';

program
  .name('cross-bj')
  .description('进京证 CLI 工具 - 办理/续签进京证、管理车辆、配置通知')
  .version(version);

// Import and register all commands
import { registerInitCommand } from '../src/commands/init.js';
import { registerStatusCommand } from '../src/commands/status.js';
import { registerRunCommand } from '../src/commands/run.js';
import { registerVehicleCommand } from '../src/commands/vehicle.js';
import { registerNotifyCommand } from '../src/commands/notify.js';
import { registerSetCommand } from '../src/commands/set.js';
import { registerCronCommand } from '../src/commands/cron.js';

registerInitCommand(program);
registerStatusCommand(program);
registerRunCommand(program);
registerVehicleCommand(program);
registerNotifyCommand(program);
registerSetCommand(program);
registerCronCommand(program);

// Default action (no subcommand) = run
program.action(async () => {
  const { runCommand } = await import('../src/commands/run.js');
  await runCommand();
});

program.parse();
