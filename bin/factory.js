#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

import { runInit } from '../src/commands/init.js';
import { runDoctor } from '../src/commands/doctor.js';
import { runBuild } from '../src/commands/build.js';
import { runStatus } from '../src/commands/status.js';
import { runLogs } from '../src/commands/logs.js';
import { startMcpServer } from '../src/mcp/server.js';

const program = new Command();

program
  .name('factory')
  .description(
    chalk.bold('🏭 Software Factory') + ' — Give it a GitHub issue. Wake up to a deployed PoC.\n\n' +
    '  Powered by SuperPlane (orchestration) + Render (deployment).\n' +
    '  Every issue becomes: spec → code → tests → deployed preview → PR.\n'
  )
  .version('0.1.9');

program
  .command('init')
  .description('Set up the Software Factory (API keys, canvas, secrets)')
  .option('-y, --yes', 'Non-interactive mode: reads env vars (SUPERPLANE_TOKEN, ANTHROPIC_API_KEY, GITHUB_TOKEN, RENDER_API_KEY)')
  .action((opts) => runInit(opts));

program
  .command('doctor')
  .description('Check that everything is configured correctly')
  .action(runDoctor);

program
  .command('build <issue-url>')
  .description('Trigger the factory pipeline for a GitHub issue')
  .option('-r, --repo <owner/repo>', 'Override target repository')
  .option('-f, --follow', 'Stream live stage-by-stage progress after triggering')
  .option('-w, --watch', 'Alias for --follow')
  .action((issueUrl, opts) => runBuild(issueUrl, opts));

program
  .command('status')
  .description('Show the current pipeline run status')
  .option('-w, --watch', 'Continuously refresh (every 10s)')
  .action((opts) => runStatus(opts));

program
  .command('logs')
  .description('Show execution output for the latest pipeline run')
  .action(runLogs);

program
  .command('mcp')
  .description('Start the MCP server (for AI coding agent integration)')
  .action(startMcpServer);

program.addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.cyan('npx software-factory init')}
  ${chalk.cyan('npx software-factory build https://github.com/superplanehq/superplane/issues/5368 --follow')}
  ${chalk.cyan('npx software-factory status --watch')}
  ${chalk.cyan('npx software-factory mcp')}

${chalk.bold('Pipeline Stages:')}
  1. ${chalk.dim('Fetch Issue')}           → reads GitHub issue title, body, labels
  2. ${chalk.dim('Requirement Agent')}     → writes an implementation spec
  3. ${chalk.dim('Implementation Agent')} → writes code changes, pushes branch
  4. ${chalk.dim('Validation Agent')}      → runs npm test / build / lint
  5. ${chalk.dim('Deploy to Render')}      → deploys preview environment
  6. ${chalk.dim('PR Agent')}              → opens PR + comments preview URL

${chalk.bold('AI Agent Setup (MCP):')}
  Add to your agent config:
  ${chalk.dim('{')}
  ${chalk.dim('  "mcpServers": {')}
  ${chalk.dim('    "software-factory": {')}
  ${chalk.dim('      "command": "npx", "args": ["software-factory", "mcp"]')}
  ${chalk.dim('    }')}
  ${chalk.dim('  }')}
  ${chalk.dim('}')}

${chalk.dim('Config: ~/.factory/config.json')}
${chalk.dim('Canvas: https://app.superplane.com')}
`);

program.parse();
