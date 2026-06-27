import chalk from 'chalk';
import ora from 'ora';
import { SuperPlaneClient } from '../superplane/client.js';
import { requireConfig, loadConfig, saveConfig } from '../config.js';

function parseIssueUrl(input) {
  const urlMatch = input.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
  if (urlMatch) return { repo: urlMatch[1], issueNumber: parseInt(urlMatch[2]), url: input };

  const shortMatch = input.match(/^([^/]+\/[^/]+)#(\d+)$/);
  if (shortMatch) {
    return {
      repo: shortMatch[1],
      issueNumber: parseInt(shortMatch[2]),
      url: `https://github.com/${shortMatch[1]}/issues/${shortMatch[2]}`,
    };
  }
  return null;
}

const STAGE_ORDER = [
  'start', 'fetch-issue', 'requirement-agent', 'implementation-agent',
  'validation-agent', 'render-deploy', 'pr-agent', 'create-pr', 'pr-comment',
];

const STAGE_LABELS = {
  'start':                 'Start',
  'fetch-issue':           'Fetch Issue',
  'requirement-agent':     'Requirement Agent',
  'implementation-agent':  'Implementation Agent',
  'validation-agent':      'Validation Agent',
  'render-deploy':         'Deploy to Render',
  'pr-agent':              'PR + Comment',
  'create-pr':             'Create Pull Request',
  'pr-comment':            'Post Preview URL',
};

const STAGE_DESCRIPTIONS = {
  'fetch-issue':           'reading GitHub issue title, body, labels…',
  'requirement-agent':     'Claude is writing the implementation spec…',
  'implementation-agent':  'Claude is writing code, pushing branch…',
  'validation-agent':      'running npm install, lint, test…',
  'render-deploy':         'deploying preview to Render…',
  'pr-agent':              'opening PR and commenting preview URL…',
};

function fmtDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function extractResultField(runs, nodeId, field) {
  if (!runs?.length) return null;
  const run = runs[0];
  const execs = run.executions || [];
  const exec = execs.find(e => e.nodeId === nodeId);
  return exec?.result?.[field] ?? null;
}

function renderProgress(runs) {
  if (!runs?.length) return;
  const run = runs[0];
  const execs = run.executions || [];
  const byNode = {};
  for (const ex of execs) byNode[ex.nodeId] = ex;

  let previewUrl = null;
  let prUrl = null;

  process.stdout.write('\n');
  for (const nodeId of STAGE_ORDER) {
    const ex = byNode[nodeId];
    if (!ex) continue;

    const label = STAGE_LABELS[nodeId] || nodeId;
    let icon, statusText;

    if (ex.state === 'STATE_FINISHED') {
      if (ex.result === 'RESULT_PASSED') {
        icon = chalk.green('✔');
        const dur = ex.createdAt && ex.updatedAt
          ? chalk.dim(` (${fmtDuration(new Date(ex.updatedAt) - new Date(ex.createdAt))})`)
          : '';
        statusText = chalk.green('passed') + dur;
      } else {
        icon = chalk.red('✘');
        statusText = chalk.red(ex.result?.replace('RESULT_', '').toLowerCase() || 'failed');
        if (ex.resultMessage) statusText += chalk.dim(` — ${ex.resultMessage.slice(0, 80)}`);
      }
    } else if (ex.state === 'STATE_STARTED') {
      icon = chalk.blue('⟳');
      const desc = STAGE_DESCRIPTIONS[nodeId] || '';
      const elapsed = ex.createdAt
        ? chalk.dim(` (${fmtDuration(Date.now() - new Date(ex.createdAt))})`)
        : '';
      statusText = chalk.blue('running') + elapsed + (desc ? chalk.dim(' · ' + desc) : '');
    } else {
      icon = chalk.dim('·');
      statusText = chalk.dim('queued');
    }

    console.log(`  ${icon} ${label.padEnd(26)} ${statusText}`);

    // Extract URLs from results
    if (nodeId === 'render-deploy' && ex.result === 'RESULT_PASSED') {
      previewUrl = ex.resultData?.preview_url || null;
    }
    if ((nodeId === 'pr-agent' || nodeId === 'create-pr') && ex.result === 'RESULT_PASSED') {
      prUrl = ex.resultData?.pr_url || ex.resultData?.html_url || null;
    }
  }

  const overall = run.result;
  if (overall === 'RESULT_PASSED' || overall === 'RESULT_FAILED') {
    process.stdout.write('\n');
    if (previewUrl) console.log(chalk.bold.green(`  🚀 Preview: ${previewUrl}`));
    if (prUrl) console.log(chalk.bold.cyan(`  🔀 PR:      ${prUrl}`));
  }
}

export async function runBuild(issueInput, options = {}) {
  const config = requireConfig(['superplaneApiKey', 'canvasId']);
  const client = new SuperPlaneClient(config.superplaneApiKey);

  const parsed = parseIssueUrl(issueInput);
  if (!parsed) {
    console.error(chalk.red(`Invalid issue URL: ${issueInput}`));
    console.error(chalk.dim('  Expected: https://github.com/owner/repo/issues/123  or  owner/repo#123'));
    process.exit(1);
  }

  const repo = options.repo || config.targetRepo || parsed.repo;

  console.log(chalk.bold.cyan('\n🏭 Software Factory — Starting Pipeline\n'));
  console.log(`  Issue:  ${chalk.cyan(parsed.url)}`);
  console.log(`  Repo:   ${chalk.cyan(repo)}`);
  console.log(`  Canvas: ${chalk.dim(config.canvasId.slice(0, 8) + '...')}`);
  console.log();

  const spinner = ora('Triggering SuperPlane pipeline…').start();

  try {
    const result = await client.triggerCanvas(
      config.canvasId,
      config.canvasTriggerNodeId || 'start',
      { issue_url: parsed.url, repo },
      config.canvasTemplateName || 'Build Issue',
    );

    const eventId = result.result?.event_id;
    spinner.succeed(chalk.green('Pipeline triggered!'));

    const updated = { ...config, lastEventId: eventId, lastIssueUrl: parsed.url, lastRepo: repo };
    saveConfig(updated);

    console.log();
    console.log(chalk.bold('Pipeline stages:'));
    console.log(`  ${chalk.dim('1.')} Fetch Issue           reading GitHub issue`);
    console.log(`  ${chalk.dim('2.')} Requirement Agent     Claude writes spec`);
    console.log(`  ${chalk.dim('3.')} Implementation Agent  Claude writes & pushes code`);
    console.log(`  ${chalk.dim('4.')} Validation Agent      npm test / build`);
    console.log(`  ${chalk.dim('5.')} Deploy to Render      preview environment`);
    console.log(`  ${chalk.dim('6.')} PR Agent              PR + issue comment`);
    console.log();

    if (options.watch || options.follow) {
      console.log(chalk.dim('Following pipeline… (Ctrl+C to detach)\n'));
      await followPipeline(client, config.canvasId);
    } else {
      console.log(chalk.dim('Monitor progress:'));
      console.log(`  ${chalk.cyan('factory status --watch')}   live stage updates`);
      console.log(`  ${chalk.cyan('factory logs')}             execution output`);
      console.log(`  ${chalk.cyan.dim(`https://app.superplane.com/canvases/${config.canvasId}`)}`);
      if (eventId) console.log(chalk.dim(`\n  Event ID: ${eventId}`));
    }
    console.log();

  } catch (e) {
    spinner.fail(chalk.red('Failed to trigger pipeline'));
    console.error(chalk.red(e.message));
    if (e.message.includes('not found') || e.message.includes('not a trigger')) {
      console.log(chalk.yellow('\nThe canvas trigger node may not be configured correctly.'));
      console.log(chalk.yellow('Run: factory init'));
    }
    process.exit(1);
  }
}

async function followPipeline(client, canvasId, pollMs = 8000) {
  const seen = new Set();
  let lastRunId = null;
  let lines = 0;

  const clearLines = (n) => {
    for (let i = 0; i < n; i++) process.stdout.write('\x1B[1A\x1B[2K');
  };

  while (true) {
    await new Promise(r => setTimeout(r, pollMs));

    try {
      const { runs } = await client.listRuns(canvasId);
      if (!runs?.length) continue;

      const run = runs[0];

      if (lines > 0) clearLines(lines + 2); // clear previous render
      lines = 0;

      // Count lines to clear next iteration
      const execs = run.executions || [];
      const visible = STAGE_ORDER.filter(id => execs.some(e => e.nodeId === id));
      lines = visible.length + 2; // +2 for pre/post newlines

      renderProgress(runs);

      const overall = run.result;
      if (overall === 'RESULT_PASSED') {
        console.log(chalk.bold.green('\n✔ Pipeline complete!'));
        return;
      }
      if (overall === 'RESULT_FAILED') {
        console.log(chalk.bold.red('\n✘ Pipeline failed. Run: factory logs'));
        return;
      }
    } catch (e) {
      // Network hiccup — keep polling
    }
  }
}
