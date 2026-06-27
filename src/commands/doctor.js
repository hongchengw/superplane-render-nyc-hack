import chalk from 'chalk';
import { SuperPlaneClient } from '../superplane/client.js';
import { loadConfig } from '../config.js';

const CHECK = chalk.green('✔');
const FAIL = chalk.red('✘');
const WARN = chalk.yellow('⚠');

async function checkSuperPlane(config) {
  if (!config.superplaneApiKey) return [false, 'No API key — run factory init'];
  try {
    const client = new SuperPlaneClient(config.superplaneApiKey);
    const me = await client.getMe();
    return [true, `Connected as ${me.user?.name || me.user?.id}`];
  } catch (e) {
    return [false, e.message];
  }
}

async function checkCanvas(config) {
  if (!config.canvasId) return [false, 'No canvas — run factory init'];
  try {
    const client = new SuperPlaneClient(config.superplaneApiKey);
    const { canvas } = await client.getCanvas(config.canvasId);
    return [true, `Canvas "${canvas.metadata.name}" (${config.canvasId.slice(0, 8)}...)`];
  } catch (e) {
    return [false, e.message];
  }
}

async function checkSecret(client, name, label) {
  try {
    const { secrets } = await client.listSecrets();
    const found = secrets.some(s => s.name === name);
    return [found, found ? `Secret "${name}" configured` : `Secret "${name}" missing — run factory init`];
  } catch (e) {
    return [false, e.message];
  }
}

async function checkRenderAPI(config) {
  if (!config.renderApiKey) return [null, 'Not configured (optional for runner-based deploy)'];
  try {
    const res = await fetch('https://api.render.com/v1/services?limit=1', {
      headers: { Authorization: `Bearer ${config.renderApiKey}` },
    });
    if (!res.ok) return [false, `Render API error ${res.status}`];
    return [true, 'Render API reachable'];
  } catch (e) {
    return [false, e.message];
  }
}

async function checkGitHub(config) {
  if (!config.githubToken) return [null, 'Not configured (optional — needed for PR creation)'];
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${config.githubToken}` },
    });
    if (!res.ok) return [false, `GitHub API error ${res.status}`];
    const user = await res.json();
    return [true, `GitHub user: @${user.login}`];
  } catch (e) {
    return [false, e.message];
  }
}

export async function runDoctor() {
  console.log(chalk.bold('\n🏥 Software Factory Doctor\n'));

  const config = loadConfig();
  const client = config.superplaneApiKey ? new SuperPlaneClient(config.superplaneApiKey) : null;

  const checks = [
    ['SuperPlane API', checkSuperPlane(config)],
    ['Factory Canvas', checkCanvas(config)],
    ['GitHub Token', checkGitHub(config)],
    ['Render API Key', checkRenderAPI(config)],
  ];

  if (client) {
    checks.push(
      ['Secret: anthropic-api-key', checkSecret(client, 'anthropic-api-key', 'Anthropic')],
      ['Secret: github-token', checkSecret(client, 'github-token', 'GitHub')],
      ['Secret: render-api-key', checkSecret(client, 'render-api-key', 'Render')],
    );
  }

  const results = await Promise.all(checks.map(async ([label, promise]) => {
    const [ok, msg] = await promise;
    return { label, ok, msg };
  }));

  let allGood = true;
  for (const { label, ok, msg } of results) {
    const icon = ok === true ? CHECK : ok === false ? FAIL : WARN;
    console.log(`  ${icon} ${chalk.bold(label.padEnd(30))} ${msg}`);
    if (ok === false) allGood = false;
  }

  console.log();
  if (allGood) {
    console.log(chalk.green.bold('Everything is ready. Run: factory build <github-issue-url>'));
  } else {
    console.log(chalk.yellow('Some checks failed. Run: factory init'));
  }
  console.log();
}
