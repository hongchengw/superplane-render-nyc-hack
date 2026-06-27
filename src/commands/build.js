import chalk from 'chalk';
import ora from 'ora';
import { SuperPlaneClient } from '../superplane/client.js';
import { requireConfig, loadConfig, saveConfig } from '../config.js';

function parseIssueUrl(input) {
  // Accept full URL or "owner/repo#123" or just a URL
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

export async function runBuild(issueInput, options = {}) {
  const config = requireConfig(['superplaneApiKey', 'canvasId']);
  const client = new SuperPlaneClient(config.superplaneApiKey);

  // Parse issue URL
  const parsed = parseIssueUrl(issueInput);
  if (!parsed) {
    console.error(chalk.red(`Invalid issue URL or reference: ${issueInput}`));
    console.error(chalk.dim('Expected: https://github.com/owner/repo/issues/123'));
    console.error(chalk.dim('      or: owner/repo#123'));
    process.exit(1);
  }

  const repo = options.repo || config.targetRepo || parsed.repo;

  console.log(chalk.bold.cyan('\n🏭 Software Factory — Starting Pipeline\n'));
  console.log(`  Issue:   ${chalk.cyan(parsed.url)}`);
  console.log(`  Repo:    ${chalk.cyan(repo)}`);
  console.log(`  Canvas:  ${chalk.dim(config.canvasId.slice(0, 8) + '...')}`);
  console.log();

  const spinner = ora('Triggering SuperPlane pipeline...').start();

  try {
    const result = await client.triggerCanvas(
      config.canvasId,
      config.canvasTriggerNodeId || 'start',
      {
        issue_url: parsed.url,
        repo,
      }
    );

    const eventId = result.result?.event_id;
    spinner.succeed(chalk.green('Pipeline triggered!'));

    // Save the last run info for `factory status`
    const updated = { ...config, lastEventId: eventId, lastIssueUrl: parsed.url, lastRepo: repo };
    saveConfig(updated);

    console.log();
    console.log(chalk.bold('Pipeline stages running in SuperPlane:'));
    console.log(`  ${chalk.dim('1.')} Fetch Issue          → reading GitHub issue details`);
    console.log(`  ${chalk.dim('2.')} Requirement Agent    → generating implementation spec`);
    console.log(`  ${chalk.dim('3.')} Implementation Agent → writing code changes`);
    console.log(`  ${chalk.dim('4.')} Validation Agent     → running tests & build`);
    console.log(`  ${chalk.dim('5.')} Deploy to Render     → deploying preview`);
    console.log(`  ${chalk.dim('6.')} PR Agent             → creating pull request`);
    console.log();

    if (eventId) {
      console.log(chalk.dim(`Event ID: ${eventId}`));
    }

    console.log(`\n${chalk.bold('Monitor progress:')}`);
    console.log(`  ${chalk.cyan('factory status')}      — check pipeline status`);
    console.log(`  ${chalk.cyan('factory logs')}        — stream live logs`);
    console.log(`  ${chalk.cyan.dim(`https://app.superplane.com/canvases/${config.canvasId}`)}`);
    console.log();

  } catch (e) {
    spinner.fail(chalk.red('Failed to trigger pipeline'));
    console.error(chalk.red(e.message));
    if (e.message.includes('hook not found') || e.message.includes('not a trigger')) {
      console.log(chalk.yellow('\nThe canvas trigger node may not be configured correctly.'));
      console.log(chalk.yellow('Run factory init to recreate the canvas.'));
    }
    process.exit(1);
  }
}
