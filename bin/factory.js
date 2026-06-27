#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

import { runInit } from '../src/commands/init.js';
import { runDoctor } from '../src/commands/doctor.js';
import { runBuild } from '../src/commands/build.js';
import { runStatus } from '../src/commands/status.js';
import { runLogs } from '../src/commands/logs.js';

const program = new Command();

program
  .name('factory')
  .description(chalk.bold('🏭 Software Factory') + ' — Give it a GitHub issue. Wake up to a deployed PoC.\n\n' +
    '  Powered by SuperPlane (orchestration) + Render (deployment).\n' +
    '  Every issue becomes a spec → implementation → validated → deployed pull request.\n')
  .version('0.1.2');

program
  .command('init')
  .description('Set up the Software Factory (API keys, canvas, secrets)')
  .option('-y, --yes', 'Non-interactive: use env vars (SUPERPLANE_TOKEN, ANTHROPIC_API_KEY, GITHUB_TOKEN, RENDER_API_KEY)')
  .action((opts) => runInit(opts));

program
  .command('doctor')
  .description('Check that everything is configured correctly')
  .action(runDoctor);

program
  .command('build <issue-url>')
  .description('Trigger the factory pipeline for a GitHub issue')
  .option('-r, --repo <owner/repo>', 'Override target repository')
  .action((issueUrl, opts) => runBuild(issueUrl, opts));

program
  .command('status')
  .description('Show the current pipeline run status')
  .option('-w, --watch', 'Continuously refresh status')
  .action((opts) => runStatus(opts));

program
  .command('logs')
  .description('Show execution logs for the latest pipeline run')
  .action(runLogs);

program.addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.cyan('npx software-factory init')}
  ${chalk.cyan('npx software-factory doctor')}
  ${chalk.cyan('npx software-factory build https://github.com/org/repo/issues/42')}
  ${chalk.cyan('npx software-factory status --watch')}
  ${chalk.cyan('npx software-factory logs')}

${chalk.bold('Pipeline Stages:')}
  1. ${chalk.dim('Fetch Issue')}           → reads GitHub issue title, body, labels
  2. ${chalk.dim('Requirement Agent')}     → Claude generates a detailed spec
  3. ${chalk.dim('Implementation Agent')} → Claude writes the code changes
  4. ${chalk.dim('Validation Agent')}      → runs npm test / build / lint
  5. ${chalk.dim('Deploy to Render')}      → deploys preview environment
  6. ${chalk.dim('PR Agent')}              → creates PR + comments preview URL

${chalk.dim('Config stored at: ~/.factory/config.json')}
${chalk.dim('SuperPlane canvas: https://app.superplane.com')}
`);

program.parse();
