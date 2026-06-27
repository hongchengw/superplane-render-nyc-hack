import chalk from 'chalk';
import { SuperPlaneClient } from '../superplane/client.js';
import { requireConfig } from '../config.js';

const STATE_ICONS = {
  STATE_STARTED: chalk.blue('⟳'),
  STATE_FINISHED: chalk.green('✔'),
  STATE_UNKNOWN: chalk.dim('·'),
};

const RESULT_COLORS = {
  RESULT_PASSED: chalk.green,
  RESULT_FAILED: chalk.red,
  RESULT_CANCELLED: chalk.yellow,
  RESULT_UNKNOWN: chalk.dim,
};

const NODE_LABELS = {
  'start': 'Start Trigger',
  'fetch-issue': 'Fetch Issue',
  'requirement-agent': 'Requirement Agent',
  'implementation-agent': 'Implementation Agent',
  'validation-agent': 'Validation Agent',
  'render-deploy': 'Deploy to Render',
  'create-pr': 'Create Pull Request',
  'pr-comment': 'Post Preview URL',
  'pr-agent': 'Create PR & Comment',
};

function formatDuration(start, end) {
  const ms = new Date(end || Date.now()) - new Date(start);
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export async function runStatus(options = {}) {
  const config = requireConfig(['superplaneApiKey', 'canvasId']);
  const client = new SuperPlaneClient(config.superplaneApiKey);

  console.log(chalk.bold.cyan('\n🏭 Software Factory — Pipeline Status\n'));
  console.log(chalk.dim(`Canvas: ${config.canvasId}`));
  if (config.lastIssueUrl) console.log(chalk.dim(`Issue:  ${config.lastIssueUrl}`));
  console.log();

  try {
    const { runs } = await client.listRuns(config.canvasId);

    if (!runs || runs.length === 0) {
      console.log(chalk.dim('No runs yet. Start with: factory build <issue-url>'));
      return;
    }

    const run = runs[0]; // Latest run
    const stateColor = run.result === 'RESULT_PASSED'
      ? chalk.green
      : run.result === 'RESULT_FAILED'
        ? chalk.red
        : chalk.blue;

    console.log(`Run ID:   ${chalk.dim(run.id)}`);
    console.log(`State:    ${stateColor(run.state)}`);
    if (run.result !== 'RESULT_UNKNOWN') {
      console.log(`Result:   ${(RESULT_COLORS[run.result] || chalk.dim)(run.result)}`);
    }
    console.log(`Started:  ${new Date(run.createdAt).toLocaleString()}`);
    if (run.finishedAt) {
      console.log(`Duration: ${formatDuration(run.createdAt, run.finishedAt)}`);
    }
    console.log();

    if (run.executions && run.executions.length > 0) {
      console.log(chalk.bold('Stages:'));
      const order = [
        'start', 'fetch-issue', 'requirement-agent', 'implementation-agent',
        'validation-agent', 'render-deploy', 'create-pr', 'pr-comment', 'pr-agent',
      ];

      const byNode = {};
      for (const ex of run.executions) byNode[ex.nodeId] = ex;

      for (const nodeId of order) {
        const ex = byNode[nodeId];
        if (!ex) continue;

        const icon = STATE_ICONS[ex.state] || chalk.dim('·');
        const label = NODE_LABELS[nodeId] || nodeId;
        const result = ex.result !== 'RESULT_UNKNOWN'
          ? (RESULT_COLORS[ex.result] || chalk.dim)(` (${ex.result.replace('RESULT_', '').toLowerCase()})`)
          : '';
        const duration = ex.createdAt
          ? chalk.dim(` ${formatDuration(ex.createdAt, ex.updatedAt)}`)
          : '';

        console.log(`  ${icon} ${label.padEnd(28)}${result}${duration}`);

        if (ex.resultMessage && ex.result === 'RESULT_FAILED') {
          console.log(chalk.red(`    ↳ ${ex.resultMessage}`));
        }
      }
      console.log();
    }

    const canvasUrl = `https://app.superplane.com/canvases/${config.canvasId}`;
    console.log(chalk.dim(`View live: ${canvasUrl}`));

    if (options.watch) {
      console.log(chalk.dim('\nRefreshing in 10s... (Ctrl+C to stop)'));
      await new Promise(r => setTimeout(r, 10000));
      process.stdout.write('\x1B[2J\x1B[0f'); // clear screen
      return runStatus(options);
    }

  } catch (e) {
    console.error(chalk.red('Error fetching status: ' + e.message));
    process.exit(1);
  }
}
