import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { Command } from 'commander';

// Replace the shell boundary before importing cron; never read or modify real crontab.
const originalExec = childProcess.execSync;
const writes = [];
childProcess.execSync = (command) => {
  if (command === 'crontab -l') return '0 1 * * * unrelated-job\n0 9 * * * /fixture/cross-bj run --json # cross-bj auto renewal\n';
  if (command === 'which cross-bj') return '/fixture/cross-bj\n';
  writes.push(command);
  return '';
};
syncBuiltinESMExports();
const { registerCronCommand } = await import('../src/commands/cron.js');
const { registerRunCommand } = await import('../src/commands/run.js');
after(() => { childProcess.execSync = originalExec; syncBuiltinESMExports(); });

for (const location of ['outside', 'inside']) {
  test(`cron setup produces a valid run command for ${location} and replaces legacy jobs`, async () => {
    writes.length = 0;
    const program = new Command();
    registerCronCommand(program);
    const args = location === 'outside' ? ['cron', 'setup'] : ['cron', 'setup', '--location', location];
    await program.parseAsync(args, { from: 'user' });
    assert.equal(writes.length, 1);
    assert.ok(writes[0].includes('unrelated-job'));
    assert.ok(writes[0].includes(`run --location ${location} >>`));
    assert.ok(!writes[0].includes('--json'));
    assert.equal(writes[0].split('# cross-bj auto renewal').length - 1, 1);
    const runProgram = new Command();
    registerRunCommand(runProgram);
    const run = runProgram.commands.find(command => command.name() === 'run');
    assert.deepEqual(run.parseOptions(['--location', location]).unknown, []);
    assert.equal(run.opts().location, location);
  });
}

test('invalid cron location is rejected before any crontab write', async () => {
  writes.length = 0;
  const program = new Command().exitOverride().configureOutput({ writeErr() {} });
  registerCronCommand(program);
  await assert.rejects(program.parseAsync(['cron', 'setup', '--location', 'invalid'], { from: 'user' }), /invalid/);
  assert.equal(writes.length, 0);
});
