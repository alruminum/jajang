#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';

const program = new Command();
program
  .name('mobile-qa-tour')
  .description('Android QA tooling — monkey + tour')
  .version('0.1.0');

program
  .command('monkey')
  .description('Run adb monkey + crash detection + report')
  .requiredOption('--package <pkg>', 'app package id')
  .option('--events <n>', 'event count', '1000')
  .option('--throttle <ms>', 'ms between events', '200')
  .option('--pct-touch <n>', 'touch event percentage', '60')
  .option('--pct-motion <n>', 'motion event percentage', '20')
  .option('--pct-nav <n>', 'nav event percentage', '10')
  .option('--pct-syskeys <n>', 'syskeys event percentage', '5')
  .option('--pct-anyevent <n>', 'anyevent percentage', '5')
  .option('--output <dir>', 'output dir', './qa-output')
  .option('--seed <n>', 'random seed (default: monkey auto)')
  .action(async (opts) => {
    const { runMonkey } = await import('./monkey/run');
    const { renderMonkeyReport } = await import('./report/monkey-template');
    const { writeReport } = await import('./report/writer');

    const result = await runMonkey({
      appPackage: opts.package,
      events: parseInt(opts.events, 10),
      throttle: parseInt(opts.throttle, 10),
      pcts: {
        touch: parseInt(opts.pctTouch, 10),
        motion: parseInt(opts.pctMotion, 10),
        nav: parseInt(opts.pctNav, 10),
        syskeys: parseInt(opts.pctSyskeys, 10),
        anyevent: parseInt(opts.pctAnyevent, 10),
      },
      output: path.resolve(opts.output),
      seed: opts.seed != null ? parseInt(opts.seed, 10) : undefined,
    });

    const seedNum = opts.seed != null ? parseInt(opts.seed, 10) : undefined;
    const md = renderMonkeyReport({
      appPackage: result.appPackage,
      events: result.events,
      durationMs: result.durationMs,
      crashes: result.crashes,
      screenshotPath: result.screenshotPath,
      generatedAt: new Date().toISOString(),
      seed: seedNum,
    });

    const filename = `${new Date().toISOString().slice(0, 10)}-monkey.md`;
    const written = await writeReport(path.resolve(opts.output), filename, md);
    console.log(`Report written: ${written}`);

    if (result.crashes.length > 0) process.exit(1);
  });

program
  .command('tour')
  .description('Driven screenshot tour (batch 02)')
  .action(() => {
    console.error('tour: not yet implemented (batch 02)');
    process.exit(2);
  });

program
  .command('init')
  .description('Generate qa.config.example.json (batch 02)')
  .action(() => {
    console.error('init: not yet implemented (batch 02)');
    process.exit(2);
  });

if (require.main === module) {
  program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { program };
