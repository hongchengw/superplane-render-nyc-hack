import chalk from 'chalk';
import { SuperPlaneClient } from '../superplane/client.js';
import { loadConfig } from '../config.js';

const CHECK = chalk.green('✔');
const FAIL = chalk.red('✘');
const WARN = chalk.yellow('⚠');

async function checkSuperPlane(config) {
  const token = config.superplaneApiKey || process.env.SUPERPLANE_TOKEN;
  if (!token) return [false, 'No API key — run: factory init'];
  try {
    const client = new SuperPlaneClient(token);
    const me = await client.getMe();
    return [true, `Connected as ${me.user?.name || me.user?.id}`];
  } catch (e) {
    return [false, e.message];
  }
}

async function checkCanvas(config, client) {
  if (!config.canvasId) return [false, 'No canvas — run: factory init'];
  try {
    const { canvas } = await client.getCanvas(config.canvasId);
    return [true, `"${canvas.metadata?.name}" (${config.canvasId.slice(0, 8)}...)`];
  } catch (e) {
    return [false, e.message];
  }
}

async function checkSecret(client, name) {
  try {
    const exists = await client.secretExists(name);
    return [exists, exists ? `"${name}" stored` : `"${name}" missing — run: factory init`];
  } catch (e) {
    return [false, e.message];
  }
}

async function checkGitHub(config) {
  const token = config.githubToken || process.env.GITHUB_TOKEN;
  if (!token) return [null, 'Not configured (set GITHUB_TOKEN or re-run factory init)'];
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [false, `GitHub API error ${res.status}`];
    const user = await res.json();
    return [true, `@${user.login}`];
  } catch (e) {
    return [false, e.message];
  }
}

async function checkRender(config) {
  const key = config.renderKey || process.env.RENDER_API_KEY;
  if (!key) return [null, 'Not configured (optional — needed for deploy step)'];
  try {
    const res = await fetch('https://api.render.com/v1/services?limit=1', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [false, `Render API error ${res.status}`];
    return [true, 'Render API reachable'];
  } catch (e) {
    return [false, e.message];
  }
}

export async function runDoctor() {
  console.log(chalk.bold('\n🏥 Software Factory Doctor\n'));

  const config = loadConfig();
  const token = config.superplaneApiKey || process.env.SUPERPLANE_TOKEN;
  const client = token ? new SuperPlaneClient(token) : null;

  const checks = [
    ['SuperPlane API',          checkSuperPlane(config)],
    ['Factory Canvas',          client ? checkCanvas(config, client) : Promise.resolve([false, 'No token'])],
    ['GitHub Token',            checkGitHub(config)],
    ['Render API Key',          checkRender(config)],
  ];

  if (client) {
    checks.push(
      ['anthropic-api-key',   checkSecret(client, 'anthropic-api-key')],
      ['github-token',        checkSecret(client, 'github-token')],
      ['render-api-key',      checkSecret(client, 'render-api-key')],
    );
  }

  const results = await Promise.all(checks.map(async ([label, promise]) => {
    const [ok, msg] = await promise;
    return { label, ok, msg };
  }));

  let allGood = true;
  for (const { label, ok, msg } of results) {
    const icon = ok === true ? CHECK : ok === false ? FAIL : WARN;
    console.log(`  ${icon} ${chalk.bold(label.padEnd(28))} ${msg}`);
    if (ok === false) allGood = false;
  }

  console.log();

  if (config.targetRepo) {
    console.log(chalk.dim(`  Target repo:  ${config.targetRepo}`));
  }
  if (config.canvasId) {
    console.log(chalk.dim(`  Canvas URL:   https://app.superplane.com/canvases/${config.canvasId}`));
  }
  console.log();

  if (allGood) {
    console.log(chalk.green.bold('All checks passed.'));
    console.log(chalk.dim('\nRun: factory build <github-issue-url>'));
  } else {
    console.log(chalk.yellow('Some checks failed.'));
    console.log(chalk.dim('\nRun: factory init'));
  }
  console.log();
}
