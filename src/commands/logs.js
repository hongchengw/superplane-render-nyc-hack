import chalk from 'chalk';
import { SuperPlaneClient } from '../superplane/client.js';
import { requireConfig } from '../config.js';

const NODE_ORDER = [
  'start', 'fetch-issue', 'requirement-agent', 'implementation-agent',
  'validation-agent', 'render-deploy', 'create-pr', 'pr-comment', 'pr-agent',
];

const NODE_LABELS = {
  'start': 'Start',
  'fetch-issue': 'Fetch Issue',
  'requirement-agent': 'Requirement Agent',
  'implementation-agent': 'Implementation Agent',
  'validation-agent': 'Validation Agent',
  'render-deploy': 'Deploy to Render',
  'create-pr': 'Create PR',
  'pr-comment': 'Post Preview URL',
  'pr-agent': 'PR Agent',
};

const NODE_COLORS = [chalk.cyan, chalk.magenta, chalk.yellow, chalk.blue, chalk.green, chalk.red, chalk.white];

export async function runLogs(options = {}) {
  const config = requireConfig(['superplaneApiKey', 'canvasId']);
  const client = new SuperPlaneClient(config.superplaneApiKey);

  console.log(chalk.bold.cyan('\n🏭 Software Factory — Execution Logs\n'));

  const { runs } = await client.listRuns(config.canvasId);
  if (!runs || runs.length === 0) {
    console.log(chalk.dim('No runs yet. Start with: factory build <issue-url>'));
    return;
  }

  const run = runs[0];
  console.log(chalk.dim(`Run: ${run.id} | State: ${run.state}\n`));

  for (let i = 0; i < NODE_ORDER.length; i++) {
    const nodeId = NODE_ORDER[i];
    const label = NODE_LABELS[nodeId] || nodeId;
    const color = NODE_COLORS[i % NODE_COLORS.length];

    try {
      const { executions } = await client.listNodeExecutions(config.canvasId, nodeId);
      if (!executions || executions.length === 0) continue;

      const ex = executions[0];
      console.log(color.bold(`┌─ ${label} `), chalk.dim(`[${ex.state}]`));

      if (ex.outputs) {
        const outputs = ex.outputs;
        // Show key outputs
        const data = outputs.data;
        if (Array.isArray(data) && data.length > 0) {
          const result = data[0]?.result;
          if (result) {
            const lines = JSON.stringify(result, null, 2).split('\n').slice(0, 20);
            for (const line of lines) {
              console.log(color('│  ') + chalk.dim(line));
            }
          }
        }
      }

      if (ex.resultMessage) {
        console.log(color('│  ') + (ex.result === 'RESULT_FAILED' ? chalk.red : chalk.green)(ex.resultMessage));
      }

      console.log(color('└─'));
      console.log();
    } catch (_) {
      // Node hasn't run yet, skip
    }
  }

  console.log(chalk.dim(`Canvas: https://app.superplane.com/canvases/${config.canvasId}`));
}
